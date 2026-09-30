import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { evidence, getDb, providers } from "@railor/database";
import { CONFIDENCE_BAND_LABEL, confidenceBand, decayConfidence, type ConfidenceBand, type SourceType } from "@railor/types";
import { Freshness } from "@railor/ui";
import { getSession } from "../../../lib/auth";
import { ProductEmpty, ProductHeader } from "../../../components/app/product-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Evidence" };

const SOURCE_TYPES: Array<[SourceType, string]> = [
  ["official_docs", "Official docs"],
  ["api", "Official API"],
  ["pricing", "Pricing"],
  ["help_center", "Help centre"],
  ["terms", "Terms"],
  ["status_page", "Status page"],
  ["github", "GitHub"],
  ["official_announcement", "Announcement"],
  ["manual_verified", "Manually verified"],
];
const TYPE_LABEL = Object.fromEntries(SOURCE_TYPES) as Record<string, string>;
const BANDS: ConfidenceBand[] = ["verified", "high", "medium", "needs_review", "potentially_outdated"];
const BAND_TONE: Record<ConfidenceBand, string> = {
  verified: "good",
  high: "good",
  medium: "warn",
  needs_review: "warn",
  potentially_outdated: "bad",
};

function hrefWith(current: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const next = { ...current, ...patch };
  const qs = new URLSearchParams(Object.entries(next).filter((e): e is [string, string] => Boolean(e[1])));
  return `/app/evidence${qs.size ? `?${qs}` : ""}`;
}

/**
 * Every source record behind every claim, with confidence decayed to today.
 * Filters are links (one click, shareable URL); nothing here is editable —
 * evidence is append-only and corrections go through the review queue.
 */
