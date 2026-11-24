"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BellPlus, BellRing, Loader2, X } from "lucide-react";
import { removePriceAlert, setPriceAlert } from "../../app/app/prices/actions";
import type { SavedPair } from "../../lib/saved-pairs";
import type { RateAlertSummary } from "../../lib/rate-alerts";
import { ALERT_STEPS, formatMoney } from "../../lib/rate-alert-rules";
import { toast } from "../toast";
import styles from "./rate-alert.module.css";

const EASE = [0.23, 1, 0.32, 1] as const;

/**
 * Email me when this pair gets better: three click-only steps over today's best
 * complete price. A pair that isn't saved yet is saved first (ensurePair).
 */
export function RateAlertButton({ pair, ensurePair, onChange, compact = false, disabled = false }: {
  pair: SavedPair | null;
  ensurePair?: () => Promise<SavedPair | null>;
  onChange: (pairId: string, alert: RateAlertSummary | undefined) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const alert = pair?.alert;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  const choose = (step: number) => start(async () => {
    const target = pair ?? (await ensurePair?.()) ?? null;
    if (!target) return;
    const result = await setPriceAlert(target.id, step);
    if (!result.ok) { toast.error("Couldn’t set the alert", result.error); return; }
    onChange(target.id, result.alert);
    setOpen(false);
    toast.success(`Alert set at ${formatMoney(result.alert.targetAmount, result.alert.currency)}`, `We’ll email you when at least that arrives for ${target.from} ${target.amount.toLocaleString("en-US")}.`);
  });

  const remove = () => start(async () => {
    if (!pair) return;
    const result = await removePriceAlert(pair.id);
    if (!result.ok) { toast.error("Couldn’t remove the alert", "Try again in a moment."); return; }
    onChange(pair.id, undefined);
    setOpen(false);
    toast.success("Alert removed");
  });

  const label = alert ? `Alert at ${formatMoney(alert.targetAmount, alert.currency)}` : compact ? "Alert me" : "Email me when it improves";
  return (
    <div ref={root} className={styles.root}>
      <button type="button" className={`${styles.trigger} press`} data-on={alert ? "" : undefined} data-compact={compact || undefined}
        disabled={disabled || pending} aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((value) => !value)}>
        {pending ? <Loader2 size={14} className={styles.spin} aria-hidden /> : alert ? <BellRing size={14} aria-hidden /> : <BellPlus size={14} aria-hidden />}
        {label}
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div id={menuId} role="group" aria-label="Rate alert" className={styles.menu}
            initial={reduce ? false : { opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }} transition={{ duration: 0.18, ease: EASE }}>
            <p className={styles.title}>{alert ? "Change when we email you" : "Email me when this much more arrives"}</p>
            <p className={styles.hint}>
              {alert?.baselineAmount ? <>Measured from {formatMoney(alert.baselineAmount, alert.currency)}, the best complete price when you set it.</> : <>Measured from today’s best complete price. Market estimates never trigger an alert.</>}
            </p>
            <div className={styles.steps}>
              {ALERT_STEPS.map((step) => (
                <button key={step} type="button" className={`${styles.step} press`} disabled={pending} onClick={() => choose(step)}>+{step}%</button>
              ))}
            </div>
            {alert ? (
              <button type="button" className={styles.remove} disabled={pending} onClick={remove}><X size={13} aria-hidden />Remove alert</button>
            ) : null}
            {pending ? <p className={styles.status} role="status">Checking today’s price…</p> : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
