"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowRight, CheckCircle2, Copy, Download, FileSpreadsheet, FileText, Info, Landmark, ListChecks, Loader2, Plus, ShieldCheck, Sparkles, TrendingDown, TrendingUp, UploadCloud, X } from "lucide-react";
import { Flag, currencyFlagCode } from "@railor/ui";
import type { QuoteSnapshot, Settlement, SettlementVerdict, ShortfallReport } from "@railor/core";
import type { FreelancerInvoice, InvoiceRouting, InvoiceSettlementView } from "../../lib/freelancer";
import { findCredits, type CreditCandidate } from "../../lib/credit-match";
import { readTable } from "../../lib/spreadsheet";
import { currencyDecimals, money, niceDate, signed } from "../../lib/format-money";
import { Investigation } from "./invoice-investigation";
import { ProviderLogo } from "./provider-logo";
import { CurrencyLogo } from "../marketing/currency-logo";
import { toast } from "../toast";
import styles from "./invoice-settlement.module.css";

const EASE = [0.23, 1, 0.32, 1] as const;
const CONSENT_KEY = "railor.doc-consent";
const CHARGE_LABELS = ["Bank charge", "Provider fee", "GST / TDS", "Other"] as const;

type Deduction = { label: string; amount: string };
type Found = { amount: string; date: string; deductions: Deduction[]; reference?: string; providerName?: string; origin: "statement" | "document" | "typed"; note: string };

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const cleanAmount = (value: string) => { const text = value.replace(/[^\d.]/g, ""); const [whole = "", ...rest] = text.split("."); return rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole; };

async function post(payload: unknown) {
  const response = await fetch("/api/freelancer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed. Try again.");
  return result;
}

/** Numbers settle into place instead of appearing; with reduced motion they simply are. */
function useCountUp(target: number, animate: boolean) {
  const [value, setValue] = useState(animate ? 0 : target);
  const from = useRef(animate ? 0 : target);
  useEffect(() => {
    if (!animate) { setValue(target); from.current = target; return; }
    const start = performance.now(); const origin = from.current; let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 850);
      const next = origin + (target - origin) * (1 - (1 - t) ** 3);
      setValue(next); from.current = next;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, animate]);
  return value;
}
function Amount({ value, currency, animate, className }: { value: number; currency: string; animate: boolean; className?: string }) {
  return <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>{money(useCountUp(value, animate), currency)}</span>;
}

function Pair({ from, to }: { from: string; to: string }) {
  const mark = (code: string) => { const flag = currencyFlagCode(code); return flag ? <Flag code={flag} size={18} round /> : <CurrencyLogo symbol={code} size={18} />; };
  return <span className={styles.pair} aria-label={`${from} to ${to}`}>{mark(from)}<ArrowRight size={11} aria-hidden />{mark(to)}</span>;
}

type SettlementProps = {
  invoice: FreelancerInvoice;
  view: InvoiceSettlementView | null;
  routing: InvoiceRouting | null;
  busy: boolean;
  locked: boolean;
  aiEnabled: boolean;
  sharedDemo: boolean;
  onFindQuote: () => void;
  onView: (view: InvoiceSettlementView) => void;
  onRecorded: (view: InvoiceSettlementView) => void;
};

/**
 * The invoice's money trail in one place: the price Railor quoted, the bank
 * credit that arrived, and where the difference went — the market, charges
 * you can name, or nothing anyone can explain.
 */
