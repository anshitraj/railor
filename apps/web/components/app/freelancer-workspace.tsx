"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Building2, Check, ChevronRight, Clock3, Copy, Download, FileText, Loader2, Plus, Sparkles, Users } from "lucide-react";
import type { InvoiceDraft, ReceiptDraft } from "@railor/core";
import type { FreelancerInvoice, InvoiceRouting } from "../../lib/freelancer";
import { DocumentUpload } from "./invoice-document-upload";
import { FreelancerReceivingRoutes } from "./freelancer-receiving-routes";
import styles from "./freelancer-workspace.module.css";


type Option = { value: string; label: string };
type SavedReceipt = { id: string; reference: string; providerName: string; sourceAmount: string; sourceCurrency: string; settlementAmount: string; settlementCurrency: string; receivedDate: string };
const inputClass = styles.input;
const buttonClass = styles.primary;
const secondaryClass = styles.secondary;
const panelClass = styles.panel;
const statusLabel = (status: string) => status === "recorded_paid" ? "Paid · recorded manually" : status === "partially_paid" ? "Partially paid · manual" : "Awaiting payment";
function displayMoney(value: string, currency: string) {
  const decimals = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return `${Number(value).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${currency}`;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-1.5 text-[12px] font-medium text-[var(--color-muted)]"><span>{label}</span>{children}</label>; }
function Select({ options, value, onChange, label }: { options: Option[]; value: string; onChange: (value: string) => void; label: string }) { return <Field label={label}><select required className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}><option value="">Choose…</option>{options.map((o) => <option value={o.value} key={o.value}>{o.label}</option>)}</select></Field>; }
async function api(payload: unknown) {
  const response = await fetch("/api/freelancer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed. Try again.");
  return result;
}

