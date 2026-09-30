import { desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { discoveryJobs, getDb, namedRails, providerCandidates, providers } from "@railor/database";
import { AdminHeader } from "../../../components/admin/admin-shell";
import { CandidateReview, DiscoveryQueueForm } from "../../../components/admin/discovery-controls";
import { ProviderLogo } from "../../../components/app/provider-logo";
import { getIntentOptions } from "../../../lib/reference";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operations · Web discovery" };

const STATUS_TONE: Record<string, string> = {
  queued: "bg-[var(--color-canvas)] text-[var(--color-muted)]",
  running: "bg-sky-50 text-sky-700",
  done: "bg-[var(--color-ok-bg)] text-[var(--color-ok)]",
  failed: "bg-[var(--color-bad-bg)] text-[var(--color-bad)]",
};

function describe(kind: string, q: Record<string, unknown>) {
  if (kind === "corridor") return `${q.entity_country} business → ${q.destination_currency} in ${q.destination_country}${q.source_asset ? ` (from ${q.source_asset})` : ""}`;
  if (kind === "provider") return `Deepen ${q.provider}`;
  return `${q.name} (${q.domain})`;
}

export default async function AdminDiscoveryPage() {
  const db = await getDb();
  const [options, jobs, candidates, providerRows, [railStats]] = await Promise.all([
    getIntentOptions(),
    db.select().from(discoveryJobs).orderBy(desc(discoveryJobs.createdAt)).limit(30),
    db.select().from(providerCandidates).orderBy(sql`${providerCandidates.status} = 'pending' desc`, desc(providerCandidates.lastSeenAt)).limit(60),
    db.select({ slug: providers.slug, name: providers.name }).from(providers).where(eq(providers.isDemo, false)).orderBy(providers.name),
    db.select({ verified: sql<number>`count(*) filter (where ${isNotNull(namedRails.verifiedAt)})::int`, total: sql<number>`count(*)::int` }).from(namedRails),
  ]);
  const lastRun = jobs.find((j) => j.startedAt)?.startedAt;
  const approvedIds = candidates.flatMap((c) => (c.providerId ? [c.providerId] : []));
  const approvedSlugs = new Map(
    approvedIds.length ? (await db.select({ id: providers.id, slug: providers.slug }).from(providers).where(inArray(providers.id, approvedIds))).map((r) => [r.id, r.slug]) : [],
  );
  const pending = candidates.filter((c) => c.status === "pending");

  return (
    <>
      <AdminHeader
        title="Web discovery"
        description="Gemini searches the live web with Google Search grounding; the worker fetches every cited page itself and keeps a claim only when its quote is verbatim on that page. Verified claims about listed providers go to the review queue; new companies land here as candidates."
      />

      <section className="grid gap-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold">Queue a run</h2>
          <DiscoveryQueueForm
            countries={options.countries}
            currencies={options.currencies}
            providers={providerRows.map((p) => ({ value: p.slug, label: p.name }))}
          />
        </div>
        <dl className="grid content-start gap-3 text-[12.5px]">
          <div className="rounded-xl bg-[var(--color-paper)] p-3">
            <dt className="text-[var(--color-faint)]">Worker</dt>
            <dd className="mt-1 font-mono text-[11.5px]">python -m railor_worker.cli discover-queue</dd>
            <dd className="mt-1 text-[var(--color-muted)]">{lastRun ? `last picked up a job ${lastRun.toISOString().slice(0, 16).replace("T", " ")} UTC` : "has not run a job yet — schedule it every few minutes"}</dd>
          </div>
          <div className="rounded-xl bg-[var(--color-paper)] p-3">
            <dt className="text-[var(--color-faint)]">Named rails verified from a fetched page</dt>
            <dd className="mt-1 text-[18px] font-semibold tabular">
              {railStats?.verified ?? 0} <span className="text-[13px] font-normal text-[var(--color-muted)]">of {railStats?.total ?? 0}</span>
            </dd>
            <dd className="mt-1 font-mono text-[11.5px]">python -m railor_worker.cli discover-rails</dd>
          </div>
          <div className="rounded-xl bg-[var(--color-paper)] p-3">
            <dt className="text-[var(--color-faint)]">Candidates awaiting review</dt>
            <dd className="mt-1 text-[18px] font-semibold tabular">{pending.length}</dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold">Provider candidates</h2>
        {candidates.length ? (
          <ul className="flex flex-col gap-3">
            {candidates.map((c) => {
              const official = c.evidence.filter((e) => e.official).length;
              return (
                <li key={c.id} className="grid gap-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                  <div className="flex min-w-0 flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <ProviderLogo slug={c.domain.split(".")[0]!.replace(/[^a-z0-9-]/g, "")} name={c.name} size={32} />
                      <span className="text-[15px] font-semibold">{c.name}</span>
                      <a href={c.websiteUrl} target="_blank" rel="noreferrer noopener" className="font-mono text-[12px] text-[var(--color-muted)] underline decoration-dotted">
                        {c.domain}
                      </a>
                      <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase ${c.status === "pending" ? "bg-amber-50 text-amber-700" : c.status === "approved" ? "bg-[var(--color-ok-bg)] text-[var(--color-ok)]" : "bg-[var(--color-canvas)] text-[var(--color-muted)]"}`}>{c.status}</span>
                      <span className="text-[11.5px] text-[var(--color-faint)]">
                        {c.evidence.length} verified quote{c.evidence.length === 1 ? "" : "s"} · {official} from its own site
                      </span>
                    </div>
                    <ul className="flex flex-col gap-2">
                      {c.evidence.slice(0, 5).map((e) => (
                        <li key={e.hash} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-[12.5px]">
                          <p className="font-medium">{e.statement}</p>
                          <p className="mt-1 text-[12px] italic text-[var(--color-muted)]">“{e.quote}”</p>
                          <a href={e.url} target="_blank" rel="noreferrer noopener" className="mt-1 inline-block max-w-full truncate text-[11px] text-[var(--color-faint)] underline decoration-dotted">
                            {e.official ? "Official page" : "Third-party page"} · {e.url}
                          </a>
                        </li>
                      ))}
                      {c.evidence.length > 5 ? <li className="text-[11.5px] text-[var(--color-faint)]">+{c.evidence.length - 5} more</li> : null}
                    </ul>
                  </div>
                  {c.status === "pending" ? (
                    <CandidateReview id={c.id} hasOfficial={official > 0} />
                  ) : (
                    <div className="flex flex-col gap-1.5 text-[12.5px] text-[var(--color-muted)]">
                      <span>
                        {c.status === "approved" ? "Approved" : "Rejected"} {c.reviewedAt?.toISOString().slice(0, 10) ?? ""}
                        {c.reviewNote ? ` — ${c.reviewNote}` : ""}
                      </span>
                      {c.providerId && approvedSlugs.get(c.providerId) ? (
                        <a href={`/providers/${approvedSlugs.get(c.providerId)}`} className="w-fit font-semibold text-[var(--color-orange-deep)] underline-offset-4 hover:underline">
                          View provider →
                        </a>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-[var(--color-line-strong)] p-6 text-[13px] text-[var(--color-muted)]">No candidates yet. Queue a corridor or an unlisted company above; the worker adds what it can verify.</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold">Recent runs</h2>
        {jobs.length ? (
          <ul className="flex flex-col divide-y divide-[var(--color-line)] overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)]">
            {jobs.map((j) => {
              const s = j.summary as { pages_fetched?: number; claims_verified?: number; claims_rejected?: number; change_events?: number; candidates?: number };
              return (
                <li key={j.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[12.5px]">
                  <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase ${STATUS_TONE[j.status] ?? ""}`}>{j.status}</span>
                  <span className="font-semibold">{describe(j.kind, j.query)}</span>
                  <span className="flex-1" />
                  {j.status === "done" || j.status === "failed" ? (
                    <span className="text-[var(--color-muted)]">
                      {s.pages_fetched ?? 0} pages · {s.claims_verified ?? 0} verified · {s.claims_rejected ?? 0} rejected · {s.change_events ?? 0} to review · {s.candidates ?? 0} candidate claims
                    </span>
                  ) : null}
                  {j.error ? <span className="w-full text-[var(--color-bad)]">{j.error}</span> : null}
                  <time className="font-mono text-[11px] text-[var(--color-faint)]">{j.createdAt.toISOString().slice(0, 16).replace("T", " ")}</time>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[13px] text-[var(--color-muted)]">Nothing queued yet.</p>
        )}
      </section>
    </>
  );
}
