"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BellPlus, BellRing, Loader2, Lock, X } from "lucide-react";
import { removePriceAlert, setPriceAlert } from "../../app/app/prices/actions";
import type { SavedPair } from "../../lib/saved-pairs";
import type { RateAlertSummary } from "../../lib/rate-alerts";
import { ALERT_FREQUENCIES, FREQUENCY_LABEL, FREQUENCY_PLAN, PLAN_PRICES, allowedFrequencies, type AlertFrequency, type Plan } from "../../lib/plans";
import { PRICE_CHANGE_PCT } from "../../lib/rate-alert-rules";
import { toast } from "../toast";
import styles from "./rate-alert.module.css";

const EASE = [0.23, 1, 0.32, 1] as const;
const LINE: Record<AlertFrequency, string> = { daily: "Every morning", weekly: "Once a week", smart: `When it moves ${PRICE_CHANGE_PCT}%+` };

/**
 * Email me updates for this pair: three click-only choices (daily, weekly,
 * smart) and a way to unsubscribe. A pair that isn't saved yet is saved first
 * (ensurePair). Choices the plan doesn't include are shown locked.
 */
export function RateAlertButton({ pair, ensurePair, onChange, compact = false, disabled = false, plan }: {
  pair: SavedPair | null;
  ensurePair?: () => Promise<SavedPair | null>;
  onChange: (pairId: string, alert: RateAlertSummary | undefined) => void;
  compact?: boolean;
  disabled?: boolean;
  /** The workspace's plan, to show which choices are locked. Without it every choice is offered and the server decides. */
  plan?: Plan;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const alert = pair?.alert;
  const allowed = plan ? allowedFrequencies(plan) : [...ALERT_FREQUENCIES];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  const choose = (frequency: AlertFrequency) => start(async () => {
    const target = pair ?? (await ensurePair?.()) ?? null;
    if (!target) return;
    const result = await setPriceAlert(target.id, frequency);
    if (!result.ok) { toast.error("Couldn’t turn updates on", result.error); return; }
    onChange(target.id, result.alert);
    setOpen(false);
    toast.success(`${FREQUENCY_LABEL[frequency]} updates are on`, `We’ll email you updates for ${target.from} → ${target.to}.`);
  });

  const remove = () => start(async () => {
    if (!pair) return;
    const result = await removePriceAlert(pair.id);
    if (!result.ok) { toast.error("Couldn’t unsubscribe", "Try again in a moment."); return; }
    onChange(pair.id, undefined);
    setOpen(false);
    toast.success("Unsubscribed", "No more rate emails for this transfer.");
  });

  const label = alert ? `${FREQUENCY_LABEL[alert.frequency]} updates` : compact ? "Updates" : "Email me updates";
  return (
    <div ref={root} className={styles.root}>
      <button type="button" className={`${styles.trigger} press`} data-on={alert ? "" : undefined} data-compact={compact || undefined}
        disabled={disabled || pending} aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((value) => !value)}>
        {pending ? <Loader2 size={14} className={styles.spin} aria-hidden /> : alert ? <BellRing size={14} aria-hidden /> : <BellPlus size={14} aria-hidden />}
        {label}
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div id={menuId} role="group" aria-label="Rate updates" className={styles.menu}
            initial={reduce ? false : { opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }} transition={{ duration: 0.18, ease: EASE }}>
            <p className={styles.title}>{alert ? "How often should we email you?" : "Email me updates"}</p>
            <p className={styles.hint}>The cheapest providers for this transfer, with a chart of the rate. Sent to your account email.</p>
            <div className={styles.choices}>
              {ALERT_FREQUENCIES.map((frequency) => {
                const locked = !allowed.includes(frequency);
                const needs = FREQUENCY_PLAN[frequency];
                return (
                  <button key={frequency} type="button" className={`${styles.choice} press`} aria-pressed={alert?.frequency === frequency} disabled={pending || locked}
                    title={locked && needs ? `${FREQUENCY_LABEL[frequency]} updates are on ${PLAN_PRICES[needs].name} and above` : undefined} onClick={() => choose(frequency)}>
                    <strong>{FREQUENCY_LABEL[frequency]}{locked ? <Lock size={11} aria-hidden /> : null}</strong>
                    <small>{LINE[frequency]}</small>
                  </button>
                );
              })}
            </div>
            {alert ? (
              <button type="button" className={styles.remove} disabled={pending} onClick={remove}><X size={13} aria-hidden />Unsubscribe</button>
            ) : null}
            {pending ? <p className={styles.status} role="status">Setting it up…</p> : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
