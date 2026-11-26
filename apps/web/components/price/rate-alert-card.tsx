"use client";

import Link from "next/link";
import { useState, useTransition, type Dispatch, type SetStateAction } from "react";
import { BellRing, CalendarClock, Check, Loader2, Mail, MessageCircle } from "lucide-react";
import { removePriceAlert, savePricePair, setPriceAlert } from "../../app/app/prices/actions";
import type { SavedPair } from "../../lib/saved-pairs";
import { ALERT_UPDATES, alertUpdatesLine, planName, type Plan } from "../../lib/plans";
import { ALERT_STEPS, formatMoney } from "../../lib/rate-alert-rules";
import { transferBookmarkKey, type TransferBookmark } from "../../lib/saved-transfer";
import { toast } from "../toast";
import styles from "./rate-alert-card.module.css";

/**
 * Under the history charts: email me when this transfer gets better. Signed in,
 * the alert goes to the account's own address (shown, not typed), so setting one
 * is a step and a click. Signed out, the card points to sign-in instead of
 * collecting an address nobody has confirmed.
 */
export function RateAlertCard({ transfer, email, plan = "free", saved, onSaved }: {
  transfer: TransferBookmark;
  /** The workspace's plan: it sets how often updates are emailed. */
  plan?: Plan;
  /** The signed-in account's email, or null for a visitor. */
  email: string | null;
  saved: SavedPair[];
  onSaved: Dispatch<SetStateAction<SavedPair[]>>;
}) {
  const [step, setStep] = useState<number>(1);
  const [pending, start] = useTransition();
  const key = transferBookmarkKey(transfer);
  const pair = saved.find((item) => transferBookmarkKey(item) === key) ?? null;
  const alert = pair?.alert;
  const unavailable = transfer.from === transfer.to || transfer.amount < 1;

  const subscribe = () => start(async () => {
    let target = pair;
    if (!target) {
      const result = await savePricePair(transfer);
      if (!result.ok) { toast.error("Couldn’t save it", result.error); return; }
      const created = result.pair;
      onSaved((previous) => [created, ...previous.filter((item) => transferBookmarkKey(item) !== key)]);
      target = created;
    }
    const result = await setPriceAlert(target.id, step);
    if (!result.ok) { toast.error("Couldn’t set the alert", result.error); return; }
    const id = target.id;
    onSaved((previous) => previous.map((item) => item.id === id ? { ...item, alert: result.alert } : item));
    toast.success(`Alert set at ${formatMoney(result.alert.targetAmount, result.alert.currency)}`, `We’ll email ${email} when at least that arrives for ${transfer.from} ${transfer.amount.toLocaleString("en-US")}.`);
  });

  const remove = () => start(async () => {
    if (!pair) return;
    const result = await removePriceAlert(pair.id);
    if (!result.ok) { toast.error("Couldn’t turn it off", "Try again in a moment."); return; }
    const id = pair.id;
    onSaved((previous) => previous.map((item) => item.id === id ? { ...item, alert: undefined } : item));
    toast.success("Alert turned off");
  });

  if (email === null) {
    return (
      <section className={styles.card} aria-labelledby="rate-alert-title">
        <div className={styles.head}>
          <span className={styles.icon}><BellRing size={18} aria-hidden /></span>
          <div>
            <h3 id="rate-alert-title">Get an email when this improves</h3>
            <p>Sign in and Railor emails your account address when more arrives than today’s best price.</p>
          </div>
        </div>
        <button type="button" className={styles.primary} onClick={() => window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)}>
          Sign in to get alerts
        </button>
      </section>
    );
  }

  return (
    <section className={styles.card} aria-labelledby="rate-alert-title">
      <div className={styles.head}>
        <span className={styles.icon} data-on={alert ? "" : undefined}><BellRing size={18} aria-hidden /></span>
        <div>
          <h3 id="rate-alert-title">{alert ? "Email alert is on" : "Get an email when this improves"}</h3>
          <p>
            {alert
              ? <>We’ll email you when at least <strong>{formatMoney(alert.targetAmount, alert.currency)}</strong> arrives for {transfer.from} {transfer.amount.toLocaleString("en-US")}.</>
              : <>Pick how much more should arrive than today’s best complete price. Market estimates never trigger an email.</>}
          </p>
        </div>
      </div>

      <div className={styles.steps} role="group" aria-label="How much more should arrive">
        {ALERT_STEPS.map((value) => (
          <button key={value} type="button" className={styles.step} aria-pressed={step === value} disabled={pending || unavailable}
            onClick={() => setStep(value)} data-current={step === value ? "" : undefined}>
            +{value}%
          </button>
        ))}
      </div>

      <ul className={styles.sends} aria-label={`What the ${planName(plan)} plan sends`}>
        <li><Check size={14} aria-hidden /><span>An email when your target is reached</span></li>
        <li><CalendarClock size={14} aria-hidden /><span>{alertUpdatesLine(plan)}</span></li>
        {ALERT_UPDATES[plan].whatsapp ? <li><MessageCircle size={14} aria-hidden /><span>WhatsApp alerts</span><em>Coming soon</em></li> : null}
      </ul>
      {plan === "free" || plan === "plus" ? <p className={styles.upgrade}>{plan === "free" ? "Plus adds an email when the price moves. Pro makes updates daily." : "Pro makes updates daily."} <Link href="/pricing">See plans</Link></p> : null}

      <div className={styles.field}>
        <span>Your email address</span>
        <div className={styles.email}><Mail size={15} aria-hidden /><output>{email}</output><small>Your account email</small></div>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={pending || unavailable} onClick={subscribe}>
          {pending ? <Loader2 size={15} className={styles.spin} aria-hidden /> : alert ? <Check size={15} aria-hidden /> : <BellRing size={15} aria-hidden />}
          {alert ? "Update alert" : "Email me rate alerts"}
        </button>
        {alert ? <button type="button" className={styles.quiet} disabled={pending} onClick={remove}>Turn off</button> : null}
      </div>
      {unavailable ? <p className={styles.note}>Choose two different currencies and an amount to set an alert.</p> : null}
    </section>
  );
}
