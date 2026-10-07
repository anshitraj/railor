import Link from "next/link";
import { redirect } from "next/navigation";
import { getDefaultActivePolicy, listDecisions, searchCorridors } from "@railor/core";
import { CorridorQuery } from "@railor/types";
import { ArrowRight, Calculator, ChevronRight, Radar, Route, ScanSearch } from "lucide-react";
import { getSession } from "../../lib/auth";
import { getKybProfile, getOrgAlerts, getSavedCorridors } from "../../lib/org";
import { RoutePill } from "../../components/app/route-pill";
import { ActivityCards } from "../../components/app/activity-cards";
import { WorkspaceSetup } from "../../components/app/workspace-setup";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const org = session.organization;
  const [corridors, alerts, kyb, activePolicy, decisions] = await Promise.all([
    getSavedCorridors(org.id), getOrgAlerts(org.id, 3), getKybProfile(org.id),
    getDefaultActivePolicy(org.id), listDecisions(org.id, { limit: 1 }),
  ]);
  const satisfiedRequirements = kyb.filter((item) => item.status === "have").map((item) => item.key);
  const routes = await Promise.all(corridors.slice(0, 3).map(async (corridor) => {
    const query = CorridorQuery.parse(corridor.query);
    const result = await searchCorridors(query, { satisfiedRequirements, recordTelemetry: false });
    return { corridor, query, supported: result.counts.supported };
  }));
  const name = session.user.name ?? session.user.email.split("@")[0];

  return (
    <div className="overview-home">
      <div className="overview-welcome">
        <h1>Welcome back, {name}</h1>
        <p>Let’s plan your next move.</p>
      </div>
      <section className="overview-actions" aria-label="Start here">
        <Link href="/app/prices" className="overview-price">
          <span className="overview-action-icon"><Calculator size={24} aria-hidden /></span>
          <div className="overview-price-copy"><span className="overview-kicker">Price check</span><h2>See what your money costs to move.</h2><p>Compare fees, exchange rates and what arrives.</p><span className="overview-price-cta">Check a price <ArrowRight size={17} aria-hidden /></span></div>
          <span className="overview-price-art" aria-hidden><RoutePill value="USD" /><ArrowRight size={20} /><RoutePill value="INR" /></span>
        </Link>
        <Link href="/app/search" className="overview-explore">
          <span className="overview-action-icon"><ScanSearch size={23} aria-hidden /></span>
          <h2>Find your route</h2><p>Explore providers for your next transfer.</p>
          <span className="overview-text-action">Search & compare <ArrowRight size={16} aria-hidden /></span>
        </Link>
      </section>
      <WorkspaceSetup organizationId={org.id} profileComplete={Boolean(org.onboardingCompletedAt)} policyActive={Boolean(activePolicy)} hasDecision={Boolean(decisions.length)} canEditPolicy={["owner", "admin"].includes(session.role ?? "")} canDecide={session.role !== "viewer"} />
      <section className="overview-summary" aria-label="Your workspace">
        <div className="overview-section">
          <header><h2><Route size={18} aria-hidden /> Your routes</h2><Link href="/app/corridors">View all <ChevronRight size={15} aria-hidden /></Link></header>
          {routes.length ? <ul>{routes.map(({ corridor, query, supported }) => <li key={corridor.id}>
            <Link href={`/app/corridors?saved=${corridor.id}`} className="overview-route">
              <span className="overview-route-tokens"><RoutePill value={query.sourceAsset ?? query.sourceCurrency ?? "Unknown"} /><ArrowRight size={14} aria-hidden /><RoutePill value={query.destinationCurrency ?? query.destinationCountry ?? "Unknown"} /></span>
              <span className="overview-route-label">{corridor.label}</span>
              <span className="overview-route-status" data-warning={!supported}>{supported ? `${supported} compatible` : "Review coverage"}{corridor.suggested ? " · Suggested" : ""}</span>
              <ChevronRight size={16} aria-hidden />
            </Link>
          </li>)}</ul> : <div className="overview-empty"><Route size={26} aria-hidden /><h3>Keep your routes in one place.</h3><p>Save a route to watch its providers and coverage.</p><Link href="/app/corridors" className="overview-text-action">Explore a route <ArrowRight size={16} aria-hidden /></Link></div>}
        </div>
        <div className="overview-section">
          <header><h2><Radar size={18} aria-hidden /> Latest activity</h2><Link href="/app/changes">View all <ChevronRight size={15} aria-hidden /></Link></header>
          {alerts.length ? <ActivityCards items={alerts.map(({ alert, change, providerName, providerSlug }) => ({ id: alert.id, providerName, providerSlug, summary: change.summary, detectedAt: change.detectedAt }))} /> : <div className="overview-empty"><Radar size={26} aria-hidden /><h3>You’re all caught up.</h3><p>Watch a route or provider for changes.</p><Link href="/app/monitoring" className="overview-text-action">Set up monitoring <ArrowRight size={16} aria-hidden /></Link></div>}
        </div>
      </section>
    </div>
  );
}
