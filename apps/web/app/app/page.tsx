import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getDefaultActivePolicy, listPolicies } from "@railor/core";
import { apiKeys, getDb } from "@railor/database";
import { ChevronRight } from "lucide-react";
import { getSession } from "../../lib/auth";
import { getOrgAlerts } from "../../lib/org";
import { listSavedPairsWithAlerts } from "../../lib/rate-alerts";
import { loadPricePage } from "../../lib/pricing";
import { onboardingPriceProfile } from "../../lib/onboarding";
import { loadDashboard } from "../../lib/dashboard";
import { greeting, summaryLine } from "../../lib/dashboard-metrics";
import { shellWalletBalance } from "../../lib/wallet";
import { getWorkspaceApiUsage } from "../../lib/entitlements";
import { planName } from "../../lib/plans";
import { isCompanyWorkspace } from "../../lib/workspace-profile";
import { SavedPairsList } from "../../components/app/saved-pairs-list";
import { ActivityCards } from "../../components/app/activity-cards";
import { QuickQuote, QuickQuoteSkeleton } from "../../components/price/quick-quote";
import { ShareDonut } from "../../components/app/dashboard/share-donut";
import { NeedsYou, Overview, RateWidget, RateWidgetSkeleton, RecentPayments, Timeline, Tools, providerLabel, type NeedItem } from "../../components/app/dashboard/widgets";
import styles from "../../components/app/dashboard/dashboard.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home" };

/** Where the workspace is registered decides the clock its greeting reads; anywhere else reads UTC. */
const TIME_ZONE: Record<string, string> = {
  IN: "Asia/Kolkata", US: "America/New_York", GB: "Europe/London", AE: "Asia/Dubai", SG: "Asia/Singapore",
  AU: "Australia/Sydney", CA: "America/Toronto", DE: "Europe/Berlin", FR: "Europe/Paris", NL: "Europe/Amsterdam",
};

/** The calculator streams in separately so the dashboard never waits on a provider. */
async function HomeQuote({ organizationId, entityCountry, building }: { organizationId: string; entityCountry: string | null; building: string | null }) {
  const page = await loadPricePage({}, organizationId, entityCountry, onboardingPriceProfile(building));
  return (
    <QuickQuote
      variant="app"
      compareBase="/app/prices"
      entityCountry={entityCountry}
      currencies={page.currencies}
      initial={{ from: page.initial.from, to: page.initial.to, amount: page.initial.amount, context: page.initial.context }}
      initialResult={page.result}
      initialError={page.error}
    />
  );
}

