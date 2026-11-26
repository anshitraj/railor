"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, BellRing, Bookmark, Trash2 } from "lucide-react";
import { Flag, currencyFlagCode } from "@railor/ui";
import { removePriceAlert, removePricePair } from "../../app/app/prices/actions";
import type { SavedPair } from "../../lib/saved-pairs";
import { savedTransferHref } from "../../lib/saved-transfer";
import { ProviderLogo } from "./provider-logo";
import { CurrencyLogo } from "../marketing/currency-logo";
import { toast } from "../toast";
import { RateAlertButton } from "../price/rate-alert-button";
import { FREQUENCY_LABEL, type Plan } from "../../lib/plans";
import styles from "./saved.module.css";

const EASE = [0.23, 1, 0.32, 1] as const;

function Mark({ code, size = 26 }: { code: string; size?: number }) {
  const flag = currencyFlagCode(code);
  return flag ? <Flag code={flag} size={size} round /> : <CurrencyLogo symbol={code} size={size} />;
}

function ago(iso: string) {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? "Saved today" : days === 1 ? "Saved yesterday" : `Saved ${days} days ago`;
}

/** Saved pairs, each one tap from a fresh comparison. */
export function SavedPairsList({ initial, compact = false, plan }: { initial: SavedPair[]; compact?: boolean; plan?: Plan }) {
  const reduce = useReducedMotion();
  const [pairs, setPairs] = useState(initial);
  const [, start] = useTransition();
  const remove = (pair: SavedPair) => start(async () => {
    const result = await removePricePair(pair.id);
    if (result.ok) { setPairs((current) => current.filter((item) => item.id !== pair.id)); toast.success(`${pair.from} → ${pair.to} removed`); }
    else toast.error("Couldn’t remove it", "Try again in a moment.");
  });

  const unsubscribe = (pair: SavedPair) => start(async () => {
    const result = await removePriceAlert(pair.id);
    if (!result.ok) { toast.error("Couldn’t unsubscribe", "Try again in a moment."); return; }
    setPairs((current) => current.map((item) => item.id === pair.id ? { ...item, alert: undefined } : item));
    toast.success("Unsubscribed", `No more rate emails for ${pair.from} → ${pair.to}.`);
  });

  if (!pairs.length) {
    return (
      <div className={styles.empty} data-compact={compact || undefined}>
        <span className={styles.emptyIcon}><Bookmark size={18} aria-hidden /></span>
        <p><strong>Nothing saved yet</strong>Save a currency pair or select a provider and save its corridor.</p>
        <Link href="/app/prices" className={styles.emptyLink}>Compare a pair <ArrowRight size={14} aria-hidden /></Link>
      </div>
    );
  }

  return (
    <ul className={styles.list} data-compact={compact || undefined}>
      <AnimatePresence initial={false}>
        {pairs.map((pair, index) => (
          <motion.li key={pair.id} layout={!reduce} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -12, transition: { duration: 0.16 } }} transition={{ duration: 0.28, ease: EASE, delay: Math.min(index, 6) * 0.04 }}>
            <div className={styles.item}>
              <Link href={savedTransferHref(pair)} className={styles.main} prefetch={false}>
                <span className={styles.marks}>{pair.provider ? <ProviderLogo slug={pair.provider.slug} name={pair.provider.name} size={32} /> : <><Mark code={pair.from} /><Mark code={pair.to} /></>}</span>
                <span className={styles.text}>
                  <strong>{pair.provider ? `${pair.provider.name} · ` : ""}{pair.from} <span aria-hidden>→</span><span className="sr-only">to</span> {pair.to}</strong>
                  <small>{pair.amount.toLocaleString("en-US")} {pair.from}{compact ? "" : ` · ${ago(pair.createdAt)}`}</small>
                  {pair.alert ? <small className={styles.alertNote}><BellRing size={11} aria-hidden />{FREQUENCY_LABEL[pair.alert.frequency]} updates by email</small> : null}
                </span>
                <ArrowRight size={16} aria-hidden className={styles.go} />
              </Link>
              {compact ? null : (
                <div className={styles.side}>
                  {pair.alert ? <button type="button" className={styles.unsubscribe} onClick={() => unsubscribe(pair)}>Unsubscribe</button> : null}
                  <RateAlertButton pair={pair} compact plan={plan} onChange={(id, alert) => setPairs((current) => current.map((item) => item.id === id ? { ...item, alert } : item))} />
                  <button type="button" className={styles.remove} onClick={() => remove(pair)} aria-label={`Remove ${pair.from} to ${pair.to}${pair.provider ? ` with ${pair.provider.name}` : ""}`}><Trash2 size={15} /></button>
                </div>
              )}
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
