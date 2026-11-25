import { redirect } from "next/navigation";
import { CircleCheck, CircleDollarSign, CreditCard } from "lucide-react";
import { currentBillingSubscription, getDb } from "@railor/database";
import { getSession } from "../../../lib/auth";
import { getEntitlement } from "../../../lib/entitlements";
import { availableMethods } from "../../../lib/billing/config";
import { billingErrorText } from "../../../lib/billing/errors";
import { PLAN_PRICES, planName, type PaidPlan } from "../../../lib/plans";
import { contactEmail } from "../../../lib/security";
import { ProductHeader } from "../../../components/app/product-ui";
import { PlanCards } from "../../../components/plans/plan-cards";
import styles from "../../../components/plans/billing.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plans" };

const day = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const DONE: Record<string, string> = {
  changed: "Plan changed. The difference is charged or credited on your card today.",
  cancelled: "Renewal is off. You keep your plan until the end of the period you paid for.",
  resumed: "Renewal is back on.",
};

export default async function UpgradePage({ searchParams }: { searchParams: Promise<{ billing?: string; billing_error?: string }> }) {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const params = await searchParams;
  const db = await getDb();
  const [entitlement, subscription] = await Promise.all([getEntitlement(session.organization.id, db), currentBillingSubscription(db, session.organization.id)]);
  const renewing = subscription?.status === "active" ? subscription : null;
  const canBuy = session.role === "owner" || session.role === "admin";
  const contact = contactEmail();
  const error = billingErrorText(params.billing_error);
  const done = params.billing && Object.hasOwn(DONE, params.billing) ? DONE[params.billing] : null;

  const payButtons = (tier: PaidPlan) => {
    const methods = availableMethods("plan", tier);
    if (renewing) {
      // One card subscription per workspace: other plans are a switch, not a second subscription.
      return methods.card
        ? <form action="/api/billing/checkout" method="post"><input type="hidden" name="purpose" value="plan" /><input type="hidden" name="plan" value={tier} /><button type="submit" name="method" value="card">Switch to {planName(tier)}</button><span className="muted">Prorated on your card today</span></form>
        : <span className="muted">Card payments are paused. Write to us to switch plans.</span>;
    }
    if (!methods.card && !methods.usdc) return <span className="muted">Checkout is opening soon.</span>;
    return (
      <form action="/api/billing/checkout" method="post" className={styles.payForm}>
        <input type="hidden" name="purpose" value="plan" />
        <input type="hidden" name="plan" value={tier} />
        {methods.card ? <button type="submit" name="method" value="card" aria-label={`Pay for ${planName(tier)} by card or UPI`}><CreditCard size={15} aria-hidden />Card or UPI{methods.cardTest ? <small className={styles.test}>Test</small> : null}</button> : null}
        {methods.usdc ? <button type="submit" name="method" value="usdc" data-quiet={methods.card || undefined} aria-label={`Pay $${PLAN_PRICES[tier].monthlyUsd} for ${planName(tier)} in USDC`}><CircleDollarSign size={15} aria-hidden />USDC{methods.usdcTest ? <small className={styles.test}>Test</small> : null}</button> : null}
        <span className="muted">{[methods.card ? "Card renews monthly" : null, methods.usdc ? "USDC pays one month" : null].filter(Boolean).join(" · ")}</span>
      </form>
    );
  };

  return <div className="max-w-[1200px] space-y-6">
    <ProductHeader eyebrow={`${planName(entitlement.plan)} plan`} title="Pick what Railor watches for you." description="Comparing prices stays free. Plans add rate alerts, more saved transfers, route monitoring and API volume." />
    {error ? <p role="alert" className={styles.notice} data-tone="bad">{error}</p> : null}
    {done ? <p role="status" className={styles.notice} data-tone="ok"><CircleCheck size={16} aria-hidden />{done}</p> : null}
    {subscription ? (
      <section className={styles.panel} aria-labelledby="billing-title">
        <div>
          <h2 id="billing-title">{planName(subscription.plan)} plan, paid by card{subscription.testMode ? <small className={styles.test}>Test</small> : null}</h2>
          <p>
            {subscription.status === "active"
              ? subscription.cancelAtPeriodEnd
                ? `Renewal is off. Your plan ends on ${subscription.currentPeriodEnd ? day(subscription.currentPeriodEnd) : "the last day you paid for"}.`
                : `Renews on ${subscription.currentPeriodEnd ? day(subscription.currentPeriodEnd) : "the same day next month"}. Cancel any time; you keep what you paid for.`
              : `The last renewal payment didn’t go through, so Dodo Payments will try again.${entitlement.validUntil ? ` Your plan stays on until ${day(entitlement.validUntil)}.` : ""}`}
          </p>
        </div>
        {canBuy && subscription.status === "active" ? (
          <form action="/api/billing/subscription" method="post">
            <input type="hidden" name="action" value={subscription.cancelAtPeriodEnd ? "resume" : "cancel"} />
            <button type="submit" className={styles.panelButton}>{subscription.cancelAtPeriodEnd ? "Turn renewal back on" : "Cancel renewal"}</button>
          </form>
        ) : null}
      </section>
    ) : null}
    <PlanCards current={entitlement.plan} action={(tier) => {
      if (tier === "free") return <span className="muted">Always free</span>;
      if (tier === "enterprise") return contact ? <a href={`mailto:${contact}?subject=${encodeURIComponent("Railor Enterprise")}`}>Contact us</a> : <span className="muted">Write to us from your account email; sales contact is opening soon.</span>;
      if (tier === "founding") return null;
      if (entitlement.plan === "founding") return <span className="muted">Included in your Founding plan</span>;
      if (!canBuy) return <span className="muted">Ask a workspace owner or admin to upgrade.</span>;
      return payButtons(tier);
    }} />
    <p className="text-sm text-[var(--color-muted)]">
      Card and UPI plans renew every month until you cancel. USDC pays for one month at a time; pay again to add another month.
      {entitlement.validUntil && entitlement.plan !== "free" && !subscription ? <> Your {planName(entitlement.plan)} plan runs until {day(entitlement.validUntil)}.</> : null}
    </p>
  </div>;
}
