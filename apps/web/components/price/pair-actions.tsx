"use client";

import Link from "next/link";
import { useTransition, type Dispatch, type SetStateAction } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BellPlus, Bookmark, BookmarkCheck, X } from "lucide-react";
import { removePricePair, savePricePair } from "../../app/app/prices/actions";
import type { SavedPair } from "../../lib/saved-pairs";
import { savedTransferHref, transferBookmarkKey, type TransferBookmark } from "../../lib/saved-transfer";
import { toast } from "../toast";
import styles from "./pair-actions.module.css";

const EASE = [0.23, 1, 0.32, 1] as const;

type SavedControls = { saved: SavedPair[]; onSaved: Dispatch<SetStateAction<SavedPair[]>> };

export function TransferBookmarkButton({ transfer, saved, onSaved }: SavedControls & { transfer: TransferBookmark }) {
  const [pending, start] = useTransition();
  const { from, to, amount, provider } = transfer;
  const key = transferBookmarkKey(transfer);
  const title = provider ? `${provider.name} · ${from} → ${to}` : `${from} → ${to}`;
  const current = saved.find(pair => transferBookmarkKey(pair) === key);
  const toggle = () => start(async () => {
    if (current) {
      const result = await removePricePair(current.id);
      if (result.ok) { onSaved(previous => previous.filter(pair => pair.id !== current.id)); toast.success(`${title} removed`); }
      else toast.error("Couldn’t remove it", "Try again in a moment.");
      return;
    }
    const result = await savePricePair(transfer);
    if (result.ok) { onSaved(previous => [result.pair, ...previous.filter(pair => transferBookmarkKey(pair) !== key)]); toast.success(`${title} saved`, "Open it any time from Saved."); }
    else toast.error("Couldn’t save it", result.error);
  });
  return <button type="button" className={`${styles.action} press`} data-on={current ? "" : undefined} disabled={pending || from === to || amount < 1} onClick={toggle} aria-pressed={Boolean(current)}>
    {current ? <BookmarkCheck size={15} aria-hidden /> : <Bookmark size={15} aria-hidden />}
    {provider ? current ? `${provider.name} corridor saved` : `Save ${provider.name} corridor` : current ? "Pair saved" : `Save ${from} → ${to} pair`}
  </button>;
}

export function PairActions({ transfer, saved, onSaved }: SavedControls & { transfer: TransferBookmark }) {
  return (
    <div className={styles.actions}>
      <TransferBookmarkButton transfer={transfer} saved={saved} onSaved={onSaved} />
      <button type="button" className={styles.action} disabled title="Reminders are coming soon" aria-describedby="reminder-soon">
        <BellPlus size={15} aria-hidden />Create reminder
        <span id="reminder-soon" className={styles.soon}>Coming soon</span>
      </button>
    </div>
  );
}

/** Saved pairs as chips: tap one to load it, × to remove it. */
export function SavedPairsStrip({ saved, active, onSaved }: SavedControls & { active: TransferBookmark }) {
  const reduce = useReducedMotion();
  const [, start] = useTransition();
  if (!saved.length) return null;
  return (
    <div className={styles.strip} aria-label="Saved transfers">
      <span className={styles.stripLabel}><Bookmark size={13} aria-hidden />Saved</span>
      <ul>
        <AnimatePresence initial={false}>
          {saved.map((pair) => (
            <motion.li key={pair.id} layout={!reduce} initial={reduce ? false : { opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={{ duration: 0.2, ease: EASE }}>
              <span className={styles.chip} data-active={transferBookmarkKey(pair) === transferBookmarkKey(active) ? "" : undefined}>
                <Link href={savedTransferHref(pair)} prefetch={false}>{pair.from} → {pair.to}<small>{pair.provider?.name ?? pair.amount.toLocaleString("en-US")}</small></Link>
                <button type="button" className={styles.remove} aria-label={`Remove ${pair.from} to ${pair.to}${pair.provider ? ` with ${pair.provider.name}` : ""}`} onClick={() => start(async () => {
                  const result = await removePricePair(pair.id);
                  if (result.ok) onSaved(previous => previous.filter(item => item.id !== pair.id));
                })}><X size={12} /></button>
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
