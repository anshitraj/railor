import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import {
  alerts,
  changeEvents,
  getDb,
  providers,
  savedCorridors,
  watchlists,
} from "@railor/database";

type WatchRow = typeof watchlists.$inferSelect;
type ChangeRow = typeof changeEvents.$inferSelect;

/** Corridor dimensions a change can touch, matched against `change.affects` values. */
const CORRIDOR_DIMS = [
  "entityCountry",
  "customerType",
  "destinationCountry",
  "destinationCurrency",
  "sourceAsset",
  "sourceNetwork",
  "paymentMethod",
  "product",
] as const;

/**
 * Pure matcher: does this change belong on this watch?
 *
 * - The watch's `kinds` filter always applies first.
 * - provider: the change is about that provider.
 * - country / asset / product: the dimension value appears in `affects`.
 * - corridor: any of the corridor's dimensions appears in `affects` — the
 *   same "touches your markets" semantics onboarding uses.
 * A change with empty `affects` matches nothing except a direct provider watch.
 */
export function watchMatchesChange(
  watch: Pick<WatchRow, "targetType" | "targetId" | "kinds">,
  change: Pick<ChangeRow, "kind" | "affects">,
  providerSlug: string,
  corridorQuery: Record<string, unknown> | null,
): boolean {
  if (watch.kinds.length > 0 && !watch.kinds.includes(change.kind)) return false;
  const affectsValues = Object.values(change.affects ?? {});

  switch (watch.targetType) {
    case "provider":
      return watch.targetId === providerSlug;
    case "country":
    case "asset":
    case "product":
      return affectsValues.includes(watch.targetId);
    case "corridor": {
      if (!corridorQuery) return false;
      const dims = CORRIDOR_DIMS.map((k) => corridorQuery[k]).filter(
        (v): v is string => typeof v === "string",
      );
      return affectsValues.some((v) => dims.includes(v));
    }
    default:
      return false;
  }
}

async function loadCorridorQueries(watchRows: WatchRow[]) {
  const corridorIds = watchRows
    .filter((w) => w.targetType === "corridor")
    .map((w) => w.targetId);
  if (!corridorIds.length) return new Map<string, Record<string, unknown>>();
  const db = await getDb();
  const rows = await db
    .select()
    .from(savedCorridors)
    .where(inArray(savedCorridors.id, corridorIds));
  return new Map(rows.map((r) => [r.id, r.query]));
}

async function insertMatchedAlerts(
  matched: Array<{ changeId: string; watch: WatchRow }>,
) {
  if (!matched.length) return 0;
  const db = await getDb();
  const changeIds = [...new Set(matched.map((m) => m.changeId))];
  const existing = await db
    .select({ watchlistId: alerts.watchlistId, changeEventId: alerts.changeEventId })
    .from(alerts)
    .where(inArray(alerts.changeEventId, changeIds));
  const seen = new Set(existing.map((e) => `${e.watchlistId}:${e.changeEventId}`));

  const fresh = matched.filter((m) => !seen.has(`${m.watch.id}:${m.changeId}`));
  if (!fresh.length) return 0;

  await db.insert(alerts).values(
    fresh.map((m) => ({
      organizationId: m.watch.organizationId,
      watchlistId: m.watch.id,
      changeEventId: m.changeId,
    })),
  );
  return fresh.length;
}

/**
 * Publication fan-out: called when a change is approved in the review queue.
 * Every watch — any org — whose target and kinds match the change gets an
 * alert row. Only ever called for *published* changes; pending and rejected
 * diffs never alert anyone.
 */
export async function fanOutAlertsForChange(changeId: string) {
  const db = await getDb();
  const [change] = await db.select().from(changeEvents).where(eq(changeEvents.id, changeId)).limit(1);
  if (!change) return 0;

  const [provider] = await db
    .select({ slug: providers.slug })
    .from(providers)
    .where(eq(providers.id, change.providerId))
    .limit(1);
  if (!provider) return 0;

  const watchRows = await db.select().from(watchlists);
  const corridorQueries = await loadCorridorQueries(watchRows);

  const matched = watchRows
    .filter((w) =>
      watchMatchesChange(w, change, provider.slug, corridorQueries.get(w.targetId) ?? null),
    )
    .map((watch) => ({ changeId: change.id, watch }));

  return insertMatchedAlerts(matched);
}

/**
 * A newly armed watch immediately reports what is already true: recent
 * published changes that match it, as unread alerts. Watching is never a
 * dead end that only speaks in the future tense.
 */
export async function backfillWatchlistAlerts(watchId: string) {
  const db = await getDb();
  const [watch] = await db.select().from(watchlists).where(eq(watchlists.id, watchId)).limit(1);
  if (!watch) return 0;

  const recent = await db
    .select({
      change: changeEvents,
      providerSlug: providers.slug,
    })
    .from(changeEvents)
    .innerJoin(providers, eq(changeEvents.providerId, providers.id))
    .where(eq(changeEvents.reviewStatus, "approved"))
    .orderBy(desc(changeEvents.detectedAt))
    .limit(50);

  const corridorQueries = await loadCorridorQueries([watch]);
  const matched = recent
    .filter(({ change, providerSlug }) =>
      watchMatchesChange(watch, change, providerSlug, corridorQueries.get(watch.targetId) ?? null),
    )
    .map(({ change }) => ({ changeId: change.id, watch }));

  return insertMatchedAlerts(matched);
}
