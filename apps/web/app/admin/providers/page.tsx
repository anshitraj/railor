import { and, eq, sql } from "drizzle-orm";
import { PAYOUT_ADAPTERS, getAdapter, getPlatformPaymentFlags } from "@railor/core";
import { getDb, paymentAttempts, providerConnections, providers } from "@railor/database";
import { AdminHeader } from "../../../components/admin/admin-shell";
import { ProviderLiveToggle } from "../../../components/admin/payment-controls";
import { ProviderLogo } from "../../../components/app/provider-logo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operations · Providers" };

export default async function AdminProvidersPage() {
  const db = await getDb();
  const [flags, all, connections, sandboxAttempts, liveAttempts] = await Promise.all([
    getPlatformPaymentFlags(),
    db.select().from(providers).where(eq(providers.isDemo, false)),
    db
      .select({ providerId: providerConnections.providerId, environment: providerConnections.environment, n: sql<number>`count(*)::int` })
      .from(providerConnections)
      .where(eq(providerConnections.status, "connected"))
      .groupBy(providerConnections.providerId, providerConnections.environment),
    db
      .select({ slug: paymentAttempts.providerSlug, status: paymentAttempts.status, n: sql<number>`count(*)::int` })
      .from(paymentAttempts)
      .where(and(eq(paymentAttempts.executor, "provider"), eq(paymentAttempts.environment, "sandbox")))
      .groupBy(paymentAttempts.providerSlug, paymentAttempts.status),
    db
      .select({ slug: paymentAttempts.providerSlug, status: paymentAttempts.status, n: sql<number>`count(*)::int` })
      .from(paymentAttempts)
      .where(and(eq(paymentAttempts.executor, "provider"), eq(paymentAttempts.environment, "production")))
      .groupBy(paymentAttempts.providerSlug, paymentAttempts.status),
  ]);
  const integrated = all.filter((p) => PAYOUT_ADAPTERS[p.slug]);
  const quoteOnly = all.filter((p) => !PAYOUT_ADAPTERS[p.slug] && getAdapter(p.slug));
  const tally = (rows: typeof sandboxAttempts, slug: string, status?: string) => rows.filter((r) => r.slug === slug && (!status || r.status === status)).reduce((a, r) => a + r.n, 0);

  return (
    <>
      <AdminHeader
        title="Providers"
        description="Which providers Railor can execute payouts through, and which are approved for live money. Approve a provider only after real sandbox payouts through it completed — the evidence is counted here."
      />
      <section className="flex flex-col gap-3">
        {integrated.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--color-line-strong)] p-5 text-[13px] text-[var(--color-muted)]">
            No provider in this database has a payout adapter yet. Railor ships adapters for {Object.keys(PAYOUT_ADAPTERS).join(" and ")}; they appear here once those provider records are ingested.
          </p>
        ) : null}
        {integrated.map((p) => {
          const adapter = PAYOUT_ADAPTERS[p.slug]!;
          const approved = flags.liveProviders.includes(p.slug);
          const sbxCompleted = tally(sandboxAttempts, p.slug, "completed");
          const sbxTotal = tally(sandboxAttempts, p.slug);
          const conn = (env: string) => connections.filter((c) => c.providerId === p.id && c.environment === env).reduce((a, c) => a + c.n, 0);
          return (
            <article key={p.id} className="grid gap-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <ProviderLogo slug={p.slug} name={p.name} size={28} />
                  <h2 className="text-[16px] font-semibold">{p.name}</h2>
                  <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase ${approved ? "bg-[var(--color-ok-bg)] text-[var(--color-ok)]" : "bg-[var(--color-canvas)] text-[var(--color-muted)]"}`}>{approved ? "Live approved" : "Sandbox only"}</span>
                  <span className="rounded-full border border-[var(--color-line)] px-2 py-0.5 text-[11px]">{adapter.verification.replaceAll("_", " ")}</span>
                </div>
                <p className="text-[12.5px] text-[var(--color-muted)]">Methods: {adapter.supportedMethods.join(", ")} · webhooks {adapter.verifyWebhook ? "verified by signature" : "not used (polling)"}</p>
                <dl className="mt-1 grid grid-cols-2 gap-3 text-[12.5px] sm:grid-cols-4">
                  <Fact label="Sandbox connections" value={conn("sandbox")} />
                  <Fact label="Production connections" value={conn("production")} />
                  <Fact label="Sandbox payouts" value={`${sbxCompleted}/${sbxTotal} completed`} />
                  <Fact label="Live payouts" value={`${tally(liveAttempts, p.slug, "completed")}/${tally(liveAttempts, p.slug)} completed`} />
                </dl>
              </div>
              <ProviderLiveToggle slug={p.slug} approved={approved} sandboxEvidence={`${sbxCompleted} sandbox payouts through ${p.name} completed end to end`} />
            </article>
          );
        })}
      </section>
      <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
        <h2 className="text-[15px] font-semibold">Quote / connection only · {quoteOnly.length}</h2>
        <p className="mt-1 text-[12.5px] text-[var(--color-muted)]">Railor can test these connections{quoteOnly.some((p) => getAdapter(p.slug)?.getQuote) ? " and fetch quotes" : ""}, but has no payout adapter for them yet.</p>
        <p className="mt-2 text-[13px]">{quoteOnly.map((p) => p.name).join(" · ") || "—"}</p>
        <p className="mt-3 text-[12px] text-[var(--color-faint)]">{all.length - integrated.length - quoteOnly.length} further providers are research-only.</p>
      </section>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-faint)]">{label}</dt>
      <dd className="font-semibold tabular">{value}</dd>
    </div>
  );
}
