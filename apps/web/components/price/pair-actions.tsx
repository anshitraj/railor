"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BellPlus, Bookmark, BookmarkCheck, X } from "lucide-react";
import { removePricePair, savePricePair } from "../../app/app/prices/actions";
import type { SavedPair } from "../../lib/saved-pairs";
import { toast } from "../toast";
import styles from "./pair-actions.module.css";

const EASE = [0.23, 1, 0.32, 1] as const;

/** Save this pair, or (soon) set a reminder on it. */
export function PairActions({ from, to, amount, profile, saved, onSaved }: { from: string; to: string; amount: number; profile?: string; saved: SavedPair[]; onSaved: (next: SavedPair[]) => void }) {
  const [pending, start] = useTransition();
  const current = saved.find((pair) => pair.from === from && pair.to === to);
  const toggle = () => start(async () => {
    if (current) {
      const result = await removePricePair(current.id);
      if (result.ok) { onSaved(saved.filter((pair) => pair.id !== current.id)); toast.success(`${from} → ${to} removed`); }
      else toast.error("Couldn’t remove it", "Try again in a moment.");
      return;
    }
    const result = await savePricePair({ from, to, amount, profile });
    if (result.ok) { onSaved([result.pair, ...saved.filter((pair) => !(pair.from === from && pair.to === to))]); toast.success(`${from} → ${to} saved`, "Find it above the calculator any time."); }
    else toast.error("Couldn’t save it", result.error);
  });
  return (
    <div className={styles.actions}>
      <button type="button" className={`${styles.action} press`} data-on={current ? "" : undefined} disabled={pending || from === to} onClick={toggle} aria-pressed={Boolean(current)}>
        {current ? <BookmarkCheck size={15} aria-hidden /> : <Bookmark size={15} aria-hidden />}
        {current ? "Saved" : `Save ${from} → ${to}`}
      </button>
      <button type="button" className={styles.action} disabled title="Reminders are coming soon" aria-describedby="reminder-soon">
        <BellPlus size={15} aria-hidden />Create reminder
        <span id="reminder-soon" className={styles.soon}>Coming soon</span>
      </button>
    </div>
  );
}

/** Saved pairs as chips: tap one to load it, × to remove it. */
export function SavedPairsStrip({ saved, active, onPick, onSaved }: { saved: SavedPair[]; active: { from: string; to: string }; onPick: (pair: SavedPair) => void; onSaved: (next: SavedPair[]) => void }) {
  const reduce = useReducedMotion();
  const [, start] = useTransition();
  if (!saved.length) return null;
  return (
    <div className={styles.strip} aria-label="Saved pairs">
      <span className={styles.stripLabel}><Bookmark size={13} aria-hidden />Saved</span>
      <ul>
        <AnimatePresence initial={false}>
          {saved.map((pair) => (
            <motion.li key={pair.id} layout={!reduce} initial={reduce ? false : { opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={{ duration: 0.2, ease: EASE }}>
              <span className={styles.chip} data-active={pair.from === active.from && pair.to === active.to ? "" : undefined}>
                <button type="button" onClick={() => onPick(pair)}>{pair.from} → {pair.to}<small>{pair.amount.toLocaleString("en-US")}</small></button>
                <button type="button" className={styles.remove} aria-label={`Remove ${pair.from} to ${pair.to}`} onClick={() => start(async () => {
                  const result = await removePricePair(pair.id);
                  if (result.ok) onSaved(saved.filter((item) => item.id !== pair.id));
                })}><X size={12} /></button>
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
