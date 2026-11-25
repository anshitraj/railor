"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CircleAlert, CircleCheck, CreditCard, ExternalLink, LoaderCircle, RotateCcw } from "lucide-react";
import type { CheckoutView } from "../../../lib/billing/view";
import styles from "./checkout-status.module.css";

const PLAN_NAMES = { plus: "Plus", pro: "Pro", business: "Business" } as const;
const POLL_MS = 2_500;
const GIVE_UP_MS = 15 * 60_000;
const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Still worth asking: unpaid and not expired, or paid for a plan that hasn't switched on yet. */
const waiting = (view: CheckoutView) => (view.status !== "paid" && !view.expired) || (view.status === "paid" && view.purpose === "plan" && view.planActive === false);

/**
 * Where a payment stands after the checkout page. It asks Railor every few
 * seconds while the payment is unconfirmed; Railor in turn asks the provider,
 * so this works even before the provider's webhook arrives.
 */
export function CheckoutStatus({ id, initial }: { id: string; initial: CheckoutView }) {
  const [view, setView] = useState(initial);
  const [gaveUp, setGaveUp] = useState(false);
  // Bumped after every attempt, so a failed request still schedules the next one.
  const [attempt, setAttempt] = useState(0);
  const started = useRef(Date.now());

  useEffect(() => {
    if (!waiting(view) || gaveUp) return;
    let cancelled = false;
    const check = async () => {
      if (Date.now() - started.current > GIVE_UP_MS) { setGaveUp(true); return; }
      try {
        const response = await fetch(`/api/billing/checkouts/${id}`, { cache: "no-store" });
        if (response.ok && !cancelled) setView(await response.json() as CheckoutView);
      } catch { /* the next attempt tries again */ }
      if (!cancelled) setAttempt((count) => count + 1);
    };
    // Slower while the tab is in the background; straight away when it comes back.
    const timer = window.setTimeout(check, document.visibilityState === "visible" ? POLL_MS : POLL_MS * 4);
    const onVisible = () => { if (document.visibilityState === "visible") { window.clearTimeout(timer); void check(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [id, view, gaveUp, attempt]);

  const what = view.purpose === "plan" && view.plan ? `${PLAN_NAMES[view.plan]} plan` : `${usd(view.amountCents)} wallet top-up`;
  const back = view.purpose === "plan" ? "/app/upgrade" : "/app/wallet";
  const state = view.status === "paid" ? "paid" : view.expired ? "expired" : view.status === "failed" ? "failed" : "pending";

  return (
    <section className={styles.card} data-state={state} aria-live="polite">
      <div className={styles.meta}>
        <span>{view.method === "card" ? "Card or UPI" : "USDC on Arc"}</span>
        <span aria-hidden>·</span>
        <span>{what}</span>
        {view.testMode ? <span className={styles.test}>Test payment</span> : null}
      </div>

      {state === "paid" ? (
        <>
          <span className={styles.icon} data-tone="ok"><CircleCheck size={26} aria-hidden /></span>
          {view.purpose === "top_up" ? (
            <>
              <h1>{usd(view.amountCents)} added to your wallet</h1>
              <p>It’s in your balance now and shows in billing history.</p>
              <div className={styles.actions}><Link className={styles.primary} href="/app/wallet">Go to wallet<ArrowUpRight size={16} aria-hidden /></Link></div>
            </>
          ) : view.planActive === false ? (
            <>
              <h1>Payment received</h1>
              <p className={styles.waitLine}><LoaderCircle className={styles.spin} size={16} aria-hidden />Turning on {view.plan ? PLAN_NAMES[view.plan] : "your plan"}. This takes a few seconds.</p>
            </>
          ) : (
            <>
              <h1>{view.plan ? PLAN_NAMES[view.plan] : "Your plan"} is on</h1>
              <p>{view.method === "card" ? "It renews every month by card until you cancel. You can cancel any time on Plans." : view.planUntil ? `Paid through ${day(view.planUntil)}. Pay again before then to add another month.` : "Paid for one month."}</p>
              <div className={styles.actions}>
                <Link className={styles.primary} href="/app">Back to Railor<ArrowUpRight size={16} aria-hidden /></Link>
                <Link className={styles.ghost} href="/app/upgrade">See your plan</Link>
              </div>
            </>
          )}
        </>
      ) : state === "failed" || state === "expired" ? (
        <>
          <span className={styles.icon} data-tone="bad"><CircleAlert size={26} aria-hidden /></span>
          <h1>{state === "expired" ? "This checkout expired" : "The payment didn’t go through"}</h1>
          <p>{state === "expired" ? "Nothing was charged. Start a new checkout to pay." : view.failureReason ?? "Nothing was charged. You can try again."}</p>
          <div className={styles.actions}><Link className={styles.primary} href={back}><RotateCcw size={16} aria-hidden />Try again</Link></div>
        </>
      ) : view.method === "usdc" ? (
        <>
          <span className={styles.icon}><LoaderCircle className={styles.spin} size={26} aria-hidden /></span>
          <h1>Pay {usd(view.amountCents)} in USDC</h1>
          <p>Open the checkout, pay from your wallet, and keep this page open. It updates by itself when the payment confirms on Arc.</p>
          <div className={styles.actions}>
            {view.checkoutUrl ? <a className={styles.primary} href={view.checkoutUrl} target="_blank" rel="noopener noreferrer">Open USDC checkout<ExternalLink size={16} aria-hidden /></a> : null}
            <Link className={styles.ghost} href={back}>Cancel</Link>
          </div>
          {gaveUp ? <p className={styles.note}>Still nothing after a while. If you paid, refresh this page; otherwise start again.</p> : null}
        </>
      ) : (
        <>
          <span className={styles.icon}><LoaderCircle className={styles.spin} size={26} aria-hidden /></span>
          <h1>Confirming your payment</h1>
          <p className={styles.waitLine}><CreditCard size={16} aria-hidden />Checking with the card processor. This usually takes a few seconds.</p>
          {gaveUp ? <p className={styles.note}>This is taking longer than usual. Refresh to check again; you won’t be charged twice.</p> : null}
        </>
      )}
    </section>
  );
}
