"use client";

import { useId, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BellRing, Check, CreditCard, LockKeyhole, Plus, RefreshCw, Ticket, X } from "lucide-react";
import { useModalFocus } from "@railor/ui";
import { addTestTopUpAction, redeemPromoAction, saveAutoReloadAction } from "../../../app/app/wallet/actions";
import {
  AUTO_RELOAD_AMOUNTS_CENTS,
  AUTO_RELOAD_THRESHOLDS_CENTS,
  TOP_UP_AMOUNTS_CENTS,
  formatCents,
  formatChoice,
  type AutoReloadPreference,
} from "../../../lib/wallet-options";
import styles from "./wallet.module.css";

function Chips({ label, options, value, onPick, disabled, big }: { label: string; options: readonly number[]; value: number; onPick: (cents: number) => void; disabled?: boolean; big?: boolean }) {
  const id = useId();
  return (
    <div className={styles.field}>
      <span id={id} className={styles.fieldLabel}>{label}</span>
      <div role="radiogroup" aria-labelledby={id} className={big ? `${styles.chips} ${styles.bigChips}` : styles.chips}>
        {options.map((cents) => (
          <button key={cents} type="button" role="radio" aria-checked={cents === value} disabled={disabled} className={styles.chip} onClick={() => onPick(cents)}>
            {formatChoice(cents)}
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Add money                                                                   */
/* -------------------------------------------------------------------------- */

export function AddMoneyButton({ balanceCents, testMode, canManage }: { balanceCents: number; testMode: boolean; canManage: boolean }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number>(TOP_UP_AMOUNTS_CENTS[1]);
  const [requestId, setRequestId] = useState("");
  const [notified, setNotified] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const titleId = useId();
  const panel = useModalFocus<HTMLDivElement>(open, () => setOpen(false));

  function openDialog() {
    setError("");
    // One id per open dialog: a double click or a retry adds the money once.
    setRequestId(crypto.randomUUID());
    setOpen(true);
  }

  function addTestCredit() {
    startTransition(async () => {
      const result = await addTestTopUpAction(amount, requestId);
      if (!result.ok) { setError(result.error); return; }
      setOpen(false);
      router.refresh();
    });
  }

  function notify() {
    startTransition(async () => {
      try {
        const response = await fetch("/api/notify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ feature: "wallet-top-up" }) });
        if (!response.ok) throw new Error(String(response.status));
        setNotified(true);
      } catch {
        setError("We couldn’t save that. Try again.");
      }
    });
  }

  return (
    <>
      <button type="button" className={styles.primary} onClick={openDialog}>
        <Plus size={17} aria-hidden />Add money
      </button>
      {typeof document !== "undefined" ? createPortal(
        <AnimatePresence>
          {open ? (
            <motion.div className="access-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.16 }}>
              <div className="absolute inset-0" onClick={() => setOpen(false)} aria-hidden />
              <motion.div
                ref={panel}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className="access-dialog"
                initial={{ opacity: 0, y: reduce ? 0 : 16, scale: reduce ? 1 : 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: reduce ? 0 : 8 }}
                transition={{ duration: reduce ? 0 : 0.22 }}
              >
                <button className="access-close" type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={18} /></button>
                <div className={styles.dialog}>
                  <div>
                    <p className="product-eyebrow">Add money</p>
                    <h2 id={titleId}>How much credit?</h2>
                  </div>
                  <Chips label="Amount" options={TOP_UP_AMOUNTS_CENTS} value={amount} onPick={setAmount} big />
                  <div className={styles.preview}>
                    <span>Balance after</span>
                    <strong>{formatCents(balanceCents + amount)}</strong>
                  </div>
                  <div className={styles.soon}>
                    <LockKeyhole size={17} aria-hidden />
                    <span><strong>Card payments are coming soon.</strong>Railor never asks for card details on this page. When payments go live you’ll pay on a secure checkout.</span>
                  </div>
                  {error ? <p role="alert" className={styles.status} data-tone="bad">{error}</p> : null}
                  <div className={styles.dialogActions}>
                    {testMode && canManage ? (
                      <button type="button" className={styles.primary} onClick={addTestCredit} disabled={pending || !requestId}>
                        <CreditCard size={16} aria-hidden />Add {formatCents(amount)} test credit<span className={styles.testTag}>TEST</span>
                      </button>
                    ) : null}
                    <button type="button" className={styles.ghost} onClick={notify} disabled={pending || notified}>
                      {notified ? <><Check size={16} aria-hidden />We’ll email you when it’s live</> : <><BellRing size={16} aria-hidden />Tell me when payments are live</>}
                    </button>
                  </div>
                  {testMode ? <p className={styles.footnote}>Test mode: test credit is labelled “Test top-up” in billing history and moves no real money.</p> : null}
                  {!canManage ? <p className={styles.footnote}>Only owners and admins can add money.</p> : null}
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Auto-reload                                                                 */
/* -------------------------------------------------------------------------- */

export function AutoReloadCard({ initial, canManage }: { initial: AutoReloadPreference; canManage: boolean }) {
  const [pref, setPref] = useState(initial);
  const [status, setStatus] = useState<{ tone: "ok" | "bad" | "idle"; text: string }>({ tone: "idle", text: "" });
  const [pending, startTransition] = useTransition();
  const titleId = useId();

  function save(next: AutoReloadPreference) {
    const previous = pref;
    setPref(next);
    setStatus({ tone: "idle", text: "Saving…" });
    startTransition(async () => {
      const result = await saveAutoReloadAction(next);
      if (result.ok) setStatus({ tone: "ok", text: "Saved" });
      else { setPref(previous); setStatus({ tone: "bad", text: result.error }); }
    });
  }

  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <div className={styles.cardHead}>
        <div className={styles.titleRow}>
          <span className={styles.cardIcon}><RefreshCw size={17} aria-hidden /></span>
          <div>
            <h2 id={titleId}>Auto-reload</h2>
            <p>Top up by itself so credit never runs out mid-check.</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={pref.enabled}
          aria-label="Auto-reload"
          className={styles.switch}
          disabled={!canManage || pending}
          onClick={() => save({ ...pref, enabled: !pref.enabled })}
        >
          <span className={styles.knob} />
        </button>
      </div>
      <Chips label="When balance drops below" options={AUTO_RELOAD_THRESHOLDS_CENTS} value={pref.thresholdCents} disabled={!canManage || pending} onPick={(cents) => save({ ...pref, thresholdCents: cents })} />
      <Chips label="Add" options={AUTO_RELOAD_AMOUNTS_CENTS} value={pref.amountCents} disabled={!canManage || pending} onPick={(cents) => save({ ...pref, amountCents: cents })} />
      <p className={styles.sentence} aria-live="polite">
        {pref.enabled
          ? <>On. We’ll add <strong>{formatCents(pref.amountCents)}</strong> whenever your balance drops below <strong>{formatCents(pref.thresholdCents)}</strong>.</>
          : <>Off. Turn it on to add <strong>{formatCents(pref.amountCents)}</strong> whenever your balance drops below <strong>{formatCents(pref.thresholdCents)}</strong>.</>}
      </p>
      <div className={styles.cardHead}>
        <p className={styles.footnote}><LockKeyhole size={13} aria-hidden />Starts charging once card payments launch. Until then, this only saves your choice.</p>
        <span className={styles.status} data-tone={status.tone} role="status">{status.tone === "ok" ? <Check size={13} aria-hidden /> : null}{status.text}</span>
      </div>
      {!canManage ? <p className={styles.footnote}>Only owners and admins can change auto-reload.</p> : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Promo code                                                                  */
/* -------------------------------------------------------------------------- */

export function PromoCard({ initialCode = "", canRedeem }: { initialCode?: string; canRedeem: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [status, setStatus] = useState<{ tone: "ok" | "bad" | "idle"; text: string }>({ tone: "idle", text: "" });
  const [pending, startTransition] = useTransition();
  const titleId = useId();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await redeemPromoAction(code);
      if (result.ok) {
        setStatus({ tone: "ok", text: result.message ?? "Credit added." });
        setCode("");
        router.refresh();
      } else setStatus({ tone: "bad", text: result.error });
    });
  }

  return (
    <section id="promo" className={styles.card} aria-labelledby={titleId}>
      <div className={styles.cardHead}>
        <div className={styles.titleRow}>
          <span className={styles.cardIcon}><Ticket size={17} aria-hidden /></span>
          <div>
            <h2 id={titleId}>Promo code</h2>
            <p>Got a code from Railor or a partner? Add its credit here.</p>
          </div>
        </div>
      </div>
      <form className={styles.promoRow} onSubmit={submit}>
        <label htmlFor={`${titleId}-code`} className="sr-only">Promo code</label>
        <input
          id={`${titleId}-code`}
          className={styles.promoInput}
          value={code}
          onChange={(event) => { setCode(event.target.value); setStatus({ tone: "idle", text: "" }); }}
          placeholder="Enter or paste a code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={32}
          disabled={!canRedeem}
          aria-describedby={`${titleId}-status`}
        />
        <button type="submit" className={styles.dark} disabled={!canRedeem || pending || !code.trim()}>{pending ? "Applying…" : "Apply"}</button>
      </form>
      <p id={`${titleId}-status`} className={styles.status} data-tone={status.tone} role="status">
        {status.tone === "ok" ? <Check size={13} aria-hidden /> : null}
        {status.text || "Each code works once per workspace. Codes in links fill in by themselves."}
      </p>
    </section>
  );
}
