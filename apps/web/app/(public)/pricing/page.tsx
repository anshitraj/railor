import Link from "next/link";
import { PageHeader } from "../../../components/marketing/page-header";
import { PlanCards } from "../../../components/plans/plan-cards";
import { getSession } from "../../../lib/auth";
import { getEntitlement } from "../../../lib/entitlements";
import { contactEmail } from "../../../lib/security";

export const metadata = { title: "Pricing", description: "Comparing what arrives is free. Plans from $2.99 a month add rate alerts, saved transfers, route monitoring and API volume." };
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const session = await getSession().catch(() => null);
  const current = session?.organization ? (await getEntitlement(session.organization.id).catch(() => null))?.plan : undefined;
  const contact = contactEmail();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader eyebrow="Pricing" title="Checking prices is free. Watching them costs less than a coffee.">
        <p>Compare what actually arrives through every provider without paying or signing in. Pick a plan when you want Railor to keep watching: rate alerts, saved transfers, route changes and API access.</p>
      </PageHeader>
      <PlanCards current={current} action={(tier) => {
        if (tier === "enterprise") return contact ? <a href={`mailto:${contact}?subject=${encodeURIComponent("Railor Enterprise")}`}>Contact us</a> : <span className="muted">Sales contact is opening soon.</span>;
        if (tier === "free") return <Link href={session ? "/app/prices" : "/login?intent=start"}>{session ? "Compare prices" : "Start free"}</Link>;
        return <Link href={session ? "/app/upgrade" : "/login?intent=start"}>{session ? "Upgrade" : "Start free, upgrade any time"}</Link>;
      }} />
    </div>
  );
}
