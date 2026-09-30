import { redirect } from "next/navigation";
import { Card, SectionLabel } from "@railor/ui";
import { getSession } from "../../../lib/auth";
import { getEntitlement } from "../../../lib/entitlements";
import { paymentLink } from "../../../lib/security";

export const dynamic = "force-dynamic";
export const metadata = { title: "Upgrade" };
export default async function UpgradePage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const entitlement = await getEntitlement(session.organization.id);
  const configured = Boolean(paymentLink());
  return <main id="main" className="max-w-[850px] space-y-6">
    <SectionLabel>Founding access</SectionLabel>
    <h1 className="text-4xl font-semibold tracking-tight">Make the next provider decision with evidence.</h1>
    <p className="text-[var(--color-muted)]">Keep your shortlist, follow infrastructure changes, and bring your own provider accounts when you need a quote.</p>
    <div className="grid gap-5 sm:grid-cols-2">
      <Card className="space-y-4 p-6"><h2 className="text-xl font-semibold">Free</h2><p className="text-3xl">$0</p>
        <ul className="space-y-2 text-sm"><li>Public catalog and corridor search</li><li>3 saved corridors</li><li>1 in-app monitor</li><li>500 API requests per month</li></ul>
      </Card>
      <Card className="space-y-4 border-[var(--color-ink)] p-6"><h2 className="text-xl font-semibold">Founding</h2><p className="text-3xl">$29<span className="text-sm text-[var(--color-muted)]"> / month</span></p>
        <ul className="space-y-2 text-sm"><li>50 saved corridors and 25 monitors</li><li>Email change alerts</li><li>Comparison exports</li><li>Your provider connections and supported live quotes</li><li>10,000 API requests per month</li></ul>
        {entitlement.plan === "founding" ? <p className="text-sm">Active until {entitlement.validUntil?.toLocaleDateString("en-GB")}</p> : configured ?
          <form action="/api/billing/checkout" method="post"><button className="rounded-full bg-[var(--color-ink)] px-5 py-3 text-sm text-white">Continue to secure payment →</button></form> :
          <p className="text-sm text-[var(--color-muted)]">Founding checkout is opening soon. Your free workspace is ready to use.</p>}
      </Card>
    </div>
    <p className="text-sm text-[var(--color-muted)]">After payment, Railor verifies your payment reference and activates one month of access manually. Payment alone does not activate a plan. Use your account email and workspace reference <strong>{session.organization.slug}</strong>. Railor provides research and recommendations; funds remain with your selected provider.</p>
  </main>;
}
