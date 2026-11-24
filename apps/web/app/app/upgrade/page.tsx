import { redirect } from "next/navigation";
import { getSession } from "../../../lib/auth";
import { getEntitlement } from "../../../lib/entitlements";
import { planName } from "../../../lib/plans";
import { contactEmail, paymentLink } from "../../../lib/security";
import { ProductHeader } from "../../../components/app/product-ui";
import { PlanCards } from "../../../components/plans/plan-cards";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plans" };

export default async function UpgradePage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const entitlement = await getEntitlement(session.organization.id);
  const canBuy = session.role === "owner" || session.role === "admin";
  const contact = contactEmail();
  const ready = (plan: "plus" | "pro" | "business") => { try { return Boolean(paymentLink(plan)); } catch { return false; } };
  return <div className="max-w-[1200px] space-y-6">
    <ProductHeader eyebrow={`${planName(entitlement.plan)} plan`} title="Pick what Railor watches for you." description="Comparing prices stays free. Plans add rate alerts, more saved transfers, route monitoring and API volume." />
    <PlanCards current={entitlement.plan} action={(tier) => {
      if (tier === "free") return <span className="muted">Always free</span>;
      if (tier === "enterprise") return contact ? <a href={`mailto:${contact}?subject=${encodeURIComponent("Railor Enterprise")}`}>Contact us</a> : <span className="muted">Write to us from your account email; sales contact is opening soon.</span>;
      if (tier === "founding") return null;
      if (!canBuy) return <span className="muted">Ask a workspace owner or admin to upgrade.</span>;
      return ready(tier)
        ? <form action="/api/billing/checkout" method="post"><input type="hidden" name="plan" value={tier} /><button type="submit">Choose {planName(tier)}</button></form>
        : <span className="muted">Checkout is opening soon.</span>;
    }} />
    <p className="text-sm text-[var(--color-muted)]">After payment, Railor checks your payment reference and turns your plan on for one month. Use your account email and workspace reference <strong>{session.organization.slug}</strong>.{entitlement.validUntil && entitlement.plan !== "free" ? <> Your {planName(entitlement.plan)} plan runs until {entitlement.validUntil.toLocaleDateString("en-GB")}.</> : null}</p>
  </div>;
}
