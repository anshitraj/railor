import Link from "next/link";
import { Check, Gauge, Sparkles } from "lucide-react";
import { PLAN_LIMITS, PLAN_PRICES, type PaidPlan, type Plan } from "../../lib/plans";
import styles from "./plan-cards.module.css";

const n = (value: number) => value.toLocaleString("en-US");

type Tier = { id: Plan | "enterprise"; name: string; price: string; per?: string; who: string; features: string[]; popular?: boolean };

function tiers(): Tier[] {
  const plan = (id: PaidPlan) => ({ id, name: PLAN_PRICES[id].name, price: `$${PLAN_PRICES[id].monthlyUsd}`, per: "/ month" });
  const { free, plus, pro, business } = PLAN_LIMITS;
  return [
    { id: "free", name: "Free", price: "$0", who: "Check any price, any time.", features: [
      "Unlimited price checks", `${n(free.savedPairs)} saved transfers`, `${free.rateAlerts} rate alert by email, with a weekly rate email`, `${free.savedCorridors} saved routes · ${free.monitors} monitor`, `${n(free.apiRequests)} API requests a month`,
    ] },
    { ...plan("plus"), who: "For people who send money often.", features: [
      "Everything in Free", `${plus.rateAlerts} rate alerts by email, weekly and when the best price moves`, `${n(plus.savedPairs)} saved transfers`, `Email when a watched route changes (${plus.monitors} monitors)`, `${n(plus.apiRequests)} API requests a month`,
    ] },
    { ...plan("pro"), popular: true, who: "For freelancers and small teams paid from abroad.", features: [
      "Everything in Plus", `${pro.rateAlerts} rate alerts by email, daily and when the best price moves`, "WhatsApp alerts (coming soon)", `${n(pro.savedPairs)} saved transfers · ${pro.savedCorridors} routes · ${pro.monitors} monitors`, "Connect your own provider accounts for your exact quotes", `${n(pro.apiRequests)} API and MCP requests a month`,
    ] },
    { ...plan("business"), who: "For finance teams and products built on Railor.", features: [
      "Everything in Pro", `${business.rateAlerts} rate alerts by email`, `${n(business.savedPairs)} saved transfers · ${business.savedCorridors} routes · ${business.monitors} monitors`, `${n(business.apiRequests)} API and MCP requests a month`, "Your team shares saved transfers and routes",
    ] },
    { id: "enterprise", name: "Enterprise", price: "Custom", who: "For platforms, banks and high volume.", features: [
      "Volume beyond Business", "Pricing data feeds and exports", "Uptime commitment and invoicing", "A named contact",
    ] },
  ];
}

/**
 * The plans, side by side. Checking a price is free on every plan, so the free
 * tier leads with that; paid plans add what you keep and what Railor watches.
 * `action` renders each card's button (checkout in the app, sign-up in public).
 */
export function PlanCards({ current, action }: { current?: Plan; action: (tier: Plan | "enterprise") => React.ReactNode }) {
  return (
    <div className={styles.wrap}>
      <p className={styles.free}><Sparkles size={15} aria-hidden />Checking what arrives is free on every plan, signed in or not. Plans add alerts, saved transfers, monitoring and API volume.</p>
      <ul className={styles.grid}>
        {tiers().map((tier) => {
          const active = current === tier.id || (current === "founding" && tier.id === "business");
          return (
            <li key={tier.id} className={styles.card} data-popular={tier.popular || undefined} data-current={active || undefined}>
              <header>
                <div className={styles.nameRow}>
                  <h2>{tier.name}</h2>
                  {active ? <span className={styles.badge}>Your plan</span> : tier.popular ? <span className={styles.badge} data-tone="accent">Most popular</span> : null}
                </div>
                <p className={styles.price}>{tier.price}{tier.per ? <small>{tier.per}</small> : null}</p>
                <p className={styles.who}>{tier.who}</p>
              </header>
              <ul className={styles.features}>
                {tier.features.map((feature) => <li key={feature}><Check size={14} aria-hidden />{feature}</li>)}
              </ul>
              <div className={styles.action}>{active ? <span className={styles.currentNote}>You’re on this plan</span> : action(tier.id)}</div>
            </li>
          );
        })}
      </ul>
      <section className={styles.usage} aria-labelledby="usage-title">
        <Gauge size={18} aria-hidden />
        <div>
          <h2 id="usage-title">Pay per usage <span className={styles.soon}>Coming soon</span></h2>
          <p>Top up your Railor wallet and pay only for the API calls, MCP tool calls and alert checks you use, with no monthly plan. Your $5 signup credit will count toward it. Until then, every request is covered by your plan’s monthly allowance.</p>
        </div>
      </section>
      <p className={styles.fine}>Prices in US dollars, before any local tax. Railor gives research and comparisons; your money always stays with the provider you choose. <Link href="/legal/terms">Terms</Link></p>
    </div>
  );
}
