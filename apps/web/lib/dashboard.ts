import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { auditLogs, decisionApprovals, getDb, payments, productEvents } from "@railor/database";
import { ACTIVITY } from "./activity";
import {
  DASHBOARD_DAYS, changePct, dailySeries, extraFound, topShares,
  type DayPoint, type PriceCheckData, type ProviderOpenData, type Share,
} from "./dashboard-metrics";

const DAY = 86_400_000;

export interface Metric { value: number; previous: number; change: number | null }

export interface RecentPayment {
  id: string; mode: string; status: string; amount: number; from: string; to: string;
  recipientAmount: number | null; provider: string | null; createdAt: Date;
}

export interface TimelineItem { id: string; kind: "check" | "visit" | "payment" | "action"; title: string; detail: string | null; at: Date; href: string }

export interface DashboardData {
  days: number;
  checks: Metric;
  visits: Metric;
  payments: Metric & { completed: number };
  extra: ReturnType<typeof extraFound>;
  daily: DayPoint[];
  routes: Share[];
  providers: Share[];
  currencies: Share[];
  topRoute: { from: string; to: string } | null;
  pendingApprovals: number;
  stuckPayments: RecentPayment[];
  recentPayments: RecentPayment[];
  timeline: TimelineItem[];
}

/** Workspace actions worth showing in the activity timeline, in plain words. Anything else stays in the audit log. */
const ACTION_TITLE: Record<string, { title: string; href: string }> = {
  save: { title: "Saved a route", href: "/app/saved" },
  decision: { title: "Evaluated a payment", href: "/app/decisions" },
  choose: { title: "Chose a provider for a payment", href: "/app/decisions" },
  approve: { title: "Approved a payment", href: "/app/approvals" },
  reject: { title: "Rejected a payment", href: "/app/approvals" },
  create_policy: { title: "Created company rules", href: "/app/policies" },
  activate_policy: { title: "Turned on company rules", href: "/app/policies" },
  version_policy: { title: "Updated company rules", href: "/app/policies" },
  agent_search: { title: "Asked the agent", href: "/app/agent" },
  route: { title: "Searched for a route", href: "/app/search" },
  register_connector: { title: "Connected a tool", href: "/app/connectors" },
};

const STUCK = new Set(["requires_approval", "blocked", "awaiting_funds", "failed", "returned"]);

const money = (value: number, currency: string) => `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency}`;

