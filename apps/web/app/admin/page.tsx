import Link from "next/link";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getPlatformPaymentFlags, getPlatformUsageSummary, liveMoneyMovementEnabled, listAllPayments, paymentStats } from "@railor/core";
import { changeEvents, getDb, orgPaymentSettings, organizations, payments, sourceDocuments, users } from "@railor/database";
import { AdminHeader } from "../../components/admin/admin-shell";
import { Sparkline, dailyCounts } from "../../components/app/sparkline";
import { ModeChip, PaymentStatusBadge, formatAmount } from "../../components/app/payments/payment-status";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operations · Overview" };

export default async function AdminOverview() {
  const db = await getDb();
  const since14 = new Date(Date.now() - 14 * 86_400_000);
  const since7 = new Date(Date.now() - 7 * 86_400_000);
  const since1 = new Date(Date.now() - 86_400_000);
  const [[orgCount], [newOrgs], [userCount], [liveOrgs], [pendingReview], [crawlerFailures], [unknownPayments], [failed24], stats, flags, usage, recent, paymentDates, orgDates] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(organizations),
    db.select({ n: sql<number>`count(*)::int` }).from(organizations).where(gte(organizations.createdAt, since7)),
    db.select({ n: sql<number>`count(*)::int` }).from(users),
    db.select({ n: sql<number>`count(*)::int` }).from(orgPaymentSettings).where(eq(orgPaymentSettings.liveEnabled, true)),
    db.select({ n: sql<number>`count(*)::int` }).from(changeEvents).where(eq(changeEvents.reviewStatus, "pending")),
    db.select({ n: sql<number>`count(*)::int` }).from(sourceDocuments).where(sql`${sourceDocuments.failureCount} > 0`),
    db.select({ n: sql<number>`count(*)::int` }).from(payments).where(eq(payments.status, "unknown")),
    db.select({ n: sql<number>`count(*)::int` }).from(payments).where(and(eq(payments.status, "failed"), gte(payments.updatedAt, since1))),
    paymentStats({ sinceDays: 30 }),
    getPlatformPaymentFlags(),
    getPlatformUsageSummary(30, 200),
    listAllPayments({ limit: 8 }),
    db.select({ at: payments.createdAt }).from(payments).where(gte(payments.createdAt, since14)),
    db.select({ at: organizations.createdAt }).from(organizations).where(gte(organizations.createdAt, since14)),
  ]);

  const byMode = (mode: string) => stats.filter((s) => s.mode === mode);
  const volume = (mode: string) => {
    const totals = new Map<string, number>();
    for (const s of byMode(mode).filter((s) => s.status === "completed")) totals.set(s.currency, (totals.get(s.currency) ?? 0) + s.volume);
    return totals.size ? [...totals].sort((a, b) => b[1] - a[1]).map(([currency, amount]) => formatAmount(amount, currency)).join(" · ") : "None";
  };
  const count = (mode: string) => byMode(mode).reduce((a, s) => a + s.count, 0);
  const apiRequests = usage.reduce((a, r) => a + r.count, 0);

  const attention = [
    flags.paused ? { tone: "bad", text: `Payments paused: ${flags.pausedReason ?? "no reason recorded"}`, href: "/admin/payments" } : null,
    (unknownPayments?.n ?? 0) > 0 ? { tone: "bad", text: `${unknownPayments!.n} payment(s) with an unknown outcome`, href: "/admin/payments?status=unknown" } : null,
    (failed24?.n ?? 0) > 0 ? { tone: "warn", text: `${failed24!.n} payment(s) failed in the last 24h`, href: "/admin/payments?status=failed" } : null,
    (pendingReview?.n ?? 0) > 0 ? { tone: "warn", text: `${pendingReview!.n} detected change(s) awaiting review`, href: "/admin/review" } : null,
    (crawlerFailures?.n ?? 0) > 0 ? { tone: "warn", text: `${crawlerFailures!.n} source(s) failing to crawl`, href: "/admin/review" } : null,
    !liveMoneyMovementEnabled() ? { tone: "neutral", text: "Live money movement is off on this deployment (RAILOR_LIVE_PAYMENTS)", href: "/admin/payments" } : null,
  ].filter((x): x is { tone: string; text: string; href: string } => Boolean(x));

  const tiles = [
    { label: "Workspaces", value: orgCount?.n ?? 0, hint: `+${newOrgs?.n ?? 0} this week`, series: dailyCounts(orgDates.map((r) => r.at), 14), href: "/admin/organizations" },
    { label: "Users", value: userCount?.n ?? 0, hint: `${liveOrgs?.n ?? 0} workspaces live`, href: "/admin/organizations" },
    { label: "API requests · 30d", value: apiRequests, hint: `${usage.length} active workspaces`, href: "/admin/usage" },
    { label: "Payments · 30d", value: count("live") + count("test"), hint: `${count("live")} live · ${count("test")} test`, series: dailyCounts(paymentDates.map((r) => r.at), 14), href: "/admin/payments" },
  ];

  return (
    <>
      <AdminHeader title="Overview" description="Everything that needs an operator today, and how the platform is being used." />

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-line)] lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="flex items-end justify-between gap-3 bg-[var(--color-surface)] p-5 transition-colors hover:bg-[var(--color-paper)]">
            <span className="flex flex-col gap-1">
              <span className="font-display text-[30px] font-semibold leading-none tracking-[-0.04em] tabular">{t.value.toLocaleString("en-US")}</span>
              <span className="text-[13px] text-[var(--color-ink-soft)]">{t.label}</span>
              <span className="text-[11px] text-[var(--color-faint)]">{t.hint}</span>
            </span>
            {t.series ? <span className="hidden xl:block"><Sparkline values={t.series} label={`${t.label} per day, 14 days`} width={90} height={30} /></span> : null}
          </Link>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] [&>*]:min-w-0">
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
          <h2 className="text-[15px] font-semibold">Needs attention</h2>
          {attention.length ? (
            <ul className="flex flex-col gap-2">
              {attention.map((a) => (
                <li key={a.text}>
                  <Link href={a.href} className="flex items-center gap-3 rounded-xl border border-[var(--color-line)] px-3 py-2.5 text-[13px] transition hover:border-[var(--color-line-strong)]">
                    <span className={`size-2 shrink-0 rounded-full ${a.tone === "bad" ? "bg-[var(--color-bad)]" : a.tone === "warn" ? "bg-[var(--color-warn)]" : "bg-[var(--color-unknown)]"}`} />
                    <span className="flex-1">{a.text}</span>
                    <span className="text-[var(--color-faint)]">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-[var(--color-muted)]">Nothing needs an operator right now.</p>
          )}
          <dl className="mt-2 grid grid-cols-2 gap-3 border-t border-[var(--color-line)] pt-3 text-[12.5px]">
            <div>
              <dt className="text-[var(--color-faint)]">Live volume settled · 30d</dt>
              <dd className="font-semibold tabular">{volume("live")}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-faint)]">Test volume settled · 30d</dt>
              <dd className="font-semibold tabular">{volume("test")}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-faint)]">Live providers</dt>
              <dd className="font-semibold">{flags.liveProviders.join(", ") || "None approved"}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-faint)]">Deployment live switch</dt>
              <dd className={`font-semibold ${liveMoneyMovementEnabled() ? "text-[var(--color-ok)]" : ""}`}>{liveMoneyMovementEnabled() ? "Enabled" : "Off"}</dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Latest payments, all workspaces</h2>
            <Link href="/admin/payments" className="text-[12.5px] font-semibold text-[var(--color-orange-deep)]">
              All →
            </Link>
          </div>
          {recent.length ? (
            <ul className="flex flex-col divide-y divide-[var(--color-line)]">
              {recent.map(({ payment, organizationName }) => (
                <li key={payment.id} className="flex flex-wrap items-center gap-2 py-2 text-[12.5px]">
                  <PaymentStatusBadge status={payment.status} />
                  <ModeChip mode={payment.mode} />
                  <span className="font-semibold tabular">{formatAmount(payment.amount, payment.sourceCurrency)}</span>
                  <span className="text-[var(--color-muted)]">→ {payment.destinationCurrency}</span>
                  <span className="min-w-0 flex-1 truncate text-[var(--color-muted)]">{organizationName}</span>
                  <time className="font-mono text-[11px] text-[var(--color-faint)]">{payment.createdAt.toISOString().slice(5, 16).replace("T", " ")}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-[var(--color-muted)]">No payments yet on this deployment.</p>
          )}
        </div>
      </section>

      <RecentSignups />
    </>
  );
}

async function RecentSignups() {
  const db = await getDb();
  const rows = await db.select().from(organizations).orderBy(desc(organizations.createdAt)).limit(6);
  return (
    <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Newest workspaces</h2>
        <Link href="/admin/organizations" className="text-[12.5px] font-semibold text-[var(--color-orange-deep)]">
          All →
        </Link>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((o) => (
          <li key={o.id} className="flex items-center gap-3 rounded-xl border border-[var(--color-line)] px-3 py-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--color-ink)] text-[12px] font-bold uppercase text-white">{o.name.charAt(0)}</span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold">{o.name}</span>
              <span className="block text-[11.5px] text-[var(--color-muted)]">
                {o.entityCountry ?? "—"} · {o.createdAt.toISOString().slice(0, 10)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
