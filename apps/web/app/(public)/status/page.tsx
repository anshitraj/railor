import Link from "next/link";
import { and, desc, eq, isNull, max, ne, sql } from "drizzle-orm";
import { changeEvents, evidence, getDb, incidents, providers, sourceDocuments } from "@railor/database";
import { SectionLabel } from "@railor/ui";

export const metadata = { title: "Status" };
export const dynamic = "force-dynamic";

type Health = "operational" | "degraded" | "down" | "unknown";

const TONE: Record<Health, { label: string; dot: string; text: string }> = {
  operational: { label: "Operational", dot: "bg-[var(--color-ok)]", text: "text-[var(--color-ok)]" },
  degraded: { label: "Degraded", dot: "bg-[var(--color-warn)]", text: "text-[var(--color-warn)]" },
  down: { label: "Unavailable", dot: "bg-[var(--color-bad)]", text: "text-[var(--color-bad)]" },
  unknown: { label: "Unknown", dot: "bg-[var(--color-unknown)]", text: "text-[var(--color-unknown)]" },
};

function ago(date: Date | null | undefined) {
  if (!date) return "never";
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

/**
 * Public status: measured on every request, never hand-set. Railor's own
 * services first, then the provider incidents Railor is tracking.
 */
async function measure() {
  const started = Date.now();
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    const latency = Date.now() - started;
    const [[freshest], [lastChange], [lastCrawl], openIncidents] = await Promise.all([
      db.select({ at: max(evidence.lastVerifiedAt) }).from(evidence),
      db.select({ at: max(changeEvents.detectedAt) }).from(changeEvents),
      db.select({ at: max(sourceDocuments.lastCheckedAt) }).from(sourceDocuments),
      db
        .select({ id: incidents.id, title: incidents.title, severity: incidents.severity, status: incidents.status, startedAt: incidents.startedAt, sourceUrl: incidents.sourceUrl, provider: providers.name })
        .from(incidents)
        .innerJoin(providers, eq(incidents.providerId, providers.id))
        .where(and(isNull(incidents.resolvedAt), ne(incidents.status, "resolved")))
        .orderBy(desc(incidents.startedAt))
        .limit(20),
    ]);
    return { ok: true as const, latency, freshest: freshest?.at ?? null, lastChange: lastChange?.at ?? null, lastCrawl: lastCrawl?.at ?? null, openIncidents };
  } catch {
    return { ok: false as const, latency: Date.now() - started, freshest: null, lastChange: null, lastCrawl: null, openIncidents: [] };
  }
}

export default async function StatusPage() {
  const m = await measure();
  const dayMs = 86_400_000;
  const dataAge = m.freshest ? Date.now() - m.freshest.getTime() : null;
  const services: Array<{ name: string; detail: string; health: Health }> = [
    { name: "Web app", detail: "You are reading this page, so the app is serving requests.", health: "operational" },
    { name: "Database", detail: m.ok ? `Responded in ${m.latency} ms.` : "Did not respond to a health query.", health: m.ok ? (m.latency > 1500 ? "degraded" : "operational") : "down" },
    { name: "REST API & MCP", detail: m.ok ? "Served by the same runtime and database as the app." : "Depends on the database, which is unavailable.", health: m.ok ? "operational" : "down" },
    {
      name: "Evidence freshness",
      detail: m.freshest ? `Most recent verification ${ago(m.freshest)}.` : "No verified evidence recorded yet.",
      health: !m.ok ? "unknown" : dataAge === null ? "unknown" : dataAge > 30 * dayMs ? "degraded" : "operational",
    },
    {
      name: "Change monitoring",
      detail: m.lastCrawl ? `Sources last checked ${ago(m.lastCrawl)} · last change detected ${ago(m.lastChange)}.` : `No crawl recorded on this deployment yet · last change detected ${ago(m.lastChange)}.`,
      health: !m.ok ? "unknown" : m.lastCrawl && Date.now() - m.lastCrawl.getTime() > 7 * dayMs ? "degraded" : m.lastCrawl ? "operational" : "unknown",
    },
  ];
  const overall: Health = services.some((s) => s.health === "down") ? "down" : services.some((s) => s.health === "degraded") ? "degraded" : "operational";

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <SectionLabel>Status</SectionLabel>
        <h1 className="flex flex-wrap items-center gap-3 text-[34px] font-semibold leading-tight tracking-tight">
          <span className="relative flex size-3">
            {overall === "operational" ? <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-50 ${TONE[overall].dot}`} /> : null}
            <span className={`relative inline-flex size-3 rounded-full ${TONE[overall].dot}`} />
          </span>
          {overall === "operational" ? "All systems operational" : overall === "degraded" ? "Some systems degraded" : "Service disruption"}
        </h1>
        <p className="text-[14px] text-[var(--color-muted)]">
          Measured live at {new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. Nothing on this page is set by hand.
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-[var(--color-line)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
        {services.map((s) => (
          <li key={s.name} className="flex flex-wrap items-center gap-3 px-5 py-4">
            <span className={`size-2.5 shrink-0 rounded-full ${TONE[s.health].dot}`} aria-hidden />
            <span className="min-w-[160px] flex-1">
              <span className="block text-[14.5px] font-medium">{s.name}</span>
              <span className="block text-[12.5px] text-[var(--color-muted)]">{s.detail}</span>
            </span>
            <span className={`text-[12.5px] font-semibold ${TONE[s.health].text}`}>{TONE[s.health].label}</span>
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-3">
        <h2 className="text-[18px] font-semibold">Provider incidents Railor is tracking</h2>
        {m.openIncidents.length ? (
          <ul className="flex flex-col gap-2">
            {m.openIncidents.map((i) => (
              <li key={i.id} className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold">{i.provider}</span>
                  <span className="rounded-full border border-[var(--color-line)] px-2 py-0.5 text-[11px] capitalize">{i.severity}</span>
                  <span className="text-[12px] capitalize text-[var(--color-muted)]">{i.status} · started {ago(i.startedAt)}</span>
                </div>
                <p className="mt-1 text-[13px] text-[var(--color-ink-soft)]">{i.title}</p>
                {i.sourceUrl ? (
                  <a href={i.sourceUrl} target="_blank" rel="noreferrer noopener" className="mt-1 inline-block text-[12px] font-semibold text-[var(--color-orange-deep)] underline underline-offset-2">
                    Provider status source ↗
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-line-strong)] px-5 py-4 text-[13.5px] text-[var(--color-muted)]">
            No open provider incidents. When a monitored provider&apos;s status page reports one, it appears here and blocks decisions under policies that deny routing during incidents.
          </p>
        )}
      </section>

      <p className="text-[12.5px] text-[var(--color-muted)]">
        Want alerts instead of checking? <Link href="/app/monitoring" className="font-semibold text-[var(--color-orange-deep)] underline underline-offset-2">Monitor a provider</Link>.
      </p>
    </div>
  );
}