export function FreelancerWorkspace({ initialInvoices, countries, currencies, country, settlementCurrency, canWrite, aiEnabled, sharedDemo }: { initialInvoices: FreelancerInvoice[]; countries: Option[]; currencies: Option[]; country: string; settlementCurrency: string; canWrite: boolean; aiEnabled: boolean; sharedDemo: boolean }) {
  const fresh = (): InvoiceDraft => ({ invoiceNumber: "", clientName: "", clientCountry: "", accountCountry: country, currency: "USD", amount: "", settlementCurrency, dueDate: null, profile: "freelancer", purpose: "services" });
  const [invoices, setInvoices] = useState(initialInvoices);
  const [draft, setDraft] = useState<InvoiceDraft>(fresh);
  const [selected, setSelected] = useState<string | null>(null);
  const [routing, setRouting] = useState<InvoiceRouting | null>(null);
  const [receipts, setReceipts] = useState<SavedReceipt[]>([]);
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [showReceipt, setShowReceipt] = useState(false);
  const [receipt, setReceipt] = useState<Partial<ReceiptDraft>>({});
  const [provider, setProvider] = useState("");
  const [copied, setCopied] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const invoice = invoices.find((i) => i.id === selected) ?? null;
  const retry = useRef<string | null>(null);
  const working = busy || extracting;
  const locked = working || !canWrite;
  useEffect(() => {
    if (!routing) return;
    const panel = document.getElementById("freelancer-receiving-routes");
    if (panel && (panel.getBoundingClientRect().top < 72 || panel.getBoundingClientRect().top > window.innerHeight - 120)) panel.scrollIntoView({ block: "start" });
  }, [routing]);
  function field<K extends keyof InvoiceDraft>(key: K, value: InvoiceDraft[K]) { setDraft((d) => ({ ...d, [key]: value })); }
  async function refresh() {
    const response = await fetch("/api/freelancer");
    const result = await response.json(); if (!response.ok) throw new Error(result.error);
    setInvoices(result.invoices);
  }
  useEffect(() => {
    let current = true;
    setReceipts([]); setReceipt({}); setShowReceipt(false); retry.current = null;
    if (selected) fetch(`/api/freelancer?id=${selected}`).then(async (r) => { const data = await r.json(); if (!r.ok) throw new Error(data.error); if (current) setReceipts(data.receipts); }).catch((e) => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [selected]);
  async function compare(id: string) {
    const result = await api({ action: "route", id }); setRouting(result.routing);
    setProvider(result.routing.candidates.find((r: { providerSlug: string }) => r.providerSlug === result.routing.recommendedSlug)?.providerName ?? "");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const reviewedDate = String(new FormData(event.currentTarget as HTMLFormElement).get("dueDate") ?? "") || null;
    setBusy(true); setError("");
    try {
      const result = await api({ action: "save", draft: { ...draft, dueDate: reviewedDate } });
      setInvoices((items) => [{ ...result.invoice, status: "awaiting_payment", covered: "0", outstanding: result.invoice.amount }, ...items]);
      setSelected(result.invoice.id); setRouting(null);
      await refresh();
      await compare(result.invoice.id);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function reroute() {
    if (!invoice) return; setBusy(true); setError(""); setRouting(null);
    try { await compare(invoice.id); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function startReceipt() {
    if (!invoice) return;
    const today = new Date();
    const receivedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setReceipt({ reference: "", providerName: provider, sourceCurrency: invoice.currency, sourceAmount: invoice.outstanding, settlementCurrency: invoice.settlementCurrency, settlementAmount: "", receivedDate, confirmed: undefined }); retry.current = null; setShowReceipt(true);
  }
  function receiptField(key: keyof ReceiptDraft, value: string | boolean) { retry.current = null; setReceipt((r) => ({ ...r, [key]: value })); }
  async function record(event: FormEvent) {
    event.preventDefault(); if (!invoice) return;
    const receivedDate = String(new FormData(event.currentTarget as HTMLFormElement).get("receivedDate") ?? "");
    setBusy(true); setError("");
    retry.current ??= crypto.randomUUID();
    try {
      await api({ action: "receipt", id: invoice.id, draft: { ...receipt, receivedDate, requestId: retry.current } });
      await refresh();
      const response = await fetch(`/api/freelancer?id=${invoice.id}`); const result = await response.json(); if (!response.ok) throw new Error(result.error); setReceipts(result.receipts);
      setShowReceipt(false); retry.current = null; setRouting(null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const requestText = invoice ? `Hi ${invoice.clientName},\n\nPlease arrange payment for invoice ${invoice.invoiceNumber}: ${invoice.outstanding} ${invoice.currency}${invoice.dueDate ? `, due ${invoice.dueDate}` : ""}.\nPlease include ${invoice.invoiceNumber} as the payment reference.${provider ? `\nThe receiving provider I am considering is ${provider}; I will confirm onboarding and share its verified receiving instructions separately.` : "\nI will share verified receiving instructions separately."}\n\nThank you.` : "";
  async function copy() { try { await navigator.clipboard.writeText(requestText); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setError("Copy is unavailable in this browser. Select and copy the request text below."); } }
  const clientCount = new Set(invoices.map((item) => item.clientName.trim().toLowerCase() + ":" + item.clientCountry)).size;
  const clientCountries = new Set(invoices.map((item) => item.clientCountry)).size;
  const step = showReceipt || invoice?.status === "recorded_paid" ? 2 : invoice ? 1 : 0;
  const checkedAt = routing ? new Date(routing.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC" : null;
  const receivingCountry = countries.find((item) => item.value === draft.accountCountry)?.label ?? draft.accountCountry;
  function newInvoice() { setSelected(null); setRouting(null); setProvider(""); setError(""); setDraft(fresh()); setShowReceipt(false); setUploadKey((value) => value + 1); requestAnimationFrame(() => form.current?.scrollIntoView({ block: "start" })); }
  return <div className={styles.workspace}>
    <header className={styles.header}>
      <div className={styles.intro}><span className={styles.eyebrow}>Freelancer / Get paid</span><h1>Get paid</h1><p>Upload an invoice, compare receiving routes, and track what reaches your bank.</p><button type="button" disabled={working || !canWrite} className={styles.newInvoice} onClick={newInvoice}><Plus size={15} />New invoice</button></div>
      <div className={styles.stats} aria-label="Invoice overview">
        <div><span className={styles.statIcon}><FileText size={18} /></span><p><strong>{invoices.length}</strong><span>Saved invoices</span><small>In this workspace</small></p></div>
        <div><span className={styles.statIcon}><Users size={18} /></span><p><strong>{clientCount}</strong><span>Invoice clients</span><small>{clientCountries} {clientCountries === 1 ? "country" : "countries"}</small></p></div>
        <div><span className={styles.statIcon}><Clock3 size={18} /></span><p><strong className={styles.checkTime}>{checkedAt ?? "Not checked yet"}</strong><span>Last comparison</span><small>{routing ? "Prices checked for this invoice" : "Save an invoice to begin"}</small></p></div>
      </div>
    </header>
    <ol className={styles.steps} aria-label="Invoice workflow">{[
      { title: "Upload & review", detail: "Import a file or add the invoice details" },
      { title: "Compare receiving routes", detail: "Review fees, eligibility and delivery" },
      { title: "Record & reconcile", detail: "Match your receipt to the invoice" },
    ].map((item, index) => <li key={item.title} aria-current={step === index ? "step" : undefined} data-complete={step > index}><span className={styles.stepNumber}>{step > index ? <Check size={14} /> : index + 1}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div>{index < 2 && <ChevronRight size={15} className={styles.stepChevron} />}</li>)}</ol>
    {!canWrite && <p role="status" className="text-[13px]">You have view-only access. A workspace member can upload invoices and record receipts.</p>}
    {error && <div role="alert" className="rounded-xl border border-[var(--color-bad)]/30 bg-[var(--color-bad-bg)] p-4 text-[13px]">{error}</div>}
    <div className={styles.layout}>
      <section className={panelClass} aria-label={invoice ? "Selected invoice" : "Review invoice"}>
        {invoice ? <><div className="mb-4 flex items-center gap-2"><FileText size={18} /><h2 className="text-[17px] font-bold">{invoice.invoiceNumber}</h2></div><p className="text-[13px] text-[var(--color-muted)]">{invoice.clientName} · {invoice.clientCountry} → {invoice.accountCountry}</p><div className="my-5"><span className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">Still to collect</span><p className="mt-1 text-[32px] font-bold tracking-tight">{Number(invoice.outstanding).toLocaleString(undefined, { maximumFractionDigits: 3 })} <span className="text-[17px]">{invoice.currency}</span></p><p className="mt-2 text-[12px] text-[var(--color-muted)]">{statusLabel(invoice.status)}{invoice.dueDate ? ` · Due ${invoice.dueDate}` : ""}</p></div><dl className="space-y-2 border-t border-[var(--color-line)] pt-4 text-[12px]"><div className="flex justify-between"><dt>Invoice total</dt><dd>{displayMoney(invoice.amount, invoice.currency)}</dd></div><div className="flex justify-between"><dt>Allocated receipts</dt><dd>{invoice.covered} {invoice.currency}</dd></div><div className="flex justify-between"><dt>Bank settlement</dt><dd>{invoice.settlementCurrency}</dd></div></dl><div className="mt-5 flex flex-wrap gap-2"><button onClick={reroute} disabled={locked || invoice.status === "recorded_paid"} className={buttonClass}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Compare routes</button><a className={secondaryClass} href={`/api/freelancer?id=${invoice.id}&format=csv`}><Download size={13} /> Export CSV</a></div><p className="mt-4 text-[11px] leading-relaxed text-[var(--color-muted)]">Invoice details are saved after your review. Payment status reflects receipts you record; live provider tracking requires an authorized receiving integration.</p></> : <form ref={form} onSubmit={save}>
          <div className={styles.panelHeading}><div><h2>Invoice details</h2><p>Upload your invoice or add the key details below.</p></div><span className={styles.sectionIcon}><FileText size={18} /></span></div>
          <DocumentUpload key={uploadKey} kind="invoice" aiEnabled={aiEnabled} disabled={locked} sharedDemo={sharedDemo} onBusyChange={setExtracting} onProposal={(value) => { setDraft((d) => ({ ...d, invoiceNumber: String(value.invoiceNumber ?? ""), clientName: String(value.clientName ?? ""), clientCountry: String(value.clientCountry ?? ""), currency: String(value.currency ?? ""), amount: String(value.amount ?? ""), dueDate: typeof value.dueDate === "string" ? value.dueDate : null })); }} />
          <div className={styles.manualDivider}><span>Or enter the details yourself</span></div>
          <fieldset disabled={locked} className={styles.formGrid}><Field label="Invoice number"><input required maxLength={100} className={inputClass} value={draft.invoiceNumber} onChange={(e) => field("invoiceNumber", e.target.value)} placeholder="INV-2026-001" /></Field><Field label="Client name"><input required maxLength={160} className={inputClass} value={draft.clientName} onChange={(e) => field("clientName", e.target.value)} placeholder="Your overseas client" /></Field><Field label="Invoice total"><input required inputMode="decimal" className={inputClass} value={draft.amount} onChange={(e) => field("amount", e.target.value)} placeholder="2000.00" /></Field><Select label="Invoice currency" options={currencies} value={draft.currency} onChange={(v) => field("currency", v)} /><Select label="Client country" options={countries} value={draft.clientCountry} onChange={(v) => field("clientCountry", v)} /><Field label="Due date (optional)"><input name="dueDate" type="date" className={inputClass} value={draft.dueDate ?? ""} onInput={(e) => field("dueDate", e.currentTarget.value || null)} onChange={(e) => field("dueDate", e.target.value || null)} /></Field></fieldset>
          <details open className={styles.receivingSetup}><summary><Building2 size={14} /><span>Receiving setup <strong>{receivingCountry} · {draft.settlementCurrency}</strong></span><ChevronRight size={13} /></summary><p>Tell us where you receive payments so we can check the right routes.</p><fieldset disabled={locked} className="mt-3 grid gap-3 sm:grid-cols-2"><Select label="Your account country" options={countries} value={draft.accountCountry} onChange={(v) => field("accountCountry", v)} /><Select label="Bank currency" options={currencies} value={draft.settlementCurrency} onChange={(v) => field("settlementCurrency", v)} /><Select label="Account holder" options={[{ value: "freelancer", label: "Freelancer (personal name)" }, { value: "sole_proprietor", label: "Registered sole proprietor" }]} value={draft.profile} onChange={(v) => field("profile", v as InvoiceDraft["profile"])} /><Select label="Invoice purpose" options={[{ value: "services", label: "Services / client work" }, { value: "goods", label: "Goods export" }]} value={draft.purpose} onChange={(v) => field("purpose", v as InvoiceDraft["purpose"])} /></fieldset></details>
          <p className="my-4 text-[11px] leading-relaxed text-[var(--color-muted)]">Check the amount, currency and client details. Provider eligibility, fees and documentation depend on your receiving setup.</p><button disabled={locked} className={`${styles.saveInvoice} ${buttonClass}`}>{busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}{busy ? "Saving & checking routes…" : "Save & find receiving routes"}</button>
        </form>}
      </section>
      <div className="space-y-5">
        <FreelancerReceivingRoutes routing={routing} invoice={invoice} draft={draft} busy={busy} locked={locked} provider={provider} onSelect={setProvider} />
        {invoice && invoice.status !== "recorded_paid" && <section className={panelClass}><div className="flex items-center justify-between gap-3"><h2 className="text-[17px] font-bold">Payment request</h2><button type="button" className={secondaryClass} onClick={copy}><Copy size={13} />{copied ? "Copied" : "Copy request"}</button></div><p className="my-3 text-[12px] text-[var(--color-muted)]">Confirm your provider account first, then share its verified receiving details with your client.</p><pre className="whitespace-pre-wrap rounded-xl bg-[var(--color-surface)] p-4 font-sans text-[12px] leading-relaxed">{requestText}</pre></section>}
        {invoice && <section className={panelClass} aria-label="Reconciliation"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-[17px] font-bold">Receipts & reconciliation</h2>{invoice.status !== "recorded_paid" && !showReceipt && <button disabled={locked} type="button" className={secondaryClass} onClick={startReceipt}><Plus size={13} /> Record receipt</button>}</div><p className="mt-2 text-[12px] leading-relaxed text-[var(--color-muted)]">Match the amount covered in {invoice.currency} to this invoice. Record the net {invoice.settlementCurrency} bank credit separately, so conversion and fees do not create a false underpayment.</p>
          {showReceipt && <form onSubmit={record} className="mt-5"><DocumentUpload kind="receipt" aiEnabled={aiEnabled} disabled={locked} sharedDemo={sharedDemo} onBusyChange={setExtracting} onProposal={(value) => { retry.current = null; setReceipt((r) => ({ ...r, ...Object.fromEntries(["reference", "providerName", "sourceAmount", "sourceCurrency", "settlementAmount", "settlementCurrency", "receivedDate"].map((key) => [key, typeof value[key] === "string" ? value[key] : ""])), confirmed: undefined })); }} /><fieldset disabled={locked} className="grid gap-3 sm:grid-cols-2">{[["reference", "Receipt / bank reference"], ["providerName", "Receiving provider"], ["sourceAmount", `Amount of invoice covered (${invoice.currency})`], ["settlementAmount", `Net bank credit (${invoice.settlementCurrency})`]] .map(([key, label]) => <Field key={key} label={label!}><input required maxLength={key === "reference" ? 120 : key === "providerName" ? 100 : 24} className={inputClass} inputMode={key!.includes("Amount") ? "decimal" : "text"} value={String(receipt[key as keyof ReceiptDraft] ?? "")} onChange={(e) => receiptField(key as keyof ReceiptDraft, e.target.value)} /></Field>)}<Select label="Allocation currency" options={currencies} value={receipt.sourceCurrency ?? ""} onChange={(v) => receiptField("sourceCurrency", v)} /><Select label="Bank credit currency" options={currencies} value={receipt.settlementCurrency ?? ""} onChange={(v) => receiptField("settlementCurrency", v)} /><Field label="Received date"><input name="receivedDate" required type="date" className={inputClass} value={receipt.receivedDate ?? ""} onInput={(e) => receiptField("receivedDate", e.currentTarget.value)} onChange={(e) => receiptField("receivedDate", e.target.value)} /></Field></fieldset><label className="my-4 flex items-start gap-2 text-[12px] leading-relaxed"><input required disabled={locked} type="checkbox" checked={receipt.confirmed === true} onChange={(e) => receiptField("confirmed", e.target.checked)} className="mt-1 accent-[var(--color-orange)]" /><span>I have checked my provider or bank statement and confirm this receipt belongs to this invoice. This is a manual record.</span></label><div className="flex gap-2"><button disabled={locked || !receipt.confirmed} className={buttonClass}>Save & reconcile</button><button disabled={working} className={secondaryClass} type="button" onClick={() => setShowReceipt(false)}>Cancel</button></div></form>}
          <div className="mt-4 space-y-2">{receipts.map((r) => <div className="flex flex-wrap justify-between gap-2 rounded-xl bg-[var(--color-surface)] p-3 text-[12px]" key={r.id}><div><strong>{r.reference}</strong><p className="mt-1 text-[var(--color-muted)]">{r.providerName} · {r.receivedDate} · manual record</p></div><div className="text-right"><p>{displayMoney(r.sourceAmount, r.sourceCurrency)} allocated</p><p className="mt-1 text-[var(--color-muted)]">{displayMoney(r.settlementAmount, r.settlementCurrency)} bank credit</p></div></div>)}{!receipts.length && !showReceipt && <p className="py-3 text-[12px] text-[var(--color-muted)]">No receipts yet. When payment reaches your account, choose “Record receipt” and enter the amount from your statement.</p>}</div>
        </section>}
      </div>
    </div>
    <section className={panelClass} aria-label="Saved invoices"><div className="mb-4 flex items-center justify-between"><h2 className="text-[17px] font-bold">Your invoices</h2><span className="text-[11px] text-[var(--color-muted)]">Latest 100 · workspace private</span></div>{!invoices.length ? <p className="py-6 text-center text-[13px] text-[var(--color-muted)]">Your first invoice starts here. Add a file or enter the details above; saved invoices and their payment status will appear in this list.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-[12px]"><thead className="border-b border-[var(--color-line)] text-[var(--color-muted)]"><tr>{["Invoice / client", "Total", "Outstanding", "Due", "Status", ""].map((title) => <th key={title} className="px-2 py-3 font-medium">{title}</th>)}</tr></thead><tbody>{invoices.map((row) => <tr key={row.id} className="border-b border-[var(--color-line)] last:border-0"><td className="px-2 py-4"><strong>{row.invoiceNumber}</strong><p className="mt-1 text-[var(--color-muted)]">{row.clientName}</p></td><td className="px-2 py-4 tabular-nums">{displayMoney(row.amount, row.currency)}</td><td className="px-2 py-4 tabular-nums">{displayMoney(row.outstanding, row.currency)}</td><td className="px-2 py-4">{row.dueDate ?? "—"}</td><td className="px-2 py-4">{statusLabel(row.status)}</td><td className="px-2 py-4"><button disabled={working} className={secondaryClass} onClick={() => { setSelected(row.id); setRouting(null); setProvider(""); setError(""); }}>Open <ArrowRight size={12} /></button></td></tr>)}</tbody></table></div>}</section>
  </div>;
}
