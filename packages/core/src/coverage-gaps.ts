/**
 * Phase E: coverage-gap loop + demand telemetry (RETENTION).
 *
 * Every real search either answers a corridor or doesn't. `recordSearchTelemetry`
 * captures both: an aggregated, anonymized demand counter for the corridor
 * shape searched (never per-user, never storing who searched), and a
 * structured per-provider gap record for every `unknown` verdict, carrying
 * evaluateProvider's own reasons verbatim rather than a reinterpretation.
 *
 * `revalidateCoverageGaps` closes the loop: it re-runs the exact same stored
 * query against CURRENT provider data for every open gap, and when a gap's
 * verdict is no longer `unknown`, marks it resolved and writes one
 * `change_events` row (kind: coverage_changed, reviewStatus: "pending") — the
 * same human-review gate every other change_event goes through. Every
 * existing watch (provider or corridor) that matches picks it up automatically
 * through the alert fan-out that's already live in apps/web/lib/alerting.ts —
 * nothing new to wire there, since it keys off `change.affects` values, not
 * where the change_event came from.
 */
import { desc, eq, sql } from "drizzle-orm";
import { changeEvents, coverageGaps, corridorDemand, getDb, providers } from "@railor/database";
import type { CorridorQuery, EligibilityReason, ProviderResult } from "@railor/types";
import { evaluateProvider } from "./eligibility.js";
import { loadProviderInputs } from "./repository.js";

/** Same dimension keys apps/web/lib/alerting.ts's CORRIDOR_DIMS matches against — kept identical so a coverage_changed event from here automatically reaches existing corridor watches, with no changes needed there. */
const CORRIDOR_AFFECTS_KEYS = [
  "entityCountry",
  "customerType",
  "destinationCountry",
  "destinationCurrency",
  "sourceAsset",
  "sourceNetwork",
  "paymentMethod",
  "product",
] as const;

function affectsFor(query: CorridorQuery): Record<string, string> {
  const affects: Record<string, string> = {};
  for (const key of CORRIDOR_AFFECTS_KEYS) {
    const value = query[key];
    if (typeof value === "string") affects[key] = value;
  }
  return affects;
}

/**
 * Called once per real (non-demo) search from searchCorridors. Never throws —
 * a telemetry write failing must never turn into a failed search for the
 * customer who triggered it.
 */
export async function recordSearchTelemetry(
  query: CorridorQuery,
  key: string,
  results: Array<Pick<ProviderResult, "provider" | "eligibility" | "reasons">>,
): Promise<void> {
  // A corridor needs at least a real destination to mean anything — an
  // empty/default query (e.g. a blank page load) isn't a demand signal.
  if (!query.destinationCountry) return;

  try {
    const db = await getDb();
    const hasAmount = query.amount !== undefined;

    await db
      .insert(corridorDemand)
      .values({
        corridorKey: key,
        query: query as Record<string, unknown>,
        searchCount: 1,
        totalRequestedVolume: hasAmount ? query.amount!.toString() : null,
        volumeSearchCount: hasAmount ? 1 : 0,
      })
      .onConflictDoUpdate({
        target: corridorDemand.corridorKey,
        set: {
          searchCount: sql`${corridorDemand.searchCount} + 1`,
          totalRequestedVolume: hasAmount
            ? sql`coalesce(${corridorDemand.totalRequestedVolume}, 0) + ${query.amount}`
            : corridorDemand.totalRequestedVolume,
          volumeSearchCount: hasAmount ? sql`${corridorDemand.volumeSearchCount} + 1` : corridorDemand.volumeSearchCount,
          lastSearchedAt: new Date(),
        },
      });

    for (const result of results) {
      if (result.eligibility !== "unknown") continue;
      await db
        .insert(coverageGaps)
        .values({
          providerId: result.provider.id,
          corridorKey: key,
          query: query as Record<string, unknown>,
          reasons: result.reasons as unknown as Record<string, unknown>[],
        })
        .onConflictDoUpdate({
          target: [coverageGaps.providerId, coverageGaps.corridorKey],
          set: {
            reasons: result.reasons as unknown as Record<string, unknown>[],
            timesRequested: sql`${coverageGaps.timesRequested} + 1`,
            lastRequestedAt: new Date(),
            // A gap that resurfaces after being marked resolved is genuinely
            // open again — never leave it silently marked resolved while a
            // real search keeps hitting it as unknown.
            status: "open",
            resolvedAt: null,
            resolvedChangeEventId: null,
          },
        });
    }
  } catch {
    // Best-effort — see this function's own doc comment.
  }
}