export default async function EvidencePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const params = await searchParams;
  const band = BANDS.includes(params.band as ConfidenceBand) ? (params.band as ConfidenceBand) : undefined;
  const type = SOURCE_TYPES.some(([t]) => t === params.type) ? (params.type as SourceType) : undefined;
  const q = params.q?.trim().slice(0, 80) || undefined;

  const db = await getDb();
  const conditions: SQL[] = [isNull(evidence.supersededBy)];
  if (type) conditions.push(eq(evidence.sourceType, type));
  if (q) {
    const term = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(or(ilike(providers.name, term), ilike(evidence.sourceTitle, term), ilike(evidence.sourceUrl, term))!);
  }
  const rows = await db
    .select({ evidence, providerName: providers.name, providerSlug: providers.slug, providerIsDemo: providers.isDemo })
    .from(evidence)
    .leftJoin(providers, eq(evidence.providerId, providers.id))
    .where(and(...conditions))
    .orderBy(desc(evidence.lastVerifiedAt))
    .limit(600);

  const now = new Date();
  const scored = rows.map((row) => {
    const confidence = decayConfidence(Number(row.evidence.confidence), row.evidence.lastVerifiedAt, row.evidence.sourceType as SourceType, now);
    return { ...row, confidence, band: confidenceBand(confidence, row.evidence.lastVerifiedAt, now) };
  });
  const counts = Object.fromEntries(BANDS.map((b) => [b, scored.filter((r) => r.band === b).length])) as Record<ConfidenceBand, number>;
  const visible = (band ? scored.filter((r) => r.band === band) : scored).slice(0, 100);
  const current = { band, type, q };

  return (
    <div className="product-page space-y-6">
      <ProductHeader
        eyebrow="Trust layer / sources"
        title="Evidence"
        description="Every record behind every claim: where it came from, when it was retrieved and last verified, and how much confidence is left after decay. Evidence is append-only — nothing here is overwritten silently."
        value={scored.length}
        valueLabel={scored.length === 600 ? "latest records" : "source records"}
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-faint)]">Confidence</span>
          <FilterChip href={hrefWith(current, { band: undefined })} active={!band}>
            All <span className="tabular opacity-60">{scored.length}</span>
          </FilterChip>
          {BANDS.map((b) => (
            <FilterChip key={b} href={hrefWith(current, { band: b })} active={band === b}>
              {CONFIDENCE_BAND_LABEL[b]} <span className="tabular opacity-60">{counts[b]}</span>
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-faint)]">Source</span>
          <FilterChip href={hrefWith(current, { type: undefined })} active={!type}>
            Any
          </FilterChip>
          {SOURCE_TYPES.map(([t, label]) => (
            <FilterChip key={t} href={hrefWith(current, { type: t })} active={type === t}>
              {label}
            </FilterChip>
          ))}
        </div>
        <form className="flex max-w-xl gap-2" action="/app/evidence">
          {band ? <input type="hidden" name="band" value={band} /> : null}
          {type ? <input type="hidden" name="type" value={type} /> : null}
          <input
            name="q"
            defaultValue={q}
            aria-label="Search evidence"
            placeholder="Provider, source title or URL"
            className="product-field !mt-0 min-w-0 flex-1"
          />
          <button type="submit" className="rounded-lg border border-[var(--color-line-strong)] bg-white px-5 text-sm font-semibold transition-colors hover:bg-[var(--color-paper)]">
            Search
          </button>
        </form>
      </div>

      {visible.length ? (
        <ul className="product-panel divide-y divide-[var(--color-line)]">
          {visible.map(({ evidence: e, providerName, providerSlug, providerIsDemo, confidence, band: b }) => {
            let host = e.sourceUrl;
            try {
              host = new URL(e.sourceUrl).host;
            } catch {
              /* keep raw */
            }
            return (
              <li key={e.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] lg:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {providerSlug ? (
                      <Link href={`/app/providers/${providerSlug}`} className="text-[14px] font-semibold hover:underline">
                        {providerName}
                      </Link>
                    ) : (
                      <span className="text-[14px] font-semibold">Country research</span>
                    )}
                    {providerIsDemo ? <span className="rounded-full border border-[var(--color-line)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">demo</span> : null}
                    <span className="rounded-full bg-[var(--color-sand)] px-2 py-0.5 text-[11px] text-[var(--color-ink-soft)]">{TYPE_LABEL[e.sourceType] ?? e.sourceType}</span>
                  </div>
                  <a href={e.sourceUrl} target="_blank" rel="noreferrer noopener" className="mt-1 block truncate text-[13px] text-[var(--color-ink-soft)] hover:text-[var(--color-orange-deep)] hover:underline">
                    {e.sourceTitle} <span className="text-[var(--color-faint)]">↗ {host}</span>
                  </a>
                  {e.rawExcerpt ? (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-[11.5px] font-semibold text-[var(--color-muted)]">Excerpt</summary>
                      <blockquote className="mt-1.5 border-l-2 border-[var(--color-orange)] pl-3 text-[12.5px] leading-relaxed text-[var(--color-ink-soft)]">{e.rawExcerpt}</blockquote>
                    </details>
                  ) : null}
                </div>
                <div className="flex flex-col gap-0.5 text-[12px] text-[var(--color-muted)]">
                  <span>Retrieved {e.retrievedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                  <Freshness date={e.lastVerifiedAt} />
                  <span className="capitalize">{e.verificationType.replaceAll("_", " ")}</span>
                </div>
                <div className="flex items-center gap-3 lg:flex-col lg:items-end">
                  <span className="product-badge" data-tone={BAND_TONE[b]}>{CONFIDENCE_BAND_LABEL[b]}</span>
                  <span className="product-mono text-[var(--color-muted)]" title={`Published ${Number(e.confidence).toFixed(2)}, decayed to ${confidence.toFixed(2)}`}>
                    {Number(e.confidence).toFixed(2)} → {confidence.toFixed(2)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ProductEmpty
          mark="§"
          title={scored.length ? "No evidence matches these filters" : "No evidence recorded yet"}
          description={
            scored.length
              ? "Clear a filter to see more records. Confidence bands are recomputed on every visit as evidence ages."
              : "Evidence appears as the ingestion worker snapshots provider sources or as the dataset is seeded. Each record then backs the capabilities it supports."
          }
          action={scored.length ? <Link href="/app/evidence" className="product-quiet-link">Clear filters</Link> : undefined}
        />
      )}
      {scored.length > visible.length && !band ? (
        <p className="text-[12px] text-[var(--color-muted)]">Showing the 100 most recently verified records. Narrow with a filter or search to see others.</p>
      ) : null}
    </div>
  );
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition ${
        active
          ? "border-[var(--color-orange)] bg-[var(--color-lavender)] text-[var(--color-orange-deep)]"
          : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:border-[var(--color-line-strong)]"
      }`}
    >
      {children}
    </Link>
  );
}