export function InvoiceSettlement({ invoice, view, routing, busy, locked, aiEnabled, sharedDemo, onFindQuote, onView, onRecorded }: SettlementProps) {
  const reduce = Boolean(useReducedMotion());
  const quote = view?.quote ?? null;
  const chosen = quote?.chosen ?? null;
  const combined = (view?.combined ?? null) as Settlement | null;
  const paid = invoice.status === "recorded_paid";
  const outstanding = Number(invoice.outstanding);
  const [found, setFound] = useState<Found | null>(null);
  const [candidates, setCandidates] = useState<CreditCandidate[] | null>(null);
  const [typed, setTyped] = useState("");
  const [typedDate, setTypedDate] = useState(today);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pendingDocument, setPendingDocument] = useState<File | null>(null);
  const [covered, setCovered] = useState("");
  const [addingCharge, setAddingCharge] = useState(false);
  const [chargeLabel, setChargeLabel] = useState<string>(CHARGE_LABELS[0]);
  const [chargeAmount, setChargeAmount] = useState("");
  const [analysis, setAnalysis] = useState<ShortfallReport | null>(view?.analysis ?? null);
  const [investigating, setInvestigating] = useState(false);
  const [investigateError, setInvestigateError] = useState<string | null>(null);
  const [counting, setCounting] = useState<string | null>(null);
  const autoRun = useRef("");
  const request = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const disabled = locked || working || saving;

  useEffect(() => { setFound(null); setCandidates(null); setTyped(""); setMessage(null); setPendingDocument(null); setCovered(""); request.current = null; }, [invoice.id]);

  useEffect(() => { setAnalysis(null); setInvestigateError(null); autoRun.current = ""; }, [invoice.id]);
  useEffect(() => { if (view?.analysis) setAnalysis(view.analysis); }, [view?.analysis]);

  /** Gemini reads the provider's own pages for charges taken on top of the quote. */
  async function investigate() {
    setInvestigating(true); setInvestigateError(null);
    try {
      const response = await fetch("/api/freelancer/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: invoice.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Couldn’t check just now. Try again in a minute.");
      setAnalysis(result.report);
    } catch (error) { setInvestigateError(error instanceof Error ? error.message : "Couldn’t check just now."); }
    finally { setInvestigating(false); }
  }
  const shortNow = combined?.verdict === "short";
  // A short credit is investigated as soon as it is recorded: nobody should have to ask where their money went.
  useEffect(() => {
    if (!shortNow || analysis || investigating || !aiEnabled || locked) return;
    const key = `${invoice.id}:${(view?.receipts ?? []).map((receipt) => receipt.id).join(",")}`;
    if (autoRun.current === key) return;
    autoRun.current = key;
    void investigate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortNow, analysis, aiEnabled, locked, view?.receipts, invoice.id]);

  /** A charge the person confirms joins the credit's named charges, and the numbers update. */
  async function count(label: string, amount: number) {
    const receipt = view?.receipts[0];
    if (!receipt) return;
    setCounting(label);
    try {
      const result = await post({ action: "deduct", id: invoice.id, receiptId: receipt.id, charge: { label, amount: amount.toFixed(currencyDecimals(invoice.settlementCurrency)) } });
      onView({ receipts: result.receipts, quote: result.quote, combined: result.combined, analysis: result.analysis ?? analysis });
      toast.success("Counted", `${label} · ${money(amount, invoice.settlementCurrency)}`);
    } catch (error) { toast.error("Couldn’t count that", error instanceof Error ? error.message : undefined); }
    finally { setCounting(null); }
  }

  const rememberedConsent = () => { try { return localStorage.getItem(CONSENT_KEY) === "1"; } catch { return false; } };
  const accept = (next: Found) => { request.current = null; setFound(next); setCandidates(null); setMessage(null); };

  async function readFile(file: File) {
    setMessage(null); setCandidates(null); setPendingDocument(null);
    const name = file.name.toLowerCase();
    if (/\.(csv|xlsx)$/.test(name)) {
      setWorking(true);
      try {
        const table = await readTable(file);
        const result = findCredits(table, { invoiceNumber: invoice.invoiceNumber, expected: chosen ? chosen.expected * Math.min(1, outstanding / Number(quote?.amount || outstanding || 1)) : null, quoteDate: quote?.quotedAt.slice(0, 10) ?? null });
        if (!result.readable) setMessage({ tone: "error", text: "This file doesn’t look like a bank statement. Type what arrived instead, or drop the credit advice." });
        else if (!result.candidates.length) setMessage({ tone: "info", text: `No credit for ${invoice.invoiceNumber} in ${result.credits} credits. It may not have arrived yet — or type the amount you can see.` });
        else if (result.candidates.length === 1 || result.candidates[0]!.match === "invoice" && result.candidates[1]?.match !== "invoice") pick(result.candidates[0]!, true);
        else setCandidates(result.candidates);
      } catch (error) { setMessage({ tone: "error", text: error instanceof Error ? error.message : "That file couldn’t be read." }); }
      finally { setWorking(false); }
      return;
    }
    if (/\.(pdf|png|jpe?g)$/.test(name)) {
      if (sharedDemo) { setMessage({ tone: "info", text: "This demo workspace is shared, so documents aren’t read here. Drop a CSV statement or type the amount." }); return; }
      if (!aiEnabled) { setMessage({ tone: "info", text: "Reading documents isn’t set up here. Drop a CSV statement or type the amount." }); return; }
      if (rememberedConsent()) await readDocument(file); else setPendingDocument(file);
      return;
    }
    setMessage({ tone: "error", text: name.endsWith(".xls") ? "Old .xls files aren’t supported. Save as .xlsx or CSV." : "Drop a CSV, Excel, PDF or image file." });
  }

  async function readDocument(file: File, always = false) {
    setPendingDocument(null); setWorking(true); setMessage(null);
    try {
      if (always) try { localStorage.setItem(CONSENT_KEY, "1"); } catch { /* the choice just isn’t remembered */ }
      const data = new FormData(); data.set("file", file); data.set("consent", "true"); data.set("kind", "receipt");
      const response = await fetch("/api/freelancer/extract", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "We couldn’t read this file. Type the amount instead.");
      const p = result.proposal as { settlementAmount: string | null; receivedDate: string | null; reference: string | null; providerName: string | null; settlementCurrency: string | null; deductions?: Deduction[] };
      if (!p.settlementAmount) { setMessage({ tone: "info", text: "No bank credit amount was printed on this file. Type what arrived instead." }); return; }
      if (p.settlementCurrency && p.settlementCurrency !== invoice.settlementCurrency) { setMessage({ tone: "error", text: `This credit is in ${p.settlementCurrency}, but the invoice settles in ${invoice.settlementCurrency}.` }); return; }
      accept({ amount: p.settlementAmount, date: p.receivedDate ?? today(), reference: p.reference ?? undefined, providerName: p.providerName ?? undefined, deductions: (p.deductions ?? []).filter((d) => d.label && d.amount), origin: "document", note: file.name });
    } catch (error) { setMessage({ tone: "error", text: error instanceof Error ? error.message : "We couldn’t read this file." }); }
    finally { setWorking(false); }
  }

  function pick(candidate: CreditCandidate, auto = false) {
    accept({ amount: candidate.amount.toFixed(2), date: candidate.date ?? today(), deductions: [], origin: "statement", note: candidate.narration });
    if (auto) toast.success("Found the credit", `${money(candidate.amount, invoice.settlementCurrency)} · ${candidate.narration.slice(0, 60)}`);
  }

  function matchTyped() {
    const amount = cleanAmount(typed);
    if (!(Number(amount) > 0)) { setMessage({ tone: "error", text: `Type the ${invoice.settlementCurrency} amount that reached your bank.` }); return; }
    accept({ amount, date: typedDate || today(), deductions: [], origin: "typed", note: "You typed this amount" });
  }

  function drop(event: DragEvent) {
    event.preventDefault(); setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !disabled) void readFile(file);
  }

  function addCharge() {
    const amount = cleanAmount(chargeAmount);
    if (!found || !(Number(amount) > 0)) return;
    request.current = null;
    setFound({ ...found, deductions: [...found.deductions, { label: chargeLabel, amount }] });
    setChargeAmount(""); setAddingCharge(false);
  }

  async function record() {
    if (!found) return;
    setSaving(true); setMessage(null);
    request.current ??= crypto.randomUUID();
    try {
      const coveredAmount = cleanAmount(covered);
      const result = await post({ action: "receipt", id: invoice.id, draft: {
        settlementAmount: found.amount, receivedDate: found.date, deductions: found.deductions, confirmed: true, requestId: request.current,
        ...(coveredAmount ? { sourceAmount: coveredAmount } : {}), ...(found.reference ? { reference: found.reference } : {}), ...(found.providerName ? { providerName: found.providerName } : {}),
      } });
      setFound(null); setCovered(""); setTyped(""); request.current = null;
      onRecorded({ receipts: result.receipts, quote: result.quote, combined: result.combined, analysis: null });
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" }));
    } catch (error) { setMessage({ tone: "error", text: error instanceof Error ? error.message : "Couldn’t save this credit. Try again." }); }
    finally { setSaving(false); }
  }

  async function choose(slug: string) {
    if (!quote || slug === chosen?.providerSlug || disabled) return;
    try {
      const result = await post({ action: "choose", id: invoice.id, checkId: quote.checkId, providerSlug: slug });
      onView({ receipts: view?.receipts ?? [], quote: result.quote, combined: view?.combined ?? null, analysis: view?.analysis ?? null });
    } catch (error) { toast.error("Couldn’t switch provider", error instanceof Error ? error.message : undefined); }
  }

  const expectedNow = useMemo(() => {
    if (!chosen || !quote) return null;
    const share = Math.min(1, outstanding / (Number(quote.amount) || outstanding || 1));
    return chosen.expected * (paid ? 1 : share);
  }, [chosen, quote, outstanding, paid]);

  return (
    <section className={styles.panel} aria-label="Quote and bank credit" aria-busy={busy || working || saving}>
      <header className={styles.head}>
        <div>
          <h2>Quote vs bank credit</h2>
          <p>Railor saves the price you expect, finds the credit when it lands, and shows where any difference went.</p>
        </div>
        <span className={styles.headIcon} aria-hidden><Landmark size={18} /></span>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {!quote ? (
          <motion.div key="empty" className={styles.empty} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}>
            <div className={styles.flow} aria-hidden>
              <span><FileText size={20} /></span><i /><span><Sparkles size={20} /></span><i /><span><Landmark size={20} /></span>
            </div>
            <strong>{busy ? "Finding your best route…" : "Lock a quote to compare against"}</strong>
            <p>{busy ? "This saves the price below as your expected credit." : "Compare receiving routes once and Railor remembers the amount you should receive."}</p>
            {!paid && <button type="button" className={styles.primary} disabled={locked || busy} onClick={onFindQuote}>{busy ? <Loader2 size={15} className={styles.spin} /> : <Sparkles size={15} />}Find receiving routes</button>}
          </motion.div>
        ) : (
          <motion.div key="quote" initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE }}>
            <QuoteCard quote={quote} chosen={chosen} expected={expectedNow} reduce={reduce} waiting={!combined && !paid} onChoose={choose} disabled={disabled || paid || Boolean(combined)} />
          </motion.div>
        )}
      </AnimatePresence>

      {quote && !paid ? (
        <div className={styles.capture}>
          <h3>{combined ? "Another credit arrived?" : "When the money arrives"}</h3>
          <div
            className={styles.drop} data-dragging={dragging && !disabled} data-busy={working}
            onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}
          >
            <input ref={input} className="sr-only" type="file" accept=".csv,.xlsx,application/pdf,image/png,image/jpeg" aria-label="Drop a bank statement or credit advice" disabled={disabled}
              onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void readFile(file); }} />
            <button type="button" className={styles.dropButton} disabled={disabled} onClick={() => input.current?.click()}>
              <span className={styles.dropIcons} aria-hidden>
                {working ? <Loader2 size={22} className={styles.spin} /> : <><FileSpreadsheet size={20} /><UploadCloud size={24} /><FileText size={20} /></>}
              </span>
              <strong>{working ? "Looking for your credit…" : <>Drop your bank statement or credit advice, or <span>browse</span></>}</strong>
              <small><ShieldCheck size={12} aria-hidden />CSV and Excel are read on this device. PDF and photos are read once and not kept.</small>
            </button>
          </div>

          <AnimatePresence>
            {pendingDocument ? (
              <motion.div className={styles.consent} initial={reduce ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22, ease: EASE }}>
                <p><Sparkles size={14} aria-hidden />Read <strong>{pendingDocument.name}</strong> with Google Gemini? Railor keeps the numbers, not the file.</p>
                <div>
                  <button type="button" className={styles.primary} onClick={() => void readDocument(pendingDocument)}>Read it</button>
                  <button type="button" className={styles.ghost} onClick={() => void readDocument(pendingDocument, true)}>Always allow on this device</button>
                  <button type="button" className={styles.ghost} onClick={() => setPendingDocument(null)}>Cancel</button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {candidates ? (
              <motion.ul className={styles.candidates} aria-label="Possible credits" initial={false}>
                {candidates.map((candidate, index) => (
                  <motion.li key={candidate.line} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: EASE, delay: reduce ? 0 : index * 0.07 }}>
                    <button type="button" onClick={() => pick(candidate)} disabled={disabled}>
                      <span className={styles.candidateAmount}>{money(candidate.amount, invoice.settlementCurrency)}</span>
                      <span className={styles.candidateText}><strong>{candidate.narration || "Bank credit"}</strong><small>{candidate.date ? niceDate(candidate.date) : "Date not shown"} · line {candidate.line}</small></span>
                      <span className={styles.tag} data-kind={candidate.match}>{candidate.match === "invoice" ? "Names this invoice" : "Close to your quote"}</span>
                    </button>
                  </motion.li>
                ))}
              </motion.ul>
            ) : null}
          </AnimatePresence>

          <AnimatePresence mode="wait" initial={false}>
            {found ? (
              <motion.div key="found" className={styles.found} initial={reduce ? false : { opacity: 0, y: 10, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }} transition={{ duration: 0.3, ease: EASE }}>
                <div className={styles.foundTop}>
                  <span className={styles.foundIcon}><CheckCircle2 size={18} aria-hidden /></span>
                  <div>
                    <span>{found.origin === "typed" ? "You say" : "Found"}</span>
                    <strong className={styles.foundAmount}>{money(Number(found.amount), invoice.settlementCurrency)}</strong>
                    <small>{niceDate(found.date)} · {found.note.slice(0, 70)}</small>
                  </div>
                  <button type="button" className={styles.iconButton} aria-label="Not this one" onClick={() => { setFound(null); request.current = null; }}><X size={15} /></button>
                </div>
                <div className={styles.foundFields}>
                  <label><span>Amount in {invoice.settlementCurrency}</span><input inputMode="decimal" value={found.amount} onChange={(event) => { request.current = null; setFound({ ...found, amount: cleanAmount(event.target.value) }); }} /></label>
                  <label><span>Arrived on</span><input type="date" value={found.date} max={today()} onChange={(event) => { request.current = null; setFound({ ...found, date: event.target.value || today() }); }} /></label>
                </div>
                <div className={styles.charges}>
                  {found.deductions.map((item, index) => (
                    <span key={`${item.label}-${index}`} className={styles.chargeChip}>{item.label} {money(Number(item.amount), invoice.settlementCurrency)}<button type="button" aria-label={`Remove ${item.label}`} onClick={() => { request.current = null; setFound({ ...found, deductions: found.deductions.filter((_, i) => i !== index) }); }}><X size={11} /></button></span>
                  ))}
                  {addingCharge ? (
                    <span className={styles.chargeForm}>
                      <span className={styles.chargeOptions} role="group" aria-label="Kind of charge">{CHARGE_LABELS.map((label) => <button type="button" key={label} data-on={chargeLabel === label || undefined} onClick={() => setChargeLabel(label)}>{label}</button>)}</span>
                      <input aria-label="Charge amount" inputMode="decimal" placeholder={`Amount in ${invoice.settlementCurrency}`} value={chargeAmount} onChange={(event) => setChargeAmount(cleanAmount(event.target.value))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCharge(); } }} autoFocus />
                      <button type="button" className={styles.smallPrimary} onClick={addCharge} disabled={!Number(chargeAmount)}>Add</button>
                      <button type="button" className={styles.ghost} onClick={() => setAddingCharge(false)}>Cancel</button>
                    </span>
                  ) : <button type="button" className={styles.addCharge} onClick={() => setAddingCharge(true)}><Plus size={12} />A fee or charge was taken</button>}
                </div>
                {outstanding > 0 ? (
                  <details className={styles.partial}>
                    <summary>Only part of the invoice?</summary>
                    <label><span>Amount of the invoice this covers ({invoice.currency})</span><input inputMode="decimal" placeholder={invoice.outstanding} value={covered} onChange={(event) => { request.current = null; setCovered(cleanAmount(event.target.value)); }} /></label>
                  </details>
                ) : null}
                <button type="button" className={styles.record} disabled={disabled || !Number(found.amount)} onClick={record}>
                  {saving ? <Loader2 size={16} className={styles.spin} /> : <ListChecks size={16} />}{saving ? "Comparing…" : <>Yes, this is for {invoice.invoiceNumber} — compare it</>}
                </button>
              </motion.div>
            ) : (
              <motion.div key="typed" className={styles.typed} initial={false} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
                <span className={styles.or}>or type what arrived</span>
                <div className={styles.typedRow}>
                  <label className={styles.money}><span aria-hidden>{invoice.settlementCurrency}</span><input inputMode="decimal" aria-label={`Amount that reached your bank in ${invoice.settlementCurrency}`} placeholder={chosen ? String(Math.round(chosen.expected)) : "0.00"} value={typed} disabled={disabled} onChange={(event) => setTyped(cleanAmount(event.target.value))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); matchTyped(); } }} /></label>
                  <label className={styles.when}><span className="sr-only">Arrived on</span><input type="date" value={typedDate} max={today()} disabled={disabled} onChange={(event) => setTypedDate(event.target.value || today())} /></label>
                  <button type="button" className={styles.primary} disabled={disabled || !Number(typed)} onClick={matchTyped}>Match it<ArrowRight size={14} /></button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {message ? <p role={message.tone === "error" ? "alert" : "status"} className={styles.message} data-tone={message.tone}>{message.tone === "error" ? <AlertTriangle size={14} aria-hidden /> : <Info size={14} aria-hidden />}{message.text}</p> : null}
        </div>
      ) : null}

      {combined && chosen ? <div ref={resultRef}><Result settlement={combined} quote={chosen} invoice={invoice} view={view!} reduce={reduce} inv={{ report: analysis, running: investigating, error: investigateError, counting, enabled: aiEnabled, onRun: () => void investigate(), onCount: count }} /></div> : null}
    </section>
  );
}

