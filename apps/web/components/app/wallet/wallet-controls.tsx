"use client";

import { useId, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BellRing, Check, CircleDollarSign, CreditCard, LockKeyhole, Plus, RefreshCw, Ticket, X } from "lucide-react";
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

function AmountChoices({ label, options, value, onPick, disabled }: { label: string; options: readonly number[]; value: number; onPick: (cents: number) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <fieldset className={styles.field} disabled={disabled}>
      <legend className={styles.fieldLabel}>{label}</legend>
      <div className={styles.chips}>
        {options.map((cents) => (
          <label key={cents} className={styles.choice}>
            <input className="sr-only" type="radio" name={id} checked={cents === value} onChange={() => onPick(cents)} />
            <span className={styles.chip}>{formatChoice(cents)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */
/* Add money                                                                   */
/* -------------------------------------------------------------------------- */

export interface TopUpMethods { card: boolean; usdc: boolean; cardTest: boolean; usdcTest: boolean }

export function AddMoneyButton({ balanceCents, testMode, canManage, methods }: { balanceCents: number; testMode: boolean; canManage: boolean; methods: TopUpMethods }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number>(TOP_UP_AMOUNTS_CENTS[1]);
  const [requestId, setRequestId] = useState("");
  const [notified, setNotified] = useState(false);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [pending, startTransition] = useTransition();
  const canPay = canManage && (methods.card || methods.usdc);
  const titleId = useId();
  const panel = useModalFocus<HTMLDivElement>(open, () => setOpen(false));

  function openDialog() {
    setError("");
    setLeaving(false);
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
    setError("");
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
                className={`access-dialog ${styles.dialogPanel}`}
                initial={{ opacity: 0, y: reduce ? 0 : 16, scale: reduce ? 1 : 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: reduce ? 0 : 8 }}
                transition={{ duration: reduce ? 0 : 0.22 }}
              >
                <button className={`access-close ${styles.dialogClose}`} type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={18} /></button>
                <div className={styles.dialog}>
                  <div className={styles.dialogHead}>
                    <span className={styles.cardIcon}><Plus size={20} aria-hidden /></span>
                    <div><h2 id={titleId}>Add money</h2><p>Choose an amount in USD.</p></div>
                  </div>
                  <AmountChoices label="Top-up amount" options={TOP_UP_AMOUNTS_CENTS} value={amount} onPick={setAmount} disabled={pending || leaving} />
                  <dl className={styles.preview}>
                    <div><dt>Current balance</dt><dd>{formatCents(balanceCents)}</dd></div>
                    <div><dt>Top-up</dt><dd>{formatCents(amount, { signed: true })}</dd></div>
                    <div><dt>Balance after top-up</dt><dd>{formatCents(balanceCents + amount)}</dd></div>
                  </dl>
                  {canPay ? (
                    // A plain form post: the server opens the checkout and sends the browser to pay.
                    // Buttons stay enabled while leaving: a disabled submitter drops its method from the post.
                    <form method="post" action="/api/billing/checkout" className={styles.dialogActions} onSubmit={(event) => { if (leaving) { event.preventDefault(); return; } setLeaving(true); }}>
                      <input type="hidden" name="purpose" value="top_up" />
                      <input type="hidden" name="amount" value={amount} />
                      {methods.card ? (
                        <button type="submit" name="method" value="card" className={styles.primary} aria-disabled={leaving || undefined}>
                          <CreditCard size={16} aria-hidden />{leaving ? "Opening checkout…" : `Pay ${formatCents(amount)} by card or UPI`}{methods.cardTest ? <span className={styles.testTag}>TEST</span> : null}
                        </button>
                      ) : null}
                      {methods.usdc ? (
                        <button type="submit" name="method" value="usdc" className={methods.card ? styles.ghost : styles.primary} aria-disabled={leaving || undefined}>
                          <CircleDollarSign size={16} aria-hidden />Pay {formatCents(amount)} in USDC{methods.usdcTest ? <span className={styles.testTag}>TEST</span> : null}
                        </button>
                      ) : null}
                    </form>
                  ) : canManage ? (
                    <div className={styles.soon}>
                      <LockKeyhole size={17} aria-hidden />
                      <span><strong>Card payments are coming soon</strong>Get an email when you can top up at checkout.</span>
                    </div>
                  ) : null}
                  {error ? <p role="alert" className={styles.status} data-tone="bad">{error}</p> : null}
                  <div className={styles.dialogActions}>
                    {testMode && canManage ? (
                      <button type="button" className={canPay ? styles.ghost : styles.primary} onClick={addTestCredit} disabled={pending || leaving || !requestId}>
                        <Plus size={16} aria-hidden />Add {formatCents(amount)} test credit<span className={styles.testTag}>TEST</span>
                      </button>
                    ) : null}
                    {canManage && !canPay ? (
                      <button type="button" className={styles.ghost} onClick={notify} disabled={pending || notified}>
                        {notified ? <><Check size={16} aria-hidden />We’ll email you when it’s live</> : <><BellRing size={16} aria-hidden />Tell me when payments are live</>}
                      </button>
                    ) : null}
                  </div>
                  {canPay ? <p className={styles.footnote}>{[methods.card ? "Card and UPI payments go through Dodo Payments" : null, methods.usdc ? "USDC goes through ArcPay" : null].filter(Boolean).join("; ")}. Credit lands as soon as the payment confirms.</p> : null}
                  {testMode && canManage ? <p className={styles.footnote}>Test credit appears as “Test top-up” in billing history.</p> : null}
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
            <p>Top up at a balance you choose.</p>
          </div>
        </div>
        <div className={styles.switchGroup}>
          <span aria-hidden>{pref.enabled ? "On" : "Off"}</span>
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
      </div>
      <AmountChoices label="When balance drops below" options={AUTO_RELOAD_THRESHOLDS_CENTS} value={pref.thresholdCents} disabled={!canManage || pending} onPick={(cents) => save({ ...pref, thresholdCents: cents })} />
      <AmountChoices label="Top-up amount" options={AUTO_RELOAD_AMOUNTS_CENTS} value={pref.amountCents} disabled={!canManage || pending} onPick={(cents) => save({ ...pref, amountCents: cents })} />
      <div className={styles.controlFoot}>
        <p className={styles.footnote}><LockKeyhole size={14} aria-hidden />{canManage ? "Auto-reload needs a saved card, which is coming next. Add money by hand for now." : "Only owners and admins can change auto-reload."}</p>
        <p className={styles.status} data-tone={status.tone} role="status">{status.tone === "ok" ? <Check size={13} aria-hidden /> : null}{status.text}</p>
      </div>
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
    <section id="promo" className={styles.card} aria-labelledby={titleId} tabIndex={-1}>
      <div className={styles.cardHead}>
        <div className={styles.titleRow}>
          <span className={styles.cardIcon}><Ticket size={17} aria-hidden /></span>
          <div>
            <h2 id={titleId}>Redeem credit</h2>
            <p>Add credit from a Railor or partner code.</p>
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
          aria-invalid={status.tone === "bad" || undefined}
          aria-describedby={`${titleId}-status`}
        />
        <button type="submit" className={styles.dark} disabled={!canRedeem || pending || !code.trim()}>{pending ? "Applying…" : "Apply"}</button>
      </form>
      <p id={`${titleId}-status`} className={styles.status} data-tone={status.tone} role="status">
        {status.tone === "ok" ? <Check size={13} aria-hidden /> : null}
        {status.text || (canRedeem ? "Each code can be used once per workspace." : "A workspace member can redeem this code.")}
      </p>
    </section>
  );
}
