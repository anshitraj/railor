import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Freshness } from "@railor/ui";
import type { DashboardData, RecentPayment, TimelineItem } from "../../../lib/dashboard";
import { loadRateHistory } from "../../../lib/rate-history";
import { providerWordmark } from "../../../lib/provider-wordmarks";
import { isCompanyPath } from "../../../lib/workspace-profile";
import { CountUp } from "../../marketing/home/count-up";
import { ProviderLogo } from "../provider-logo";
import { ActivityChart } from "./activity-chart";
import { RateSparkline } from "./rate-sparkline";
import styles from "./dashboard.module.css";

const money = (value: number, currency: string, digits = 2) => `${value.toLocaleString("en-US", { maximumFractionDigits: digits })} ${currency}`;
const titleCase = (slug: string) => slug.split(/[-_]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
export const providerLabel = (slug: string | null) => (slug ? providerWordmark(slug)?.name ?? titleCase(slug) : null);
const order = (i: number) => ({ "--i": i }) as React.CSSProperties;

function Delta({ change, suffix = "" }: { change: number | null; suffix?: string }) {
  if (change === null) return null;
  const dir = change > 0 ? "up" : change < 0 ? "down" : "flat";
  return <span className={styles.delta} data-dir={dir}>{change > 0 ? "+" : ""}{change}%{suffix}</span>;
}

/**
 * The top of the dashboard: the one number that matters most this month, four
 * quieter ones beside it, and the day-by-day activity under them, in one card.
 */
export function Overview({ data, api, index = 1 }: { data: DashboardData; api: { used: number; limit: number; plan: string }; index?: number }) {
  const topRoute = data.routes.find((share) => share.key !== "other");
  const topProvider = data.providers.find((share) => share.key !== "other");
  const usedPct = api.limit > 0 ? Math.min(100, Math.round((api.used / api.limit) * 100)) : 0;
  const waiting = data.stuckPayments.length;
  return (
    <section className={`${styles.card} ${styles.overview} ${styles.span12}`} style={order(index)} aria-labelledby="overview-title">
      <div className={styles.overviewTop}>
        <div>
          <h2 id="overview-title" className={styles.bigLabel}>Price checks, last {data.days} days</h2>
          <p className={styles.big}><CountUp value={data.checks.value} /><small>{data.checks.value === 1 ? "check" : "checks"}</small></p>
          <p className={styles.bigFoot}><Delta change={data.checks.change} />{data.checks.change !== null ? "vs the 30 days before" : null}{topRoute ? <span>Mostly {topRoute.label}</span> : <span>Compare a transfer to start</span>}</p>
        </div>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Extra found</span>
            <span className={styles.statValue}>{data.extra ? <>+<CountUp value={Math.round(data.extra.amount)} /><small>{data.extra.currency}</small></> : "—"}</span>
            <span className={styles.statFoot}>{data.extra ? `vs middle option · ${data.extra.checks} checks` : "Needs 2+ priced options"}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Provider visits</span>
            <span className={styles.statValue}><CountUp value={data.visits.value} /></span>
            <span className={styles.statFoot}>{topProvider ? `Top: ${topProvider.label}` : "From your comparisons"}</span>
          </div>
          <Link href="/app/payments" className={styles.stat}>
            <span className={styles.statLabel}>Payments</span>
            <span className={styles.statValue}><CountUp value={data.payments.value} /></span>
            <span className={styles.statFoot}>{data.payments.completed} completed{waiting ? ` · ${waiting} waiting` : ""}</span>
          </Link>
          <Link href="/app/developers" className={styles.stat}>
            <span className={styles.statLabel}>API calls</span>
            <span className={styles.statValue}><CountUp value={api.used} /><small>/ {api.limit.toLocaleString("en-US")}</small></span>
            <span className={styles.meter} role="meter" aria-valuemin={0} aria-valuemax={api.limit} aria-valuenow={api.used} aria-label="API calls used this month"><span style={{ width: `${Math.max(usedPct, api.used ? 2 : 0)}%` }} /></span>
          </Link>
        </div>
      </div>
      <ActivityChart points={data.daily} />
    </section>
  );
}

export interface NeedItem { id: string; title: string; detail: string; href: string; action: string; tone: "warn" | "info" }

/** Everything waiting on the person, most urgent first. An empty list is good news and says so. */
export function NeedsYou({ items, setup, index = 0 }: { items: NeedItem[]; setup: { done: number; total: number }; index?: number }) {
  return (
    <section className={styles.card} style={order(index)} aria-labelledby="needs-title">
      <header className={styles.cardHead}>
        <h2 id="needs-title">Needs you</h2>
        <span className={styles.sub}>Setup {setup.done} of {setup.total}</span>
      </header>
      {items.length ? (
        <div className={styles.list}>
          {items.map((item) => (
            <Link key={item.id} href={item.href} className={styles.row}>
              <span className={styles.dot} data-tone={item.tone} aria-hidden />
              <span><span className={styles.rowTitle}>{item.title}</span><span className={styles.rowDetail}>{item.detail}</span></span>
              <span className={styles.go}>{item.action}<ArrowRight size={14} aria-hidden /></span>
            </Link>
          ))}
        </div>
      ) : <p className={styles.allClear}>Nothing needs you right now.</p>}
    </section>
  );
}

/** Mid-market rate for the route this workspace checks most, over 30 days. */
export async function RateWidget({ from, to, index = 0 }: { from: string; to: string; index?: number }) {
  const history = await loadRateHistory({ mode: "bank", from, to, days: 30 }).catch(() => null);
  const points = (history?.points ?? []).filter((point): point is { date: string; rate: number } => typeof point.rate === "number");
  const first = points[0]?.rate;
  const last = points[points.length - 1]?.rate;
  const change = first && last ? ((last - first) / first) * 100 : null;
  return (
    <section className={styles.card} style={order(index)} aria-labelledby="rate-title">
      <header className={styles.cardHead} style={{ marginBottom: 6 }}>
        <h2 id="rate-title">{from} → {to}</h2>
        <Link href={`/app/prices?from=${from}&to=${to}`}>Compare<ChevronRight size={15} aria-hidden /></Link>
      </header>
      {last ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span className={styles.statValue} style={{ fontSize: 30 }}>{last.toLocaleString("en-US", { maximumFractionDigits: 4 })}</span>
            {change !== null ? <span className={styles.delta} data-dir={change > 0.005 ? "up" : change < -0.005 ? "down" : "flat"}>{change > 0 ? "+" : ""}{change.toFixed(2)}% · 30 days</span> : null}
          </div>
          <RateSparkline points={points} pair={`${from} → ${to}`} />
          <p className={styles.sub} style={{ marginTop: 6 }}>Mid-market, {history?.source ?? "public reference rate"}</p>
        </>
      ) : <p className={styles.sub}>The rate history for this pair isn’t available right now.</p>}
    </section>
  );
}

