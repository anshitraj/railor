"use client";

import Link from "next/link";
import { useState, useTransition, type Dispatch, type SetStateAction } from "react";
import { BellRing, CalendarDays, Check, Loader2, Lock, Mail, MessageCircle, Sparkles, Sun } from "lucide-react";
import { removePriceAlert, savePricePair, setPriceAlert } from "../../app/app/prices/actions";
import { subscribeToRateUpdates } from "../../app/(public)/prices/alert-actions";
import type { SavedPair } from "../../lib/saved-pairs";
import { ALERT_FREQUENCIES, FREQUENCY_LABEL, FREQUENCY_PLAN, PLAN_PRICES, allowedFrequencies, whatsappComing, type AlertFrequency, type Plan } from "../../lib/plans";
import { PRICE_CHANGE_PCT, formatMoney } from "../../lib/rate-alert-rules";
import { transferBookmarkKey, type TransferBookmark } from "../../lib/saved-transfer";
import { toast } from "../toast";
import styles from "./rate-alert-card.module.css";

const OPTION: Record<AlertFrequency, { icon: typeof Sun; line: string }> = {
  daily: { icon: Sun, line: "The best price today, every morning." },
  weekly: { icon: CalendarDays, line: "One email a week with the best price." },
  smart: { icon: Sparkles, line: `Only when the best price moves by ${PRICE_CHANGE_PCT}% or more.` },
};

const WHEN: Record<AlertFrequency, string> = { daily: "Your first update arrives tomorrow.", weekly: "Your first update arrives in a week.", smart: "You’ll hear when the best price moves." };

type Done = { kind: "account" | "confirm"; email: string; frequency: AlertFrequency };

/**
 * Under the history charts: get rate updates by email. Pick how often (daily,
 * weekly or smart), confirm, and you're told what happens next. Signed in, the
 * updates go to the account's own address; signed out, the address you type must
 * confirm from its own inbox before anything is sent. Either way every email
 * carries an unsubscribe link, and signed-in people can stop them from Saved.
 */