export interface RevalidateCoverageGapsSummary {
  checked: number;
  resolved: number;
  stillOpen: number;
}

/** Re-checks open gaps against current data; every dimension mismatch below is a real reason to stay open, never guessed past. */
export async function revalidateCoverageGaps(options: { limit?: number } = {}): Promise<RevalidateCoverageGapsSummary> {
  const db = await getDb();
  const openGaps = await db.select().from(coverageGaps).where(eq(coverageGaps.status, "open")).limit(options.limit ?? 200);
  if (!openGaps.length) return { checked: 0, resolved: 0, stillOpen: 0 };

  const providerInputs = await loadProviderInputs();
  const providersById = new Map(providerInputs.map((p) => [p.id, p]));

  let resolved = 0;
  for (const gap of openGaps) {
    const provider = providersById.get(gap.providerId);
    // Provider removed since the gap was recorded — nothing left to re-check.
    if (!provider) continue;

    const query = gap.query as CorridorQuery;
    const evaluation = evaluateProvider(provider, query);
    if (evaluation.verdict === "unknown") continue;

    const [change] = await db
      .insert(changeEvents)
      .values({
        providerId: provider.id,
        kind: "coverage_changed",
        field: "corridor_availability",
        previousValue: "unknown",
        currentValue: evaluation.verdict,
        summary: `${provider.name}'s answer for a previously-unanswerable route is now "${evaluation.verdict}" — re-verify before relying on it as fully resolved.`,
        confidence: evaluation.confidence.toFixed(2),
        reviewStatus: "pending",
        affects: affectsFor(query),
      })
      .returning({ id: changeEvents.id });

    await db
      .update(coverageGaps)
      .set({ status: "resolved", resolvedAt: new Date(), resolvedChangeEventId: change!.id })
      .where(eq(coverageGaps.id, gap.id));
    resolved++;
  }

  return { checked: openGaps.length, resolved, stillOpen: openGaps.length - resolved };
}

export interface TopCoverageGap {
  id: string;
  providerId: string;
  providerName: string;
  providerSlug: string;
  corridorKey: string;
  query: CorridorQuery;
  reasons: EligibilityReason[];
  timesRequested: number;
  firstRequestedAt: Date;
  lastRequestedAt: Date;
}

/** Real, currently-open demand for a route Railor still can't answer — ordered by how often it's actually been asked for, never a guessed priority score. */
export async function loadTopCoverageGaps(limit = 20): Promise<TopCoverageGap[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: coverageGaps.id,
      providerId: coverageGaps.providerId,
      providerName: providers.name,
      providerSlug: providers.slug,
      corridorKey: coverageGaps.corridorKey,
      query: coverageGaps.query,
      reasons: coverageGaps.reasons,
      timesRequested: coverageGaps.timesRequested,
      firstRequestedAt: coverageGaps.firstRequestedAt,
      lastRequestedAt: coverageGaps.lastRequestedAt,
    })
    .from(coverageGaps)
    .innerJoin(providers, eq(coverageGaps.providerId, providers.id))
    .where(eq(coverageGaps.status, "open"))
    .orderBy(desc(coverageGaps.timesRequested), desc(coverageGaps.lastRequestedAt))
    .limit(limit);

  return rows.map((r) => ({ ...r, query: r.query as CorridorQuery, reasons: r.reasons as unknown as EligibilityReason[] }));
}

export interface CorridorDemandRow {
  id: string;
  corridorKey: string;
  query: CorridorQuery;
  searchCount: number;
  /** Average requested amount across searches that specified one — null when none did. Never divided by total searchCount, which would understate demand by treating no-amount searches as zero. */
  averageRequestedVolume: number | null;
  volumeSearchCount: number;
  firstSearchedAt: Date;
  lastSearchedAt: Date;
}

/** Real, aggregated, anonymous search-intent demand — every real search, not just the unanswered ones. Internal-only: this is Railor's own view into what customers ask for, never a customer-facing claim. */
export async function loadTopCorridorDemand(limit = 20): Promise<CorridorDemandRow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(corridorDemand)
    .orderBy(desc(corridorDemand.searchCount), desc(corridorDemand.lastSearchedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    corridorKey: r.corridorKey,
    query: r.query as CorridorQuery,
    searchCount: r.searchCount,
    averageRequestedVolume:
      r.volumeSearchCount > 0 && r.totalRequestedVolume !== null ? Number(r.totalRequestedVolume) / r.volumeSearchCount : null,
    volumeSearchCount: r.volumeSearchCount,
    firstSearchedAt: r.firstSearchedAt,
    lastSearchedAt: r.lastSearchedAt,
  }));
}
