"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Building2, Check, ChevronRight, Clock3, Copy, Download, FileText, Loader2, Plus, Sparkles, Users, X } from "lucide-react";
import type { InvoiceDraft } from "@railor/core";
import type { FreelancerInvoice, InvoiceRouting, InvoiceSettlementView } from "../../lib/freelancer";
import { DocumentUpload } from "./invoice-document-upload";
import { InvoiceSettlement } from "./invoice-settlement";
import { toast } from "../toast";
import { PAY_METHODS, PayMethodSelect, type PayMethod } from "../price/pay-method-select";
import { FreelancerReceivingRoutes } from "./freelancer-receiving-routes";
import styles from "./freelancer-workspace.module.css";


type Option = { value: string; label: string };
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

type Prefill = { amount?: string; currency?: string; paymentMethod?: PayMethod } | null;

export function FreelancerWorkspace({ initialInvoices, countries, currencies, country, settlementCurrency, canWrite, aiEnabled, sharedDemo, prefill = null }: { initialInvoices: FreelancerInvoice[]; countries: Option[]; currencies: Option[]; country: string; settlementCurrency: string; canWrite: boolean; aiEnabled: boolean; sharedDemo: boolean; prefill?: Prefill }) {
  const fresh = (): InvoiceDraft => ({ invoiceNumber: "", clientName: "", clientCountry: "", accountCountry: country, currency: "USD", amount: "", settlementCurrency, dueDate: null, profile: "freelancer", purpose: "services" });
  const [invoices, setInvoices] = useState(initialInvoices);
  // A price check can hand over its amount and currency; the invoice itself still wins once read.
  const [draft, setDraft] = useState<InvoiceDraft>(() => ({ ...fresh(), ...(prefill?.amount ? { amount: prefill.amount } : {}), ...(prefill?.currency ? { currency: prefill.currency } : {}) }));
  const [carried, setCarried] = useState<Prefill>(prefill);
  const [payMethod, setPayMethod] = useState<PayMethod>(prefill?.paymentMethod ?? "local_bank");
  const [selected, setSelected] = useState<string | null>(null);
  const [routing, setRouting] = useState<InvoiceRouting | null>(null);
  const [view, setView] = useState<InvoiceSettlementView | null>(null);
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState("");
  const [copied, setCopied] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const invoice = invoices.find((i) => i.id === selected) ?? null;
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
  async function loadView(id: string) {
    const response = await fetch(`/api/freelancer?id=${id}`);
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    setView(data);
  }
  useEffect(() => {
    let current = true;
    setView(null);
    if (selected) fetch(`/api/freelancer?id=${selected}`).then(async (r) => { const data = await r.json(); if (!r.ok) throw new Error(data.error); if (current) setView(data); }).catch((e) => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [selected]);
  async function compare(id: string, method: PayMethod = payMethod) {
    const result = await api({ action: "route", id, paymentMethod: method }); setRouting(result.routing);
    setProvider(result.routing.candidates.find((r: { providerSlug: string }) => r.providerSlug === result.routing.recommendedSlug)?.providerName ?? "");
    // The recommended price is now saved as this invoice's quote.
    await loadView(id).catch(() => undefined);
  }
  /** Picking a route card also picks the quote the bank credit will be judged against. */
  function selectRoute(name: string) {
    setProvider(name);
    const row = routing?.candidates.find((candidate) => candidate.providerName === name);
    if (!invoice || !routing?.checkId || !row) return;
    api({ action: "choose", id: invoice.id, checkId: routing.checkId, providerSlug: row.providerSlug })
      .then((result) => setView((current) => current ? { ...current, quote: result.quote } : current))
      .catch((e) => { if (row.recipientAmount !== null) toast.error("Couldn’t lock that quote", e instanceof Error ? e.message : undefined); });
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
  async function recorded(next: InvoiceSettlementView) {
    setView(next); setRouting(null);
    try { await refresh(); } catch (e) { setError((e as Error).message); }
  }
  const requestText = invoice ? `Hi ${invoice.clientName},\n\nPlease arrange payment for invoice ${invoice.invoiceNumber}: ${invoice.outstanding} ${invoice.currency}${invoice.dueDate ? `, due ${invoice.dueDate}` : ""}.\nPlease include ${invoice.invoiceNumber} as the payment reference.${provider ? `\nThe receiving provider I am considering is ${provider}; I will confirm onboarding and share its verified receiving instructions separately.` : "\nI will share verified receiving instructions separately."}\n\nThank you.` : "";
  async function copy() { try { await navigator.clipboard.writeText(requestText); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setError("Copy is unavailable in this browser. Select and copy the request text below."); } }
  const clientCount = new Set(invoices.map((item) => item.clientName.trim().toLowerCase() + ":" + item.clientCountry)).size;
  const clientCountries = new Set(invoices.map((item) => item.clientCountry)).size;
  const step = invoice?.status === "recorded_paid" || view?.receipts.length ? 2 : invoice ? 1 : 0;
  const checkedAt = routing ? new Date(routing.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC" : null;
  const receivingCountry = countries.find((item) => item.value === draft.accountCountry)?.label ?? draft.accountCountry;
  function newInvoice() { setSelected(null); setRouting(null); setProvider(""); setError(""); setDraft(fresh()); setView(null); setUploadKey((value) => value + 1); requestAnimationFrame(() => form.current?.scrollIntoView({ block: "start" })); }
  return <div className={styles.workspace}>
    <header className={styles.header}>
      <div className={styles.intro}><h1>Get paid</h1><p>Add an invoice, see the cheapest way to receive it, and track what reaches your bank.</p><button type="button" disabled={working || !canWrite} className={styles.newInvoice} onClick={newInvoice}><Plus size={15} />New invoice</button></div>
      {invoices.length ? <div className={styles.stats} aria-label="Invoice overview">
        <div><span className={styles.statIcon}><FileText size={18} /></span><p><strong>{invoices.length}</strong><span>Saved invoices</span><small>In this workspace</small></p></div>
        <div><span className={styles.statIcon}><Users size={18} /></span><p><strong>{clientCount}</strong><span>Invoice clients</span><small>{clientCountries} {clientCountries === 1 ? "country" : "countries"}</small></p></div>
        <div><span className={styles.statIcon}><Clock3 size={18} /></span><p><strong className={styles.checkTime}>{checkedAt ?? "Not checked yet"}</strong><span>Last comparison</span><small>{routing ? "Prices checked for this invoice" : "Save an invoice to begin"}</small></p></div>
      </div> : null}
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
        {invoice ? <><div className="mb-4 flex items-center gap-2"><FileText size={18} /><h2 className="text-[17px] font-bold">{invoice.invoiceNumber}</h2></div><p className="text-[13px] text-[var(--color-muted)]">{invoice.clientName} · {invoice.clientCountry} → {invoice.accountCountry}</p><div className="my-5"><span className="text-[12.5px] text-[var(--color-muted)] font-semibold">Still to collect</span><p className="mt-1 text-[32px] font-bold tracking-tight">{Number(invoice.outstanding).toLocaleString(undefined, { maximumFractionDigits: 3 })} <span className="text-[17px]">{invoice.currency}</span></p><p className="mt-2 text-[12px] text-[var(--color-muted)]">{statusLabel(invoice.status)}{invoice.dueDate ? ` · Due ${invoice.dueDate}` : ""}</p></div><dl className="space-y-2 border-t border-[var(--color-line)] pt-4 text-[12px]"><div className="flex justify-between"><dt>Invoice total</dt><dd>{displayMoney(invoice.amount, invoice.currency)}</dd></div><div className="flex justify-between"><dt>Allocated receipts</dt><dd>{invoice.covered} {invoice.currency}</dd></div><div className="flex justify-between"><dt>Bank settlement</dt><dd>{invoice.settlementCurrency}</dd></div></dl><div className="mt-5"><PayMethodSelect value={payMethod} label="Client pays by" onChange={(method) => { setPayMethod(method); if (!locked && invoice.status !== "recorded_paid") { setBusy(true); setError(""); compare(invoice.id, method).catch((e) => setError((e as Error).message)).finally(() => setBusy(false)); } }} /></div><div className="mt-3 flex flex-wrap gap-2"><button onClick={reroute} disabled={locked || invoice.status === "recorded_paid"} className={buttonClass}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Compare routes</button><a className={secondaryClass} href={`/api/freelancer?id=${invoice.id}&format=csv`}><Download size={13} /> Export CSV</a></div><p className="mt-4 text-[12.5px] leading-relaxed text-[var(--color-muted)]">Invoice details are saved after your review. Payment status reflects receipts you record; live provider tracking requires an authorized receiving integration.</p></> : <form ref={form} onSubmit={save}>
          <div id="invoice" className={styles.panelHeading}><div><h2>Invoice details</h2><p>Upload your invoice or add the key details below.</p></div><span className={styles.sectionIcon}><FileText size={18} /></span></div>
          {carried ? <p role="status" className={styles.carried}><span>From your price check: <strong>{[carried.amount ? Number(carried.amount).toLocaleString("en-US", { maximumFractionDigits: 2 }) : null, carried.currency].filter(Boolean).join(" ") || "your setup"}</strong>{carried.paymentMethod ? <> · client pays by {PAY_METHODS.find((option) => option.value === carried.paymentMethod)?.label.toLowerCase()}</> : null}. Upload the invoice to fill in the rest, or type it below.</span><button type="button" aria-label="Dismiss" onClick={() => setCarried(null)}><X size={14} /></button></p> : null}
          <DocumentUpload key={uploadKey} kind="invoice" aiEnabled={aiEnabled} disabled={locked} sharedDemo={sharedDemo} onBusyChange={setExtracting} onProposal={(value) => { setDraft((d) => ({ ...d, invoiceNumber: String(value.invoiceNumber ?? ""), clientName: String(value.clientName ?? ""), clientCountry: String(value.clientCountry ?? ""), currency: String(value.currency ?? ""), amount: String(value.amount ?? ""), dueDate: typeof value.dueDate === "string" ? value.dueDate : null })); }} />
          <div className={styles.manualDivider}><span>Or enter the details yourself</span></div>
          <fieldset disabled={locked} className={styles.formGrid}><Field label="Invoice number"><input required maxLength={100} className={inputClass} value={draft.invoiceNumber} onChange={(e) => field("invoiceNumber", e.target.value)} placeholder="INV-2026-001" /></Field><Field label="Client name"><input required maxLength={160} className={inputClass} value={draft.clientName} onChange={(e) => field("clientName", e.target.value)} placeholder="Your overseas client" /></Field><Field label="Invoice total"><input required inputMode="decimal" className={inputClass} value={draft.amount} onChange={(e) => field("amount", e.target.value)} placeholder="2000.00" /></Field><Select label="Invoice currency" options={currencies} value={draft.currency} onChange={(v) => field("currency", v)} /><Select label="Client country" options={countries} value={draft.clientCountry} onChange={(v) => field("clientCountry", v)} /><Field label="Due date (optional)"><input name="dueDate" type="date" className={inputClass} value={draft.dueDate ?? ""} onInput={(e) => field("dueDate", e.currentTarget.value || null)} onChange={(e) => field("dueDate", e.target.value || null)} /></Field></fieldset>
          <details open className={styles.receivingSetup}><summary><Building2 size={14} /><span>Receiving setup <strong>{receivingCountry} · {draft.settlementCurrency}</strong></span><ChevronRight size={13} /></summary><p>Tell us where you receive payments so we can check the right routes.</p><fieldset disabled={locked} className="mt-3 grid gap-3 sm:grid-cols-2"><Select label="Your account country" options={countries} value={draft.accountCountry} onChange={(v) => field("accountCountry", v)} /><Select label="Bank currency" options={currencies} value={draft.settlementCurrency} onChange={(v) => field("settlementCurrency", v)} /><Select label="Account holder" options={[{ value: "freelancer", label: "Freelancer (personal name)" }, { value: "sole_proprietor", label: "Registered sole proprietor" }]} value={draft.profile} onChange={(v) => field("profile", v as InvoiceDraft["profile"])} /><Select label="Invoice purpose" options={[{ value: "services", label: "Services / client work" }, { value: "goods", label: "Goods export" }]} value={draft.purpose} onChange={(v) => field("purpose", v as InvoiceDraft["purpose"])} /></fieldset></details>
          <p className="my-4 text-[12.5px] leading-relaxed text-[var(--color-muted)]">Check the amount, currency and client details. Provider eligibility, fees and documentation depend on your receiving setup.</p><button disabled={locked} className={`${styles.saveInvoice} ${buttonClass}`}>{busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}{busy ? "Saving & checking routes…" : "Save & find receiving routes"}</button>
        </form>}
      </section>
      <div className="space-y-5">
        {invoice?.status !== "recorded_paid" && <FreelancerReceivingRoutes routing={routing} invoice={invoice} draft={draft} busy={busy} locked={locked} provider={provider} onSelect={selectRoute} />}
        {invoice && invoice.status !== "recorded_paid" && <section className={panelClass}><div className="flex items-center justify-between gap-3"><h2 className="text-[17px] font-bold">Payment request</h2><button type="button" className={secondaryClass} onClick={copy}><Copy size={13} />{copied ? "Copied" : "Copy request"}</button></div><p className="my-3 text-[12px] text-[var(--color-muted)]">Confirm your provider account first, then share its verified receiving details with your client.</p><pre className="whitespace-pre-wrap rounded-xl bg-[var(--color-surface)] p-4 font-sans text-[12px] leading-relaxed">{requestText}</pre></section>}
        {invoice && <InvoiceSettlement invoice={invoice} view={view} routing={routing} busy={busy} locked={locked} aiEnabled={aiEnabled} sharedDemo={sharedDemo} onFindQuote={reroute} onView={setView} onRecorded={recorded} />}
      </div>
    </div>
    <section className={panelClass} aria-label="Saved invoices"><div className="mb-4 flex items-center justify-between"><h2 className="text-[17px] font-bold">Your invoices</h2><span className="text-[12.5px] text-[var(--color-muted)]">Latest 100 · workspace private</span></div>{!invoices.length ? <p className="py-6 text-center text-[13px] text-[var(--color-muted)]">Your first invoice starts here. Add a file or enter the details above; saved invoices and their payment status will appear in this list.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-[12px]"><thead className="border-b border-[var(--color-line)] text-[var(--color-muted)]"><tr>{["Invoice / client", "Total", "Outstanding", "Due", "Status", ""].map((title) => <th key={title} className="px-2 py-3 font-medium">{title}</th>)}</tr></thead><tbody>{invoices.map((row) => <tr key={row.id} className="border-b border-[var(--color-line)] last:border-0"><td className="px-2 py-4"><strong>{row.invoiceNumber}</strong><p className="mt-1 text-[var(--color-muted)]">{row.clientName}</p></td><td className="px-2 py-4 tabular-nums">{displayMoney(row.amount, row.currency)}</td><td className="px-2 py-4 tabular-nums">{displayMoney(row.outstanding, row.currency)}</td><td className="px-2 py-4">{row.dueDate ?? "—"}</td><td className="px-2 py-4">{statusLabel(row.status)}</td><td className="px-2 py-4"><button disabled={working} className={secondaryClass} onClick={() => { setSelected(row.id); setRouting(null); setProvider(""); setError(""); }}>Open <ArrowRight size={12} /></button></td></tr>)}</tbody></table></div>}</section>
  </div>;
}