export default async function HomePage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const org = session.organization;
  const db = await getDb();
  const now = new Date();
  const [savedPairs, alerts, activePolicy, policies, usedKeys, anyKeys, data, walletCents, usage] = await Promise.all([
    listSavedPairsWithAlerts(org.id, session.user.id).catch(() => []), getOrgAlerts(org.id, 3), getDefaultActivePolicy(org.id), listPolicies(org.id),
    db.select({ id: apiKeys.id }).from(apiKeys).where(and(eq(apiKeys.organizationId, org.id), isNull(apiKeys.revokedAt), isNotNull(apiKeys.lastUsedAt))).limit(1),
    db.select({ id: apiKeys.id }).from(apiKeys).where(and(eq(apiKeys.organizationId, org.id), isNull(apiKeys.revokedAt))).limit(1),
    loadDashboard(org.id, now),
    shellWalletBalance(org.id, session.user.id).catch(() => null),
    getWorkspaceApiUsage(org.id),
  ]);
  const name = (session.user.name ?? session.user.email.split("@")[0] ?? "there").split(" ")[0];
  const business = onboardingPriceProfile(org.building) === "business";
  const company = isCompanyWorkspace(org.building);
  const savedPolicy = activePolicy?.policy ?? policies.find((policy) => policy.status === "draft" || policy.status === "active") ?? null;
  const timeZone = TIME_ZONE[org.entityCountry ?? ""] ?? "UTC";

  // A real checklist: each step is done only when the workspace shows it.
  const steps = [
    { done: true, title: "Create your dashboard", href: "/app/settings", action: "Settings" },
    { done: Boolean(org.onboardingCompletedAt), title: "Tell us how you use Railor", href: "/welcome", action: "Answer" },
    { done: savedPairs.length > 0, title: "Save a pair you use", href: "/app/prices", action: "Save one" },
    ...(business ? [{ done: Boolean(activePolicy), title: "Set your company rules", href: savedPolicy ? `/app/policies/${savedPolicy.id}` : "/app/policies", action: savedPolicy ? "Finish" : "Set rules" }] : []),
    { done: usedKeys.length > 0, title: anyKeys.length ? "Make your first API request" : "Get your API key", href: "/app/developers", action: anyKeys.length ? "Try it" : "Get a key" },
  ];
  const doneCount = steps.filter((step) => step.done).length;

  const needs: NeedItem[] = [
    ...(data.pendingApprovals ? [{ id: "approvals", title: `Approve ${data.pendingApprovals} ${data.pendingApprovals === 1 ? "payment" : "payments"}`, detail: "Waiting for a reviewer", href: "/app/approvals", action: "Review", tone: "warn" as const }] : []),
    ...data.stuckPayments.map((payment) => ({
      id: `payment-${payment.id}`, title: `${payment.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${payment.from} → ${payment.to}`,
      detail: `${payment.status.replace(/_/g, " ")}${providerLabel(payment.provider) ? ` · ${providerLabel(payment.provider)}` : ""}`, href: `/app/payments/${payment.id}`, action: "Open", tone: "warn" as const,
    })),
    ...(walletCents !== null && walletCents < 500 ? [{ id: "wallet", title: "Wallet is running low", detail: `$${(walletCents / 100).toFixed(2)} left for API calls`, href: "/app/wallet", action: "Add funds", tone: "warn" as const }] : []),
    ...steps.filter((step) => !step.done).map((step) => ({ id: `step-${step.title}`, title: step.title, detail: "Setup", href: step.href, action: step.action, tone: "info" as const })),
  ].slice(0, 5);

  const topRoute = data.topRoute ?? (savedPairs[0] ? { from: savedPairs[0].from, to: savedPairs[0].to } : { from: "USD", to: "INR" });
  const dateLine = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone }).format(now);

  return (
    <div className={styles.home}>
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>{dateLine}</p>
          <h1>{greeting(now, timeZone)}, {name}</h1>
          <p className={styles.summary}>{summaryLine({ needs: needs.length, checks: data.checks.value, topRoute: data.routes.find((share) => share.key !== "other")?.label ?? null, payments: data.payments.value })}</p>
        </div>
        <div className={styles.headActions}>
          <Link href="/app/wallet" className={styles.pill}>Wallet <small>{walletCents === null ? "—" : `$${(walletCents / 100).toFixed(2)}`}</small></Link>
          <Link href="/app/agent" className={styles.pill}>Ask the agent</Link>
          <Link href="/app/prices" className={`${styles.pill} ${styles.pillDark}`}>Compare a transfer</Link>
        </div>
      </header>

      <div className={styles.grid}>
        <Overview data={data} api={{ used: usage.used, limit: usage.entitlement.limits.apiRequests, plan: planName(usage.entitlement.plan) }} index={1} />

        <div className={`${styles.span7} ${styles.quote}`} style={{ "--i": 2 } as React.CSSProperties}>
          <Suspense fallback={<QuickQuoteSkeleton variant="app" />}>
            <HomeQuote organizationId={org.id} entityCountry={org.entityCountry ?? null} building={org.building ?? null} />
          </Suspense>
        </div>

        <div className={`${styles.span5} ${styles.stack}`}>
          <NeedsYou items={needs} setup={{ done: doneCount, total: steps.length }} index={3} />
          <Suspense fallback={<RateWidgetSkeleton />}>
            <RateWidget from={topRoute.from} to={topRoute.to} index={4} />
          </Suspense>
          <section className={styles.card} style={{ "--i": 5 } as React.CSSProperties} aria-labelledby="home-saved">
            <header className={styles.cardHead}>
              <h2 id="home-saved">Saved routes</h2>
              <Link href="/app/saved">View all<ChevronRight size={15} aria-hidden /></Link>
            </header>
            <SavedPairsList initial={savedPairs.slice(0, 3)} compact />
          </section>
        </div>

        <section className={`${styles.card} ${styles.span4} ${styles.stretch}`} style={{ "--i": 6 } as React.CSSProperties} aria-labelledby="share-title">
          <header className={styles.cardHead}><h2 id="share-title">Where it goes</h2></header>
          <ShareDonut views={[
            { id: "routes", label: "Routes", unit: "price checks", shares: data.routes, empty: "Compare a transfer and the routes you check most are split out here." },
            { id: "providers", label: "Providers", unit: "visits and payments", shares: data.providers, empty: "Open a provider from a comparison, or pay through one, to see where your money goes." },
            { id: "currencies", label: "Payouts", unit: "payments", shares: data.currencies, empty: "Payments you make are split by the currency they arrive in." },
          ]} />
        </section>
        <div className={`${styles.span4} ${styles.stretch}`} style={{ display: "grid", minWidth: 0 }}><RecentPayments payments={data.recentPayments} index={7} /></div>
        <div className={`${styles.span4} ${styles.stretch}`} style={{ display: "grid", minWidth: 0 }}><Timeline items={data.timeline} index={8} /></div>

        <section className={`${styles.card} ${styles.span6} ${styles.stretch}`} style={{ "--i": 9 } as React.CSSProperties} aria-labelledby="changes-title">
          <header className={styles.cardHead}>
            <h2 id="changes-title">Provider changes</h2>
            <Link href="/app/changes">View all<ChevronRight size={15} aria-hidden /></Link>
          </header>
          {alerts.length ? <ActivityCards items={alerts.map(({ alert, change, providerName, providerSlug }) => ({ id: alert.id, providerName, providerSlug, summary: change.summary, detectedAt: change.detectedAt }))} /> : (
            <div className={styles.empty}>
              <strong>You’re all caught up</strong>
              <p>Watch a route or provider and changes to fees, limits or coverage land here.</p>
              <Link href="/app/monitoring" className={styles.action}>Set up monitoring</Link>
            </div>
          )}
        </section>
        <div className={`${styles.span6} ${styles.stretch}`} style={{ display: "grid", minWidth: 0 }}><Tools company={company} index={10} /></div>
      </div>
    </div>
  );
}
