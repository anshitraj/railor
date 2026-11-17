import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getDefaultActivePolicy, listPolicies, searchCorridors } from "@railor/core";
import { apiKeys, getDb } from "@railor/database";
import { CorridorQuery } from "@railor/types";
import { ArrowRight, Bot, Check, ChevronRight, FileText, ListChecks, Radar, Route } from "lucide-react";
import { getSession } from "../../lib/auth";
import { getSatisfiedRequirements, getOrgAlerts, getSavedCorridors } from "../../lib/org";
import { loadPricePage } from "../../lib/pricing";
import { onboardingPriceProfile } from "../../lib/onboarding";
import { RoutePill } from "../../components/app/route-pill";
import { ActivityCards } from "../../components/app/activity-cards";
import { QuickQuote, QuickQuoteSkeleton } from "../../components/price/quick-quote";
import styles from "../../components/app/home.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home" };

/** The workspace calculator streams in separately so Home never waits on a provider. */
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
  const [corridors, alerts, satisfiedRequirements, activePolicy, policies, usedKeys, anyKeys] = await Promise.all([
    getSavedCorridors(org.id), getOrgAlerts(org.id, 3), getSatisfiedRequirements(org.id), getDefaultActivePolicy(org.id), listPolicies(org.id),
    db.select({ id: apiKeys.id }).from(apiKeys).where(and(eq(apiKeys.organizationId, org.id), isNull(apiKeys.revokedAt), isNotNull(apiKeys.lastUsedAt))).limit(1),
    db.select({ id: apiKeys.id }).from(apiKeys).where(and(eq(apiKeys.organizationId, org.id), isNull(apiKeys.revokedAt))).limit(1),
  ]);
  const routes = await Promise.all(corridors.slice(0, 4).map(async (corridor) => {
    const query = CorridorQuery.parse(corridor.query);
    const result = await searchCorridors(query, { satisfiedRequirements, recordTelemetry: false });
    return { corridor, query, supported: result.counts.supported };
  }));
  const name = (session.user.name ?? session.user.email.split("@")[0] ?? "there").split(" ")[0];
  const business = onboardingPriceProfile(org.building) === "business";
  const savedPolicy = activePolicy?.policy ?? policies.find((policy) => policy.status === "draft" || policy.status === "active") ?? null;

  // A real checklist: each step is done only when the workspace shows it.
  const steps = [
    { done: true, title: "Create your workspace", href: "/app/settings", action: "Settings" },
    { done: Boolean(org.onboardingCompletedAt), title: "Tell us how you use Railor", href: "/welcome", action: "Answer 3 questions" },
    { done: corridors.length > 0, title: "Save a route to watch", href: "/app/search", action: "Find a route" },
    ...(business ? [{ done: Boolean(activePolicy), title: "Set your company rules", href: savedPolicy ? `/app/policies/${savedPolicy.id}` : "/app/policies", action: savedPolicy ? "Finish rules" : "Set rules" }] : []),
    { done: usedKeys.length > 0, title: anyKeys.length ? "Make your first API request" : "Get your API key", href: "/app/developers", action: anyKeys.length ? "Try the API" : "Get a key" },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done);

  return (
    <div className={styles.home}>
      <header className={styles.welcome}>
        <div>
          <h1>Welcome back, {name}</h1>
          <p>Check a price, keep an eye on your routes, or set up your tools.</p>
        </div>
      </header>

      <section className={styles.top} aria-label="Start here">
        <div className={styles.quote}>
          <Suspense fallback={<QuickQuoteSkeleton variant="app" />}>
            <HomeQuote organizationId={org.id} entityCountry={org.entityCountry ?? null} building={org.building ?? null} />
          </Suspense>
        </div>

        <aside className={styles.setup} aria-label="Get set up">
          <div className={styles.setupHead}>
            <div>
              <h2>{doneCount === steps.length ? "You’re all set" : "Get set up"}</h2>
              <p>{doneCount} of {steps.length} done</p>
            </div>
            <span className={styles.ring} style={{ "--progress": `${(doneCount / steps.length) * 100}%` } as React.CSSProperties} aria-hidden><span>{Math.round((doneCount / steps.length) * 100)}%</span></span>
          </div>
          <ol className={styles.steps}>
            {steps.map((step) => (
              <li key={step.title} data-done={step.done || undefined} data-next={step === next || undefined}>
                <span className={styles.stepMark} aria-hidden>{step.done ? <Check size={13} strokeWidth={3} /> : null}</span>
                <span className={styles.stepTitle}>{step.title}<span className="sr-only">{step.done ? " (done)" : " (to do)"}</span></span>
                {!step.done ? <Link href={step.href} className={`${styles.stepAction} press`}>{step.action}<ArrowRight size={13} aria-hidden /></Link> : null}
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <nav aria-label="Shortcuts" className={styles.shortcuts}>
        {[
          { href: "/app/search", title: "Find a route", body: "Who can serve your countries and currencies", Icon: Route },
          { href: "/app/freelancer", title: "Get paid", body: "Invoices and receiving options", Icon: FileText },
          { href: "/app/policies", title: "Company rules", body: "Limits, providers and approvals", Icon: ListChecks },
          { href: "/app/agent", title: "Ask the agent", body: "Describe it in plain English", Icon: Bot },
        ].map(({ href, title, body, Icon }) => (
          <Link key={href} href={href} className={`${styles.shortcut} press`}>
            <span className={styles.shortcutIcon}><Icon size={19} aria-hidden /></span>
            <span><strong>{title}</strong><small>{body}</small></span>
            <ChevronRight size={16} aria-hidden className={styles.shortcutArrow} />
          </Link>
        ))}
      </nav>

      <section className={styles.lists} aria-label="Your workspace">
        <div className={styles.panel}>
          <header><h2><Route size={17} aria-hidden />Your routes</h2><Link href="/app/corridors">View all<ChevronRight size={15} aria-hidden /></Link></header>
          {routes.length ? <ul className={styles.routes}>{routes.map(({ corridor, query, supported }) => (
            <li key={corridor.id}>
              <Link href={`/app/corridors?saved=${corridor.id}`} className={styles.route}>
                <span className={styles.routeTokens}><RoutePill value={query.sourceAsset ?? query.sourceCurrency ?? "Unknown"} /><ArrowRight size={14} aria-hidden /><RoutePill value={query.destinationCurrency ?? query.destinationCountry ?? "Unknown"} /></span>
                <span className={styles.routeLabel}>{corridor.label}</span>
                <span className={styles.routeStatus} data-warning={!supported || undefined}>{supported ? `${supported} compatible` : "Review coverage"}</span>
              </Link>
            </li>
          ))}</ul> : (
            <div className={styles.empty}>
              <Route size={24} aria-hidden />
              <h3>No saved routes yet</h3>
              <p>Save a route to see who serves it and get told when that changes.</p>
              <Link href="/app/search" className={`${styles.emptyAction} press`}>Find a route<ArrowRight size={15} aria-hidden /></Link>
            </div>
          )}
        </div>
        <div className={styles.panel}>
          <header><h2><Radar size={17} aria-hidden />Latest changes</h2><Link href="/app/changes">View all<ChevronRight size={15} aria-hidden /></Link></header>
          {alerts.length ? <ActivityCards items={alerts.map(({ alert, change, providerName, providerSlug }) => ({ id: alert.id, providerName, providerSlug, summary: change.summary, detectedAt: change.detectedAt }))} /> : (
            <div className={styles.empty}>
              <Radar size={24} aria-hidden />
              <h3>You’re all caught up</h3>
              <p>Watch a route or provider and changes to fees, limits or coverage land here.</p>
              <Link href="/app/monitoring" className={`${styles.emptyAction} press`}>Set up monitoring<ArrowRight size={15} aria-hidden /></Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