/* ------------------------------ The saved quote ----------------------------- */

function QuoteCard({ quote, chosen, expected, reduce, waiting, onChoose, disabled }: {
  quote: NonNullable<InvoiceSettlementView["quote"]>; chosen: QuoteSnapshot | null; expected: number | null; reduce: boolean; waiting: boolean; onChoose: (slug: string) => void; disabled: boolean;
}) {
  const options = quote.candidates.slice(0, 5);
  return (
    <div className={styles.quote}>
      {chosen && expected !== null ? (
        <>
          <div className={styles.quoteTop}>
            <ProviderLogo slug={chosen.providerSlug} name={chosen.providerName} size={42} loading="eager" />
            <div className={styles.quoteWho}>
              <span>You expect via</span>
              <strong>{chosen.providerName}</strong>
              <small>{chosen.product ?? chosen.sourceLabel}</small>
            </div>
            <Pair from={quote.currency} to={quote.settlementCurrency} />
          </div>
          <div className={styles.quoteAmount}>
            <Amount value={expected} currency={quote.settlementCurrency} animate={!reduce} />
            {waiting ? <span className={styles.waiting}><i aria-hidden />Waiting for the credit</span> : null}
          </div>
          <dl className={styles.quoteFacts}>
            {chosen.feeAmount !== null && chosen.feeCurrency ? <div><dt>Fee</dt><dd>{money(chosen.feeAmount, chosen.feeCurrency)}</dd></div> : null}
            {chosen.rate ? <div><dt>Rate</dt><dd>1 {quote.currency} = {chosen.rate.toLocaleString("en-US", { maximumFractionDigits: 4 })} {quote.settlementCurrency}</dd></div> : null}
            <div><dt>Locked</dt><dd>{new Date(quote.quotedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</dd></div>
            {chosen.delivery ? <div><dt>Arrives</dt><dd>{chosen.delivery}</dd></div> : null}
          </dl>
          {chosen.partial ? <p className={styles.partialNote}><Info size={13} aria-hidden />This price leaves out {chosen.missing[0] ?? "a cost the provider doesn’t publish"}, so a little less may arrive.</p> : null}
        </>
      ) : (
        <p className={styles.pickPrompt}><Sparkles size={15} aria-hidden />Pick a provider to lock the amount you expect.</p>
      )}
      {options.length > 1 ? (
        <div className={styles.chips} role="group" aria-label="Provider you expect to receive through">
          <span className={styles.chipsHint}>Who will your client pay through?</span>
          {options.map((option) => (
            <button type="button" key={option.providerSlug} data-on={option.providerSlug === chosen?.providerSlug || undefined} disabled={disabled} onClick={() => onChoose(option.providerSlug)} aria-pressed={option.providerSlug === chosen?.providerSlug}>
              <ProviderLogo slug={option.providerSlug} name={option.providerName} size={22} loading="eager" />
              <span>{option.providerName}</span>
              <em>{money(option.expected, quote.settlementCurrency, 0)}</em>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------- Result ---------------------------------- */

const VERDICT: Record<SettlementVerdict, { tone: "ok" | "info" | "warn"; icon: ReactNode; title: string }> = {
  on_target: { tone: "ok", icon: <CheckCircle2 size={22} />, title: "Arrived as quoted" },
  fx_only: { tone: "info", icon: <TrendingDown size={22} />, title: "The exchange rate moved — not a fee" },
  explained: { tone: "ok", icon: <ListChecks size={22} />, title: "Everything is accounted for" },
  short: { tone: "warn", icon: <AlertTriangle size={22} />, title: "Some money is missing" },
  better: { tone: "ok", icon: <Sparkles size={22} />, title: "More arrived than expected" },
};

function verdictText(s: Settlement, quote: QuoteSnapshot, invoice: FreelancerInvoice) {
  const c = invoice.settlementCurrency;
  switch (s.verdict) {
    case "on_target": return `${money(Math.abs(s.gap), c)} ${s.gap < 0 ? "less" : "more"} than quoted — that’s rounding. Nothing to chase.`;
    case "fx_only": return `${invoice.currency} bought ${Math.abs(s.fxPct ?? 0)}% ${(s.fxMove ?? 0) < 0 ? "less" : "more"} ${c} between your quote and the credit. That is the whole ${money(Math.abs(s.gap), c)} difference.`;
    case "explained": return `Market movement and the charges you named add up to the ${money(Math.abs(s.gap), c)} difference.`;
    case "short": return s.fxChecked
      ? `After the market move and the charges you named, ${money(Math.abs(s.unexplained), c)} is still missing. Ask ${quote.providerName} for their breakdown.`
      : `${money(Math.abs(s.gap), c)} is missing. We couldn’t fetch exchange rates for those dates, so some of it may be market movement.`;
    case "better": return `${money(Math.abs(s.unexplained), c)} more arrived than the quote, the market and named charges explain.`;
  }
}

type InvestigationState = { report: ShortfallReport | null; running: boolean; error: string | null; counting: string | null; enabled: boolean; onRun: () => void; onCount: (label: string, amount: number) => Promise<void> };

/** The banner above a short credit says what Railor is doing about it, not just that it is short. */
function shortBanner(s: Settlement, provider: string, currency: string, inv: InvestigationState, fallback: string) {
  const missing = money(Math.max(0, -s.unexplained), currency);
  if (inv.running) return { title: `Finding where ${missing} went`, text: `Gemini is reading ${provider}’s own pages and Railor is checking the rate against mid-market.` };
  if (inv.report?.status === "found") return { title: `${missing} is short — here’s what could explain it`, text: `${provider}’s pages name charges taken on top of the quote. Check them below and count the ones that apply.` };
  if (inv.report) return { title: `${missing} is short, and ${provider}’s pages list nothing more`, text: `Ask ${provider} for the rate they used and any bank or intermediary charges, or check the credit advice from your bank.` };
  return { title: `${missing} is missing`, text: fallback };
}

function Result({ settlement: s, quote, invoice, view, reduce, inv }: { settlement: Settlement; quote: QuoteSnapshot; invoice: FreelancerInvoice; view: InvoiceSettlementView; reduce: boolean; inv: InvestigationState }) {
  const verdict = VERDICT[s.verdict];
  const banner = s.verdict === "short" ? shortBanner(s, quote.providerName, invoice.settlementCurrency, inv, verdictText(s, quote, invoice)) : { title: verdict.title, text: verdictText(s, quote, invoice) };
  const c = invoice.settlementCurrency;
  const fxUp = (s.fxMove ?? 0) >= 0;
  const scale = Math.max(Math.abs(s.fxMove ?? 0), s.deductionsTotal, Math.abs(s.unexplained), s.tolerance * 2, 1);
  const delay = (index: number) => (reduce ? 0 : 0.18 + index * 0.12);
  const rows: Array<{ key: string; label: string; sub: ReactNode; value: number | null; tone: "fx" | "named" | "gap"; icon: ReactNode }> = [
    { key: "fx", label: "Exchange rate moved", value: s.fxMove, tone: "fx", icon: fxUp ? <TrendingUp size={15} /> : <TrendingDown size={15} />,
      sub: s.fx ? <>{invoice.currency}/{c} {s.fx.quoteRate.toLocaleString("en-US", { maximumFractionDigits: 4 })} → {s.fx.receivedRate.toLocaleString("en-US", { maximumFractionDigits: 4 })} ({(s.fxPct ?? 0) > 0 ? "+" : ""}{s.fxPct}%) · <a href={s.fx.sourceUrl} target="_blank" rel="noreferrer noopener">{s.fx.source}</a></> : "We couldn’t fetch rates for those dates, so any market movement sits in “Unexplained”." },
    { key: "named", label: "Fees and charges you named", value: -s.deductionsTotal, tone: "named", icon: <ListChecks size={15} />,
      sub: s.deductions.length ? s.deductions.map((item) => `${item.label} ${money(item.amount, c)}`).join(" · ") : "None added. If a fee was taken, add it above." },
    { key: "gap", label: "Unexplained", value: s.unexplained, tone: "gap", icon: <AlertTriangle size={15} />,
      sub: Math.abs(s.unexplained) <= s.tolerance ? "Within rounding." : s.quotePartial ? `This quote left out ${s.quoteMissing[0] ?? "a cost"}, so some of this may be that.` : "Nobody has accounted for this yet." },
  ];
  const provider = quote.providerName;
  const copyMessage = async () => {
    const text = [`Hi ${provider} team,`, "", `Invoice ${invoice.invoiceNumber} (${money(Number(invoice.amount), invoice.currency)}) was quoted at ${money(s.expected, c)}. ${money(s.credited, c)} arrived.`,
      s.fxChecked ? `The market rate moved ${s.fxPct}% in between (${money(s.fxMove ?? 0, c)}), and I know of ${money(s.deductionsTotal, c)} in charges.` : "", `I can’t account for ${money(Math.abs(s.unexplained), c)}. Could you send the breakdown — rate used, fees and any bank or intermediary charges?`, "", "Thank you."].filter((line) => line !== "").join("\n");
    try { await navigator.clipboard.writeText(text); toast.success("Message copied", `Ready to send to ${provider}.`); } catch { toast.error("Couldn’t copy", "Select and copy it manually."); }
  };
  return (
    <motion.div className={styles.result} initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }} aria-live="polite">
      <div className={styles.verdict} data-tone={verdict.tone}>
        <motion.span className={styles.verdictIcon} initial={reduce ? false : { scale: 0.4, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 420, damping: 18, delay: 0.1 }}>{verdict.icon}</motion.span>
        <div><strong>{banner.title}</strong><p>{banner.text}</p></div>
      </div>

      <div className={styles.bridge}>
        <div className={styles.bridgeEnd}>
          <ProviderLogo slug={quote.providerSlug} name={quote.providerName} size={30} loading="eager" />
          <span>Expected</span>
          <strong><Amount value={s.expected} currency={c} animate={!reduce} /></strong>
        </div>
        <div className={styles.bridgeMid} aria-hidden>
          <motion.i initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.6, ease: EASE, delay: 0.15 }} />
          <span data-bad={s.gap < 0 || undefined}>{signed(s.gap, c)}</span>
        </div>
        <div className={styles.bridgeEnd} data-end>
          <span className={styles.bank}><Landmark size={16} aria-hidden /></span>
          <span>Arrived</span>
          <strong><Amount value={s.credited} currency={c} animate={!reduce} /></strong>
        </div>
      </div>

      <h3 className={styles.where}>Where the difference went</h3>
      <ul className={styles.deltas}>
        {rows.map((row, index) => {
          const value = row.value;
          const width = value === null ? 0 : Math.min(50, (Math.abs(value) / scale) * 50);
          const negative = (value ?? 0) < 0;
          return (
            <motion.li key={row.key} className={styles.delta} data-tone={row.tone} data-muted={value === null || undefined} initial={reduce ? false : { opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, ease: EASE, delay: delay(index) }}>
              <span className={styles.deltaIcon}>{row.icon}</span>
              <div className={styles.deltaText}><strong>{row.label}</strong><small>{row.sub}</small></div>
              <span className={styles.deltaValue}>{value === null ? "Not checked" : signed(value, c)}</span>
              <span className={styles.track} aria-hidden>
                <i />
                {value !== null && Math.abs(value) > 0 ? <motion.b data-negative={negative || undefined} style={negative ? { right: "50%" } : { left: "50%" }} initial={reduce ? false : { width: 0 }} animate={{ width: `${width}%` }} transition={{ duration: 0.7, ease: EASE, delay: delay(index) + 0.1 }} /> : null}
              </span>
            </motion.li>
          );
        })}
      </ul>

      {s.verdict === "short" || inv.report ? (
        <Investigation settlement={s} provider={quote.providerName} invoiceCurrency={invoice.currency} settlementCurrency={c} report={inv.report} running={inv.running} error={inv.error}
          counted={new Set(s.deductions.map((item) => item.label))} counting={inv.counting} reduce={reduce} onRun={inv.onRun} onCount={inv.onCount} />
      ) : null}

      <div className={styles.actions}>
        {s.verdict === "short" ? <button type="button" className={styles.primary} onClick={copyMessage}><Copy size={14} />Copy a message to {provider}</button> : null}
        <a className={styles.secondary} href={`/api/freelancer?id=${invoice.id}&format=csv`}><Download size={14} />Export CSV</a>
      </div>

      {view.receipts.length ? (
        <ul className={styles.receipts} aria-label="Credits recorded">
          {view.receipts.map((receipt, index) => (
            <motion.li key={receipt.id} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay(rows.length) + index * 0.06 }}>
              <ProviderLogo slug={receipt.quote?.providerSlug ?? receipt.providerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")} name={receipt.providerName} size={26} />
              <div><strong>{money(Number(receipt.settlementAmount), receipt.settlementCurrency)}</strong><small>{receipt.providerName} · {niceDate(receipt.receivedDate)}</small></div>
              <span className={styles.tag} data-kind={receipt.settlement?.verdict === "short" ? "warn" : "ok"}>{receipt.settlement ? VERDICT[receipt.settlement.verdict].title : "No quote saved"}</span>
            </motion.li>
          ))}
        </ul>
      ) : null}
    </motion.div>
  );
}
