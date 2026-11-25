"use client";

import Link from "next/link";
import { useTransition, type Dispatch, type SetStateAction } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Bookmark, BookmarkCheck, X } from "lucide-react";
import { removePricePair, savePricePair } from "../../app/app/prices/actions";
import type { SavedPair } from "../../lib/saved-pairs";
import { savedTransferHref, transferBookmarkKey, type TransferBookmark } from "../../lib/saved-transfer";
import { toast } from "../toast";
import { ProviderLogo } from "../app/provider-logo";
import { RateAlertButton } from "./rate-alert-button";
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
  const label = provider ? `Save ${provider.name} corridor` : `Save ${from} → ${to} pair`;
  return <button type="button" className={`${styles.action} ${provider ? styles.corridorAction : ""} press`} data-on={current ? "" : undefined} disabled={pending || from === to || amount < 1} onClick={toggle} aria-label={label} aria-pressed={Boolean(current)} aria-busy={pending}>
    {current ? <BookmarkCheck size={15} aria-hidden /> : <Bookmark size={15} aria-hidden />}
    {pending ? "Updating…" : provider ? current ? "Corridor saved" : "Save corridor" : current ? "Pair saved" : "Save pair"}
  </button>;
}

export function PairActions({ transfer, saved, onSaved }: SavedControls & { transfer: TransferBookmark }) {
  const key = transferBookmarkKey(transfer);
  const current = saved.find(pair => transferBookmarkKey(pair) === key) ?? null;
  // An alert lives on a saved pair, so setting one saves the pair first.
  const ensurePair = async () => {
    const result = await savePricePair(transfer);
    if (!result.ok) { toast.error("Couldn’t save it", result.error); return null; }
    onSaved(previous => [result.pair, ...previous.filter(pair => transferBookmarkKey(pair) !== key)]);
    return result.pair;
  };
  return (
    <div className={styles.actions}>
      <TransferBookmarkButton transfer={transfer} saved={saved} onSaved={onSaved} />
      <RateAlertButton pair={current} ensurePair={ensurePair} disabled={transfer.from === transfer.to || transfer.amount < 1}
        onChange={(id, alert) => onSaved(previous => previous.map(pair => pair.id === id ? { ...pair, alert } : pair))} />
    </div>
  );
}

/** Saved pairs as chips: tap one to load it, × to remove it. */
export function SavedPairsStrip({ saved, active, onSaved }: SavedControls & { active: TransferBookmark }) {
  const reduce = useReducedMotion();
  const [pending, start] = useTransition();
  if (!saved.length) return null;
  return (
    <div className={styles.strip} aria-label="Saved transfers">
      <span className={styles.stripLabel}><Bookmark size={14} aria-hidden />Saved transfers</span>
      <ul tabIndex={0} aria-label="Saved transfers list">
        <AnimatePresence initial={false}>
          {saved.map((pair) => (
            <motion.li key={pair.id} layout={!reduce} initial={reduce ? false : { opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} transition={{ duration: 0.2, ease: EASE }}>
              <span className={styles.chip} data-active={transferBookmarkKey(pair) === transferBookmarkKey(active) ? "" : undefined}>
                <Link href={savedTransferHref(pair)} prefetch={false} aria-current={transferBookmarkKey(pair) === transferBookmarkKey(active) ? "true" : undefined}>
                  <span className={styles.chipIcon}>{pair.provider ? <ProviderLogo slug={pair.provider.slug} name={pair.provider.name} size={22} /> : <Bookmark size={15} aria-hidden />}</span>
                  <span><strong>{pair.from} <ArrowRight size={11} aria-hidden /> {pair.to}</strong><small>{pair.provider?.name ?? `${pair.amount.toLocaleString("en-US")} ${pair.from}`}</small></span>
                </Link>
                <button type="button" className={styles.remove} disabled={pending} aria-label={`Remove ${pair.from} to ${pair.to}${pair.provider ? ` with ${pair.provider.name}` : ""}`} onClick={() => start(async () => {
                  const result = await removePricePair(pair.id);
                  if (result.ok) onSaved(previous => previous.filter(item => item.id !== pair.id));
                  else toast.error("Couldn’t remove it", "Try again in a moment.");
                })}><X size={12} /></button>
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