/** Everything the dashboard home reads, from what this workspace recorded. One round of queries, no provider calls. */
export async function loadDashboard(organizationId: string, now = new Date()): Promise<DashboardData> {
  const db = await getDb();
  const start = new Date(now.getTime() - DASHBOARD_DAYS * DAY);
  const previousStart = new Date(now.getTime() - 2 * DASHBOARD_DAYS * DAY);
  const [events, paymentRows, recentRows, approvals, actions] = await Promise.all([
    db.select({ id: productEvents.id, kind: productEvents.kind, data: productEvents.data, createdAt: productEvents.createdAt }).from(productEvents)
      .where(and(eq(productEvents.organizationId, organizationId), inArray(productEvents.kind, [ACTIVITY.priceChecked, ACTIVITY.providerOpened]), gte(productEvents.createdAt, previousStart)))
      .orderBy(desc(productEvents.createdAt)).limit(5000),
    db.select({ id: payments.id, status: payments.status, destinationCurrency: payments.destinationCurrency, selectedProvider: payments.selectedProvider, createdAt: payments.createdAt })
      .from(payments).where(and(eq(payments.organizationId, organizationId), gte(payments.createdAt, previousStart))).orderBy(desc(payments.createdAt)).limit(2000),
    db.select({
      id: payments.id, mode: payments.mode, status: payments.status, amount: payments.amount, from: payments.sourceCurrency, to: payments.destinationCurrency,
      recipientAmount: payments.recipientAmount, provider: payments.selectedProvider, createdAt: payments.createdAt,
    }).from(payments).where(eq(payments.organizationId, organizationId)).orderBy(desc(payments.createdAt)).limit(25),
    db.select({ count: sql<number>`count(*)::int` }).from(decisionApprovals).where(and(eq(decisionApprovals.organizationId, organizationId), eq(decisionApprovals.status, "pending"))),
    db.select({ id: auditLogs.id, action: auditLogs.action, createdAt: auditLogs.createdAt }).from(auditLogs)
      .where(and(eq(auditLogs.organizationId, organizationId), inArray(auditLogs.action, Object.keys(ACTION_TITLE)))).orderBy(desc(auditLogs.createdAt)).limit(10),
  ]);

  const inWindow = (at: Date) => at >= start;
  const inPrevious = (at: Date) => at >= previousStart && at < start;
  const checks = events.filter((event) => event.kind === ACTIVITY.priceChecked);
  const visits = events.filter((event) => event.kind === ACTIVITY.providerOpened);
  const metric = (list: Array<{ createdAt: Date }>): Metric => {
    const value = list.filter((item) => inWindow(item.createdAt)).length;
    const previous = list.filter((item) => inPrevious(item.createdAt)).length;
    return { value, previous, change: changePct(value, previous) };
  };
  const checkData = checks.filter((event) => inWindow(event.createdAt)).map((event) => event.data as unknown as PriceCheckData);
  const visitData = visits.filter((event) => inWindow(event.createdAt)).map((event) => event.data as unknown as ProviderOpenData);
  const paymentsNow = paymentRows.filter((row) => inWindow(row.createdAt));

  const routes = topShares(checkData.map((check) => ({ key: `${check.from}-${check.to}`, label: `${check.from} → ${check.to}` })));
  const [topKey] = routes.filter((share) => share.key !== "other").map((share) => share.key);
  const recentPayments: RecentPayment[] = recentRows.map((row) => ({
    ...row, amount: Number(row.amount), recipientAmount: row.recipientAmount === null ? null : Number(row.recipientAmount),
  }));

  const timeline: TimelineItem[] = [
    ...checks.slice(0, 8).map((event) => {
      const data = event.data as unknown as PriceCheckData;
      return {
        id: event.id, kind: "check" as const, at: event.createdAt, href: `/app/prices?from=${data.from}&to=${data.to}&amount=${data.amount}`,
        title: `Compared ${money(data.amount, data.from)} → ${data.to}`,
        detail: data.best !== null && data.bestProvider ? `Best: ${data.bestProvider}, ${money(data.best, data.to)} · ${data.options} options` : `${data.options} options priced`,
      };
    }),
    ...visits.slice(0, 8).map((event) => {
      const data = event.data as unknown as ProviderOpenData;
      return { id: event.id, kind: "visit" as const, at: event.createdAt, href: "/app/prices", title: `Went to ${data.name}`, detail: data.from && data.to ? `${data.from} → ${data.to}` : null };
    }),
    ...recentPayments.slice(0, 8).map((row) => ({
      id: row.id, kind: "payment" as const, at: row.createdAt, href: `/app/payments/${row.id}`,
      title: `Payment of ${money(row.amount, row.from)} → ${row.to}`, detail: `${row.status.replace(/_/g, " ")}${row.mode === "test" ? " · test" : ""}`,
    })),
    ...actions.map((row) => ({ id: row.id, kind: "action" as const, at: row.createdAt, href: ACTION_TITLE[row.action]!.href, title: ACTION_TITLE[row.action]!.title, detail: null })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 6);

  return {
    days: DASHBOARD_DAYS,
    checks: metric(checks),
    visits: metric(visits),
    payments: { ...metric(paymentRows), completed: paymentsNow.filter((row) => row.status === "completed").length },
    extra: extraFound(checkData),
    daily: dailySeries({
      checks: checks.filter((event) => inWindow(event.createdAt)).map((event) => event.createdAt),
      visits: visits.filter((event) => inWindow(event.createdAt)).map((event) => event.createdAt),
      payments: paymentsNow.map((row) => row.createdAt),
    }, DASHBOARD_DAYS, now),
    routes,
    providers: topShares([
      ...visitData.map((visit) => ({ key: visit.provider, label: visit.name })),
      ...paymentsNow.filter((row) => row.selectedProvider).map((row) => ({ key: row.selectedProvider!, label: row.selectedProvider! })),
    ]),
    currencies: topShares(paymentsNow.map((row) => ({ key: row.destinationCurrency, label: row.destinationCurrency }))),
    topRoute: topKey ? { from: topKey.slice(0, 3), to: topKey.slice(4, 7) } : null,
    pendingApprovals: approvals[0]?.count ?? 0,
    stuckPayments: recentPayments.filter((row) => STUCK.has(row.status) && row.createdAt >= start).slice(0, 3),
    recentPayments: recentPayments.slice(0, 5),
    timeline,
  };
}
