import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight, ArrowRight, BadgeCheck, Bot, ChevronRight, CircleAlert, Code2, ExternalLink, FileText, Gauge,
  History, ListChecks, MousePointerClick, Radar, Route, ScanSearch, ShieldCheck, Sparkles, TrendingDown, TrendingUp, Users, Wallet,
} from "lucide-react";
import { Freshness } from "@railor/ui";
import type { DashboardData, RecentPayment, TimelineItem } from "../../../lib/dashboard";
import { loadRateHistory } from "../../../lib/rate-history";
import { providerWordmark } from "../../../lib/provider-wordmarks";
import { isCompanyPath } from "../../../lib/workspace-profile";
import { RateSparkline } from "./rate-sparkline";
import styles from "./dashboard.module.css";

const money = (value: number, currency: string, digits = 2) => `${value.toLocaleString("en-US", { maximumFractionDigits: digits })} ${currency}`;
const titleCase = (slug: string) => slug.split(/[-_]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
export const providerLabel = (slug: string | null) => (slug ? providerWordmark(slug)?.name ?? titleCase(slug) : null);

function Delta({ change }: { change: number | null }) {
  if (change === null) return null;
  const dir = change > 0 ? "up" : change < 0 ? "down" : "flat";
  return <span className={styles.delta} data-dir={dir}>{dir === "up" ? <TrendingUp size={12} aria-hidden /> : dir === "down" ? <TrendingDown size={12} aria-hidden /> : null}{change > 0 ? "+" : ""}{change}%</span>;
}

/** Six figures across the top: what the workspace did in the last 30 days, and what it has left. */
export function KpiStrip({ data, walletCents, api }: { data: DashboardData; walletCents: number | null; api: { used: number; limit: number; plan: string } }) {
  const topRoute = data.routes.find((share) => share.key !== "other");
  const topProvider = data.providers.find((share) => share.key !== "other");
  const usedPct = api.limit > 0 ? Math.min(100, Math.round((api.used / api.limit) * 100)) : 0;
  const waiting = data.stuckPayments.length;
  return (
    <section className={styles.kpis} aria-label={`Last ${data.days} days`}>
      <Link href="/app/prices" className={styles.kpi}>
        <span className={styles.kpiLabel}><ScanSearch size={15} aria-hidden />Price checks</span>
        <span className={styles.kpiValue}>{data.checks.value.toLocaleString("en-US")}</span>
        <span className={styles.kpiFoot}><Delta change={data.checks.change} />{topRoute ? `Most: ${topRoute.label}` : `Last ${data.days} days`}</span>
      </Link>
      <div className={styles.kpi}>
        <span className={styles.kpiLabel}><MousePointerClick size={15} aria-hidden />Provider visits</span>
        <span className={styles.kpiValue}>{data.visits.value.toLocaleString("en-US")}</span>
        <span className={styles.kpiFoot}><Delta change={data.visits.change} />{topProvider ? `Top: ${topProvider.label}` : "From your comparisons"}</span>
      </div>
      <div className={styles.kpi}>
        <span className={styles.kpiLabel}><Sparkles size={15} aria-hidden />Extra found</span>
        <span className={styles.kpiValue}>{data.extra ? <>+{Math.round(data.extra.amount).toLocaleString("en-US")}<small>{data.extra.currency}</small></> : "—"}</span>
        <span className={styles.kpiFoot}>{data.extra ? `Best vs middle option, ${data.extra.checks} ${data.extra.checks === 1 ? "check" : "checks"}` : "Compare 2+ options to see it"}</span>
      </div>
      <Link href="/app/payments" className={styles.kpi}>
        <span className={styles.kpiLabel}><ArrowLeftRight size={15} aria-hidden />Payments</span>
        <span className={styles.kpiValue}>{data.payments.value.toLocaleString("en-US")}</span>
        <span className={styles.kpiFoot}><Delta change={data.payments.change} />{data.payments.completed} completed{waiting ? ` · ${waiting} waiting` : ""}</span>
      </Link>
      <Link href="/app/developers" className={styles.kpi}>
        <span className={styles.kpiLabel}><Gauge size={15} aria-hidden />API calls</span>
        <span className={styles.kpiValue}>{api.used.toLocaleString("en-US")}<small>/ {api.limit.toLocaleString("en-US")}</small></span>
        <span className={styles.meter} role="meter" aria-valuemin={0} aria-valuemax={api.limit} aria-valuenow={api.used} aria-label="API calls used this month"><span style={{ width: `${Math.max(usedPct, api.used ? 2 : 0)}%` }} /></span>
        <span className={styles.kpiFoot}>{api.plan} plan · this month</span>
      </Link>
      <Link href="/app/wallet" className={styles.kpi}>
        <span className={styles.kpiLabel}><Wallet size={15} aria-hidden />Wallet</span>
        <span className={styles.kpiValue}>{walletCents === null ? "—" : `$${(walletCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
        <span className={styles.kpiFoot}>{walletCents !== null && walletCents < 500 ? "Running low · add funds" : "Prepaid credit"}</span>
      </Link>
    </section>
  );
}

export interface NeedItem { id: string; title: string; detail: string; href: string; action: string; tone: "warn" | "info" }

/** Everything waiting on the person, most urgent first. An empty list is good news and says so. */
export function NeedsYou({ items, setup }: { items: NeedItem[]; setup: { done: number; total: number } }) {
  return (
    <section className={styles.card} aria-labelledby="needs-title">
      <header className={styles.cardHead}>
        <h2 id="needs-title"><CircleAlert size={16} aria-hidden />Needs you</h2>
        <span className={styles.sub}>Setup {setup.done} of {setup.total}</span>
      </header>
      {items.length ? (
        <div className={styles.list}>
          {items.map((item) => (
            <Link key={item.id} href={item.href} className={styles.row}>
              <span className={styles.rowIcon} data-tone={item.tone}>{item.tone === "warn" ? <CircleAlert size={16} aria-hidden /> : <ListChecks size={16} aria-hidden />}</span>
              <span><span className={styles.rowTitle}>{item.title}</span><span className={styles.rowDetail}>{item.detail}</span></span>
              <span className={styles.action}>{item.action}<ArrowRight size={13} aria-hidden /></span>
            </Link>
          ))}
        </div>
      ) : <p className={styles.allClear}><BadgeCheck size={18} aria-hidden />Nothing needs you right now.</p>}
    </section>
  );
}

/** Mid-market rate for the route this workspace checks most, over 30 days. */
export async function RateWidget({ from, to }: { from: string; to: string }) {
  const history = await loadRateHistory({ mode: "bank", from, to, days: 30 }).catch(() => null);
  const points = (history?.points ?? []).filter((point): point is { date: string; rate: number } => typeof point.rate === "number");
  const first = points[0]?.rate;
  const last = points[points.length - 1]?.rate;
  const change = first && last ? ((last - first) / first) * 100 : null;
  return (
    <section className={styles.card} aria-labelledby="rate-title">
      <header className={styles.cardHead} style={{ marginBottom: 4 }}>
        <h2 id="rate-title"><TrendingUp size={16} aria-hidden />{from} → {to}</h2>
        <Link href={`/app/prices?from=${from}&to=${to}`}>Compare<ChevronRight size={15} aria-hidden /></Link>
      </header>
      {last ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span className={styles.kpiValue}>{last.toLocaleString("en-US", { maximumFractionDigits: 4 })}</span>
            {change !== null ? <span className={styles.delta} data-dir={change > 0.005 ? "up" : change < -0.005 ? "down" : "flat"}>{change > 0 ? "+" : ""}{change.toFixed(2)}% in 30 days</span> : null}
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

export function RecentPayments({ payments }: { payments: RecentPayment[] }) {
  return (
    <section className={`${styles.card} ${styles.stretch}`} aria-labelledby="payments-title">
      <header className={styles.cardHead}>
        <h2 id="payments-title"><ArrowLeftRight size={16} aria-hidden />Recent payments</h2>
        <Link href="/app/payments">View all<ChevronRight size={15} aria-hidden /></Link>
      </header>
      {payments.length ? (
        <div className={styles.list}>
          {payments.map((payment) => (
            <Link key={payment.id} href={`/app/payments/${payment.id}`} className={styles.row}>
              <span className={styles.rowIcon}><ArrowLeftRight size={15} aria-hidden /></span>
              <span>
                <span className={styles.rowTitle}>{money(payment.amount, payment.from)} → {payment.to}</span>
                <span className={styles.rowDetail}>{[providerLabel(payment.provider), payment.mode === "test" ? "Test" : null].filter(Boolean).join(" · ") || "Provider not chosen yet"} · <Freshness date={payment.createdAt} prefix="" /></span>
              </span>
              <span className={styles.rowEnd}>
                {payment.recipientAmount !== null ? <strong>{money(payment.recipientAmount, payment.to)}</strong> : null}
                <span className={styles.status} data-tone={STATUS_TONE[payment.status] ?? "info"}>{payment.status.replace(/_/g, " ")}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <strong>No payments yet</strong>
          <p>Pay a supplier or a person through a provider you’ve compared, and track it here until it arrives.</p>
          <Link href="/app/payments/new" className={styles.action}>New payment<ArrowRight size={13} aria-hidden /></Link>
        </div>
      )}
    </section>
  );
}

const TIMELINE_ICON: Record<TimelineItem["kind"], LucideIcon> = { check: ScanSearch, visit: ExternalLink, payment: ArrowLeftRight, action: History };

/** A running record of what happened in the workspace, newest first. */
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <section className={`${styles.card} ${styles.stretch}`} aria-labelledby="timeline-title">
      <header className={styles.cardHead}>
        <h2 id="timeline-title"><History size={16} aria-hidden />Activity</h2>
        <Link href="/app/audit">Full log<ChevronRight size={15} aria-hidden /></Link>
      </header>
      {items.length ? (
        <div className={styles.list}>
          {items.map((item) => {
            const Icon = TIMELINE_ICON[item.kind];
            return (
              <Link key={`${item.kind}-${item.id}`} href={item.href} className={styles.row}>
                <span className={styles.rowIcon} data-tone={item.kind === "payment" ? "ok" : item.kind === "visit" ? "info" : undefined}><Icon size={15} aria-hidden /></span>
                <span><span className={styles.rowTitle}>{item.title}</span>{item.detail ? <span className={styles.rowDetail}>{item.detail}</span> : null}</span>
                <span className={styles.rowEnd}><Freshness date={item.at} prefix="" /></span>
              </Link>
            );
          })}
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

const TOOLS: Array<{ href: string; title: string; body: string; Icon: LucideIcon }> = [
  { href: "/app/prices", title: "Compare prices", body: "Every provider’s payout for your amount", Icon: ArrowLeftRight },
  { href: "/app/search", title: "Find a route", body: "Who serves your countries and currencies", Icon: Route },
  { href: "/app/freelancer", title: "Get paid", body: "Invoices and the best way to receive", Icon: FileText },
  { href: "/app/payroll", title: "Payroll", body: "Price a whole payroll file at once", Icon: Users },
  { href: "/app/audit", title: "Audit payments", body: "Check provider records against the bank", Icon: ShieldCheck },
  { href: "/app/policies", title: "Company rules", body: "Limits, providers and approvals", Icon: ListChecks },
  { href: "/app/monitoring", title: "Monitoring", body: "Alerts when fees or coverage change", Icon: Radar },
  { href: "/app/developers", title: "API and MCP", body: "Use Railor from your code or AI tools", Icon: Code2 },
  { href: "/app/agent", title: "Ask the agent", body: "Describe a payment in plain English", Icon: Bot },
];

/** Every tool Railor offers this workspace, one click away. Company-only tools show for companies. */
export function Tools({ company }: { company: boolean }) {
  const tools = TOOLS.filter((tool) => company || !isCompanyPath(tool.href)).slice(0, 8);
  return (
    <section className={styles.card} aria-labelledby="tools-title">
      <header className={styles.cardHead}><h2 id="tools-title"><Sparkles size={16} aria-hidden />Tools</h2></header>
      <nav className={styles.tools} aria-label="Railor tools">
        {tools.map(({ href, title, body, Icon }) => (
          <Link key={href} href={href} className={styles.tool}>
            <span className={styles.toolIcon}><Icon size={17} aria-hidden /></span>
            <strong>{title}</strong>
            <small>{body}</small>
          </Link>
        ))}
      </nav>
    </section>
  );
}