export function RateWidgetSkeleton() {
  return <section className={styles.card} aria-busy><div className={styles.empty} style={{ height: 150 }} /></section>;
}

const STATUS_TONE: Record<string, "ok" | "info" | "warn" | "bad"> = {
  completed: "ok", processing: "info", submitting: "info", ready: "info",
  requires_approval: "warn", awaiting_funds: "warn", blocked: "warn",
  failed: "bad", returned: "bad", cancelled: "bad",
};

export function RecentPayments({ payments, index = 0 }: { payments: RecentPayment[]; index?: number }) {
  return (
    <section className={`${styles.card} ${styles.stretch}`} style={order(index)} aria-labelledby="payments-title">
      <header className={styles.cardHead}>
        <h2 id="payments-title">Recent payments</h2>
        <Link href="/app/payments">View all<ChevronRight size={15} aria-hidden /></Link>
      </header>
      {payments.length ? (
        <div className={styles.list}>
          {payments.map((payment) => {
            const name = providerLabel(payment.provider);
            return (
              <Link key={payment.id} href={`/app/payments/${payment.id}`} className={styles.row}>
                {payment.provider && name ? <ProviderLogo slug={payment.provider} name={name} size={30} /> : <span className={styles.dot} aria-hidden />}
                <span>
                  <span className={styles.rowTitle}>{money(payment.amount, payment.from)} → {payment.to}</span>
                  <span className={styles.rowDetail}>{[name ?? "Provider not chosen yet", payment.mode === "test" ? "Test" : null].filter(Boolean).join(" · ")} · <Freshness date={payment.createdAt} prefix="" /></span>
                </span>
                <span className={styles.rowEnd}>
                  {payment.recipientAmount !== null ? <strong>{money(payment.recipientAmount, payment.to)}</strong> : null}
                  <span className={styles.status} data-tone={STATUS_TONE[payment.status] ?? "info"}>{payment.status.replace(/_/g, " ")}</span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className={styles.empty}>
          <strong>No payments yet</strong>
          <p>Pay a supplier or a person through a provider you’ve compared, and follow it here until it arrives.</p>
          <Link href="/app/payments/new" className={styles.action}>New payment<ArrowRight size={13} aria-hidden /></Link>
        </div>
      )}
    </section>
  );
}

const TIMELINE_TONE: Record<TimelineItem["kind"], string> = { check: "brand", visit: "info", payment: "ok", action: "" };

/** A running record of what happened in the workspace, newest first. */
export function Timeline({ items, index = 0 }: { items: TimelineItem[]; index?: number }) {
  return (
    <section className={`${styles.card} ${styles.stretch}`} style={order(index)} aria-labelledby="timeline-title">
      <header className={styles.cardHead}>
        <h2 id="timeline-title">Activity</h2>
        <Link href="/app/audit">Full log<ChevronRight size={15} aria-hidden /></Link>
      </header>
      {items.length ? (
        <div className={styles.list}>
          {items.map((item) => (
            <Link key={`${item.kind}-${item.id}`} href={item.href} className={styles.row}>
              <span className={styles.dot} data-tone={TIMELINE_TONE[item.kind] || undefined} aria-hidden />
              <span><span className={styles.rowTitle}>{item.title}</span>{item.detail ? <span className={styles.rowDetail}>{item.detail}</span> : null}</span>
              <span className={styles.rowEnd}><Freshness date={item.at} prefix="" /></span>
            </Link>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <strong>Nothing recorded yet</strong>
          <p>Price checks, providers you open, payments and team actions appear here as they happen.</p>
        </div>
      )}
    </section>
  );
}

const TOOLS = [
  { href: "/app/prices", title: "Compare prices", body: "Every provider’s payout for your amount" },
  { href: "/app/search", title: "Find a route", body: "Who serves your countries and currencies" },
  { href: "/app/freelancer", title: "Get paid", body: "Invoices and the best way to receive" },
  { href: "/app/payroll", title: "Payroll", body: "Price a whole payroll file at once" },
  { href: "/app/audit", title: "Audit payments", body: "Provider records against the bank" },
  { href: "/app/policies", title: "Company rules", body: "Limits, providers and approvals" },
  { href: "/app/monitoring", title: "Monitoring", body: "Alerts when fees or coverage change" },
  { href: "/app/developers", title: "API and MCP", body: "Railor from your code or AI tools" },
  { href: "/app/agent", title: "Ask the agent", body: "Describe a payment in plain English" },
];

/** Everything Railor offers this workspace, one click away. Company-only tools show for companies. */
export function Tools({ company, index = 0 }: { company: boolean; index?: number }) {
  const tools = TOOLS.filter((tool) => company || !isCompanyPath(tool.href)).slice(0, 8);
  return (
    <section className={`${styles.card} ${styles.stretch}`} style={order(index)} aria-labelledby="tools-title">
      <header className={styles.cardHead}><h2 id="tools-title">Tools</h2></header>
      <nav className={styles.tools} aria-label="Railor tools">
        {tools.map(({ href, title, body }) => (
          <Link key={href} href={href} className={styles.tool}>
            <span><strong>{title}</strong><small>{body}</small></span>
            <ArrowRight size={16} aria-hidden />
          </Link>
        ))}
      </nav>
    </section>
  );
}