export function RateAlertCard({ transfer, email, plan = "free", saved, onSaved }: {
  transfer: TransferBookmark;
  /** The signed-in account's email, or null for a visitor. */
  email: string | null;
  plan?: Plan;
  saved: SavedPair[];
  onSaved: Dispatch<SetStateAction<SavedPair[]>>;
}) {
  const signedIn = email !== null;
  const [frequency, setFrequency] = useState<AlertFrequency>("weekly");
  const [address, setAddress] = useState("");
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState("");
  const [lockedHint, setLockedHint] = useState<AlertFrequency | null>(null);
  const [changing, setChanging] = useState(false);
  const [pending, start] = useTransition();
  const key = transferBookmarkKey(transfer);
  const pair = saved.find((item) => transferBookmarkKey(item) === key) ?? null;
  const alert = pair?.alert;
  const unavailable = transfer.from === transfer.to || transfer.amount < 1;
  // Someone who isn't signed in has no plan: weekly is the one way to be updated without an account.
  const allowed: AlertFrequency[] = signedIn ? allowedFrequencies(plan) : ["weekly"];
  const sent = `${formatMoney(transfer.amount, transfer.from)} to ${transfer.to}`;

  const choose = (value: AlertFrequency) => {
    if (!allowed.includes(value)) { setLockedHint(value); return; }
    setLockedHint(null);
    setFrequency(value);
  };

  const submitSignedIn = () => start(async () => {
    setError("");
    let target = pair;
    if (!target) {
      const result = await savePricePair(transfer);
      if (!result.ok) { setError(result.error); return; }
      const created = result.pair;
      onSaved((previous) => [created, ...previous.filter((item) => transferBookmarkKey(item) !== key)]);
      target = created;
    }
    const result = await setPriceAlert(target.id, frequency);
    if (!result.ok) { setError(result.error); return; }
    const id = target.id;
    onSaved((previous) => previous.map((item) => item.id === id ? { ...item, alert: result.alert } : item));
    setChanging(false);
    setDone({ kind: "account", email: email!, frequency });
    toast.success(`${FREQUENCY_LABEL[frequency]} updates are on`, `We’ll email ${email}.`);
  });

  const submitGuest = () => start(async () => {
    setError("");
    const result = await subscribeToRateUpdates({ email: address, from: transfer.from, to: transfer.to, amount: transfer.amount });
    if (!result.ok) { setError(result.error); return; }
    setDone({ kind: "confirm", email: result.email, frequency: "weekly" });
  });

  const stop = () => start(async () => {
    if (!pair) return;
    const result = await removePriceAlert(pair.id);
    if (!result.ok) { setError("Couldn’t unsubscribe. Try again in a moment."); return; }
    const id = pair.id;
    onSaved((previous) => previous.map((item) => item.id === id ? { ...item, alert: undefined } : item));
    setDone(null);
    toast.success("Unsubscribed", "No more rate emails for this transfer.");
  });

  // What is already on, or what was just set.
  if (signedIn && (alert || done?.kind === "account") && !changing) {
    const active = alert?.frequency ?? done!.frequency;
    return (
      <section className={styles.card} aria-labelledby="rate-alert-title" data-state="on">
        <div className={styles.confirmed} role="status">
          <span className={styles.check}><Check size={20} aria-hidden /></span>
          <div>
            <h3 id="rate-alert-title">{done ? "You’re all set." : "Rate updates are on"}</h3>
            <p>We’ll email <strong>{email}</strong> {FREQUENCY_LABEL[active].toLowerCase()} updates for {sent}. {WHEN[active]}</p>
          </div>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.quiet} onClick={() => { setChanging(true); setFrequency(active); setDone(null); }}>Change how often</button>
          <button type="button" className={styles.quiet} data-danger disabled={pending} onClick={stop}>Unsubscribe</button>
        </div>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </section>
    );
  }

  if (done?.kind === "confirm") {
    return (
      <section className={styles.card} aria-labelledby="rate-alert-title" data-state="confirm">
        <div className={styles.confirmed} role="status">
          <span className={styles.check}><Mail size={20} aria-hidden /></span>
          <div>
            <h3 id="rate-alert-title">Check your inbox</h3>
            <p>We sent a confirmation link to <strong>{done.email}</strong>. Tap it and weekly updates for {sent} start. Nothing is sent before you confirm, and every email has an unsubscribe link.</p>
          </div>
        </div>
        <div className={styles.actions}><button type="button" className={styles.quiet} onClick={() => setDone(null)}>Use another email</button></div>
      </section>
    );
  }

  return (
    <section className={styles.card} aria-labelledby="rate-alert-title">
      <div className={styles.head}>
        <span className={styles.icon}><BellRing size={18} aria-hidden /></span>
        <div>
          <h3 id="rate-alert-title">Get rate updates by email</h3>
          <p>The cheapest providers for {sent}, with a chart of the rate. Choose how often.</p>
        </div>
      </div>

      <div className={styles.field}>
        <span id="alert-email-label">Your email address</span>
        {signedIn
          ? <div className={styles.email}><Mail size={15} aria-hidden /><output aria-labelledby="alert-email-label">{email}</output><small>Your account email</small></div>
          : <input className={styles.input} type="email" inputMode="email" autoComplete="email" placeholder="name@example.com" value={address} onChange={(event) => setAddress(event.target.value)} aria-labelledby="alert-email-label" />}
      </div>

      <div className={styles.field}>
        <span id="alert-frequency-label">How often?</span>
        <div className={styles.options} role="radiogroup" aria-labelledby="alert-frequency-label">
          {ALERT_FREQUENCIES.map((value) => {
            const Icon = OPTION[value].icon;
            const locked = !allowed.includes(value);
            const needs = FREQUENCY_PLAN[value];
            return (
              <button key={value} type="button" role="radio" aria-checked={frequency === value && !locked} aria-disabled={locked || undefined} className={styles.option} data-locked={locked || undefined} onClick={() => choose(value)}>
                <span className={styles.optionHead}><Icon size={16} aria-hidden /><strong>{FREQUENCY_LABEL[value]}</strong>{locked && needs ? <em><Lock size={11} aria-hidden />{PLAN_PRICES[needs].name}</em> : null}</span>
                <small>{OPTION[value].line}</small>
              </button>
            );
          })}
        </div>
        {lockedHint ? <p className={styles.hint}>{FREQUENCY_LABEL[lockedHint]} updates are on {PLAN_PRICES[FREQUENCY_PLAN[lockedHint]!].name} (${PLAN_PRICES[FREQUENCY_PLAN[lockedHint]!].monthlyUsd} a month) and above. <Link href={signedIn ? "/app/upgrade" : "/pricing"}>See plans</Link></p> : null}
        {signedIn && whatsappComing(plan) ? <p className={styles.soon}><MessageCircle size={14} aria-hidden />WhatsApp alerts <em>Coming soon</em></p> : null}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={pending || unavailable || (!signedIn && !address.includes("@"))} onClick={signedIn ? submitSignedIn : submitGuest}>
          {pending ? <Loader2 size={15} className={styles.spin} aria-hidden /> : <BellRing size={15} aria-hidden />}
          {changing ? "Update my emails" : "Send me updates"}
        </button>
        {changing ? <button type="button" className={styles.quiet} onClick={() => setChanging(false)}>Cancel</button> : null}
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {unavailable ? <p className={styles.note}>Choose two different currencies and an amount to set up updates.</p> : <p className={styles.note}>{signedIn ? "We’ll confirm here and in your first email. You can unsubscribe any time from Saved or from any email." : "We’ll email a link to confirm it’s you. You can unsubscribe from any email."}</p>}
    </section>
  );
}
