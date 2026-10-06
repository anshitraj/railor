"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Check, Copy, Download, FileText, Loader2, Plus, Sparkles, Upload } from "lucide-react";
import type { InvoiceDraft, ReceiptDraft } from "@railor/core";
import type { FreelancerInvoice, InvoiceRouting } from "../../lib/freelancer";
import { providerConnectionPath, priceSourceTime } from "../../lib/connection-navigation";
import { ProductHeader } from "./product-ui";
import { ProviderLogo } from "./provider-logo";

type Option = { value: string; label: string };
type SavedReceipt = { id: string; reference: string; providerName: string; sourceAmount: string; sourceCurrency: string; settlementAmount: string; settlementCurrency: string; receivedDate: string };
const inputClass = "w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2.5 text-[13px] outline-none focus:border-[var(--color-orange)] focus:ring-2 focus:ring-[var(--color-orange)]/15 disabled:opacity-60";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-[13px] font-bold text-[var(--color-paper)] hover:bg-[var(--color-orange-deep)] disabled:cursor-wait disabled:opacity-50";
const secondaryClass = "inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-line)] px-4 py-2 text-[12px] font-semibold hover:bg-[var(--color-surface)] disabled:opacity-50";
const panelClass = "rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] p-5 sm:p-6";
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

function DocumentUpload({ kind, aiEnabled, disabled, sharedDemo, onProposal, onBusyChange }: { kind: "invoice" | "receipt"; aiEnabled: boolean; disabled: boolean; sharedDemo: boolean; onProposal: (value: Record<string, unknown>) => void; onBusyChange: (busy: boolean) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function extract() {
    if (!file || !consent) return;
    setMessage(""); setBusy(true); onBusyChange(true);
    try {
      if (file.size > 4 * 1024 * 1024) throw new Error("Choose a file no larger than 4 MB.");
      const data = new FormData(); data.set("file", file); data.set("consent", "true"); data.set("kind", kind);
      const response = await fetch("/api/freelancer/extract", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      onProposal(result.proposal);
      setMessage(`Details extracted. Check every field below before saving. ${(result.proposal.warnings ?? []).join(" ")}`);
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); onBusyChange(false); }
  }
  if (sharedDemo) return <div className="mb-5 rounded-xl border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] p-4 text-[12px] leading-relaxed"><strong className="mb-1 block">Try it with fictional details</strong>The public demo is shared. <Link href="/login" className="underline">Create your own workspace</Link> to upload private invoices and receipts.</div>;
  return <div className="mb-5 rounded-xl border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] p-4">
    <div className="mb-3 flex items-center gap-2 text-[13px] font-bold"><Upload size={16} /> Upload {kind}<span className="ml-auto flex items-center gap-1 text-[11px] font-normal text-[var(--color-muted)]"><Sparkles size={12} /> Gemini</span></div>
    <label className="grid gap-2 text-[12px] text-[var(--color-muted)]"><span>PDF, PNG or JPEG · up to 4 MB</span><input aria-label={`Upload ${kind} file`} type="file" accept="application/pdf,image/png,image/jpeg" disabled={disabled || busy || !aiEnabled} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setConsent(false); setMessage(""); }} className="block w-full text-[12px] file:mr-3 file:rounded-full file:border-0 file:bg-[var(--color-paper)] file:px-3 file:py-2 file:font-semibold" /></label>
    {aiEnabled ? <><label className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-[var(--color-muted)]"><input type="checkbox" checked={consent} disabled={busy || disabled} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[var(--color-orange)]" /><span>I agree to send this {kind} to Google Gemini for extraction. Railor saves reviewed fields only, and does not retain the uploaded file.</span></label><button type="button" onClick={extract} disabled={!file || !consent || busy || disabled} className={`${secondaryClass} mt-3`}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}{busy ? "Reading document…" : "Extract details"}</button></> : <p className="mt-3 text-[12px] text-[var(--color-muted)]">AI extraction needs a configured Gemini key. Manual entry below works now.</p>}
    {message && <p role="status" className="mt-3 text-[12px] leading-relaxed">{message}</p>}
  </div>;
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
  const invoice = invoices.find((i) => i.id === selected) ?? null;
  const retry = useRef<string | null>(null);
  const working = busy || extracting;
  const locked = working || !canWrite;
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
  return <div className="product-page space-y-6">
    <ProductHeader eyebrow="Freelancer / Get paid" title="Get paid" description="Upload an invoice, review receiving options, and reconcile what reaches your bank." value={invoices.length} valueLabel="invoices · this workspace" action={<button disabled={working} className={secondaryClass} onClick={() => { setSelected(null); setRouting(null); setProvider(""); setError(""); setDraft(fresh()); }}><Plus size={14} /> New invoice</button>} />
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-[var(--color-muted)]" aria-label="Invoice workflow">{["Upload & review", "Compare receiving routes", "Record & reconcile"].map((step, i) => <span key={step} className="flex items-center gap-2"><span className="flex size-5 items-center justify-center rounded-full bg-[var(--color-surface)] text-[11px] font-bold">{i + 1}</span>{step}{i < 2 && <ArrowRight size={12} className="ml-2" />}</span>)}</div>
    {!canWrite && <p role="status" className="text-[13px]">You have view-only access. A workspace member can upload invoices and record receipts.</p>}
    {error && <div role="alert" className="rounded-xl border border-[var(--color-bad)]/30 bg-[var(--color-bad-bg)] p-4 text-[13px]">{error}</div>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
      <section className={panelClass} aria-label={invoice ? "Selected invoice" : "Review invoice"}>
        {invoice ? <><div className="mb-4 flex items-center gap-2"><FileText size={18} /><h2 className="text-[17px] font-bold">{invoice.invoiceNumber}</h2></div><p className="text-[13px] text-[var(--color-muted)]">{invoice.clientName} · {invoice.clientCountry} → {invoice.accountCountry}</p><div className="my-5"><span className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">Still to collect</span><p className="mt-1 text-[32px] font-bold tracking-tight">{Number(invoice.outstanding).toLocaleString(undefined, { maximumFractionDigits: 3 })} <span className="text-[17px]">{invoice.currency}</span></p><p className="mt-2 text-[12px] text-[var(--color-muted)]">{statusLabel(invoice.status)}{invoice.dueDate ? ` · Due ${invoice.dueDate}` : ""}</p></div><dl className="space-y-2 border-t border-[var(--color-line)] pt-4 text-[12px]"><div className="flex justify-between"><dt>Invoice total</dt><dd>{displayMoney(invoice.amount, invoice.currency)}</dd></div><div className="flex justify-between"><dt>Allocated receipts</dt><dd>{invoice.covered} {invoice.currency}</dd></div><div className="flex justify-between"><dt>Bank settlement</dt><dd>{invoice.settlementCurrency}</dd></div></dl><div className="mt-5 flex flex-wrap gap-2"><button onClick={reroute} disabled={locked || invoice.status === "recorded_paid"} className={buttonClass}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Compare routes</button><a className={secondaryClass} href={`/api/freelancer?id=${invoice.id}&format=csv`}><Download size={13} /> Export CSV</a></div><p className="mt-4 text-[11px] leading-relaxed text-[var(--color-muted)]">Invoice details are saved after your review. Payment status reflects receipts you record; live provider tracking requires an authorized receiving integration.</p></> : <form onSubmit={save}>
          <h2 className="mb-4 text-[17px] font-bold">Start with your invoice</h2>
          <DocumentUpload kind="invoice" aiEnabled={aiEnabled} disabled={locked} sharedDemo={sharedDemo} onBusyChange={setExtracting} onProposal={(value) => { setDraft((d) => ({ ...d, invoiceNumber: String(value.invoiceNumber ?? ""), clientName: String(value.clientName ?? ""), clientCountry: String(value.clientCountry ?? ""), currency: String(value.currency ?? ""), amount: String(value.amount ?? ""), dueDate: typeof value.dueDate === "string" ? value.dueDate : null })); }} />
          <fieldset disabled={locked} className="grid gap-3 sm:grid-cols-2"><Field label="Invoice number"><input required maxLength={100} className={inputClass} value={draft.invoiceNumber} onChange={(e) => field("invoiceNumber", e.target.value)} placeholder="INV-2026-001" /></Field><Field label="Client name"><input required maxLength={160} className={inputClass} value={draft.clientName} onChange={(e) => field("clientName", e.target.value)} placeholder="Your overseas client" /></Field><Field label="Invoice total"><input required inputMode="decimal" className={inputClass} value={draft.amount} onChange={(e) => field("amount", e.target.value)} placeholder="2000.00" /></Field><Select label="Invoice currency" options={currencies} value={draft.currency} onChange={(v) => field("currency", v)} /><Select label="Client country" options={countries} value={draft.clientCountry} onChange={(v) => field("clientCountry", v)} /><Field label="Due date (optional)"><input name="dueDate" type="date" className={inputClass} value={draft.dueDate ?? ""} onInput={(e) => field("dueDate", e.currentTarget.value || null)} onChange={(e) => field("dueDate", e.target.value || null)} /></Field></fieldset>
          <details className="mt-4 border-t border-[var(--color-line)] pt-3"><summary className="cursor-pointer text-[12px] font-semibold">Receiving setup · {draft.accountCountry} · {draft.settlementCurrency} · {draft.profile === "freelancer" ? "Freelancer" : "Sole proprietor"}</summary><fieldset disabled={locked} className="mt-3 grid gap-3 sm:grid-cols-2"><Select label="Your account country" options={countries} value={draft.accountCountry} onChange={(v) => field("accountCountry", v)} /><Select label="Bank currency" options={currencies} value={draft.settlementCurrency} onChange={(v) => field("settlementCurrency", v)} /><Select label="Account holder" options={[{ value: "freelancer", label: "Freelancer (personal name)" }, { value: "sole_proprietor", label: "Registered sole proprietor" }]} value={draft.profile} onChange={(v) => field("profile", v as InvoiceDraft["profile"])} /><Select label="Invoice purpose" options={[{ value: "services", label: "Services / client work" }, { value: "goods", label: "Goods export" }]} value={draft.purpose} onChange={(v) => field("purpose", v as InvoiceDraft["purpose"])} /></fieldset></details>
          <p className="my-4 text-[11px] leading-relaxed text-[var(--color-muted)]">Check the amount, currency and client details. Provider eligibility, fees and documentation depend on your receiving setup.</p><button disabled={locked} className={`${buttonClass} w-full`}>{busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}{busy ? "Saving & checking routes…" : "Save & find receiving routes"}</button>
        </form>}
      </section>
      <div className="space-y-5">
        <section className={panelClass} aria-label="Receiving routes"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-[17px] font-bold">Smart receiving routes</h2><span className="text-[11px] text-[var(--color-muted)]">Eligibility + fees + evidence</span></div>
          {!routing ? <div className="py-10 text-center"><div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-[var(--color-surface)]"><Sparkles size={22} /></div><h3 className="text-[15px] font-semibold">{busy ? "Checking your receiving options…" : invoice?.status === "recorded_paid" ? "This invoice is recorded as paid" : "A route shaped around your invoice"}</h3><p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[var(--color-muted)]">{invoice ? "Compare routes for the outstanding balance. Bank credit and invoice-currency allocation are tracked separately." : "We check your profile, payer country, currencies and payment purpose before comparing prices."}</p></div> : <>
            <div className="mb-4 rounded-xl bg-[var(--color-surface)] p-4 text-[13px] leading-relaxed"><strong>{routing.recommendedSlug ? "Best documented priced option" : "Receiving options need provider confirmation"}</strong><p className="mt-1 text-[var(--color-muted)]">{routing.recommendedSlug ? "The recommended option has documented profile eligibility, route evidence and a complete price estimate. Finish any listed onboarding checks." : "There is no fully priced, verified route for this invoice yet. Published prices below are planning estimates; confirm the payer country and account approval before requesting payment."}</p></div>
            {routing.candidates.map((row) => <article key={row.providerSlug} className={`mb-3 rounded-xl border p-4 ${row.providerSlug === routing.recommendedSlug ? "border-[var(--color-orange)]" : "border-[var(--color-line)]"}`}><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><ProviderLogo slug={row.providerSlug} name={row.providerName} size={28} /><div><h3 className="text-[14px] font-bold">{row.providerName}</h3><p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{row.providerSlug === routing.recommendedSlug ? "Recommended estimate" : row.providerSlug === routing.lowestEstimateSlug ? "Lowest published estimate · verify route" : row.partial ? "Incomplete price" : row.basis.replaceAll("_", " ")}</p></div></div><div className="text-right"><strong className="text-[17px] tabular-nums">{row.recipientAmount === null ? "Unpriced" : `${row.recipientAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${routing.settlementCurrency}`}</strong><p className="text-[11px] text-[var(--color-muted)]">{row.partial ? "Not a complete receiving quote" : "Estimated bank receipt"}</p></div></div><p className="mt-3 text-[12px] text-[var(--color-muted)]">{row.profileAssessment?.fees ?? row.notes.join(" ")}</p><details className="mt-3 text-[12px]"><summary className="cursor-pointer font-semibold">Eligibility, documents & source</summary><div className="mt-2 space-y-2 text-[var(--color-muted)]"><p>{row.profileAssessment?.reasons.join(" ")}</p><p>{row.route ? `Route: ${row.route.eligibility.replaceAll("_", " ")}. ${row.route.reasons.join(" ")}` : "Payer-country route evidence is not confirmed."}</p><p>{row.profileAssessment?.verification.join(" ")}</p><p>{row.profileAssessment?.documents.join(" ")}</p><p>{row.profileAssessment?.limits}</p>{row.route?.outstandingRequirements.length ? <p>Outstanding: {row.route.outstandingRequirements.join(", ")}</p> : null}<p>{priceSourceTime(row.observedAt, row.basis)}</p>{row.source.url && <a href={row.source.url} target="_blank" rel="noreferrer" className="underline">{row.source.label}</a>}{row.profileAssessment?.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="ml-2 underline">{s.label}</a>)}</div></details><div className="mt-3 flex flex-wrap gap-2"><Link prefetch={false} className={secondaryClass} href={providerConnectionPath(row.providerSlug)}>Connection options <ArrowRight size={12} /></Link>{row.profileAssessment?.status === "documented" && row.route?.eligibility !== "unavailable" && <button disabled={locked} className={secondaryClass} onClick={() => setProvider(row.providerName)}>{provider === row.providerName ? <Check size={12} /> : null}Use for request</button>}</div></article>)}
            {!routing.candidates.length && <p className="text-[13px] text-[var(--color-muted)]">No comparable receiving prices are available for this setup.</p>}
            <details className="mt-4 text-[12px]"><summary className="cursor-pointer font-semibold">Other providers checked by routing</summary><div className="mt-3 space-y-3">{routing.routeOptions.map((row) => <div key={row.providerSlug} className="border-t border-[var(--color-line)] pt-3"><div className="flex items-center justify-between gap-2"><strong>{row.providerName}</strong><Link prefetch={false} href={providerConnectionPath(row.providerSlug)} className="underline">Connection options</Link></div><p className="mt-1 text-[var(--color-muted)]">{row.eligibility.replaceAll("_", " ")} · {row.settlement ?? "Settlement time unconfirmed"} · {row.reasons.join(" ")}</p>{row.outstandingRequirements.length > 0 && <p className="mt-1">Required: {row.outstandingRequirements.join(", ")}</p>}</div>)}{!routing.routeOptions.length && <p>No confirmed collection routes. Ask the provider to verify this setup.</p>}</div></details><p className="mt-4 text-[11px] text-[var(--color-muted)]">Pricing checked for {routing.amount} {routing.currency}. These estimates are not locked quotes or a guarantee of bank credit.</p>
          </>}
        </section>
        {invoice && invoice.status !== "recorded_paid" && <section className={panelClass}><div className="flex items-center justify-between gap-3"><h2 className="text-[17px] font-bold">Payment request</h2><button type="button" className={secondaryClass} onClick={copy}><Copy size={13} />{copied ? "Copied" : "Copy request"}</button></div><p className="my-3 text-[12px] text-[var(--color-muted)]">Confirm your provider account first, then share its verified receiving details with your client.</p><pre className="whitespace-pre-wrap rounded-xl bg-[var(--color-surface)] p-4 font-sans text-[12px] leading-relaxed">{requestText}</pre></section>}
        {invoice && <section className={panelClass} aria-label="Reconciliation"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-[17px] font-bold">Receipts & reconciliation</h2>{invoice.status !== "recorded_paid" && !showReceipt && <button disabled={locked} type="button" className={secondaryClass} onClick={startReceipt}><Plus size={13} /> Record receipt</button>}</div><p className="mt-2 text-[12px] leading-relaxed text-[var(--color-muted)]">Match the amount covered in {invoice.currency} to this invoice. Record the net {invoice.settlementCurrency} bank credit separately, so conversion and fees do not create a false underpayment.</p>
          {showReceipt && <form onSubmit={record} className="mt-5"><DocumentUpload kind="receipt" aiEnabled={aiEnabled} disabled={locked} sharedDemo={sharedDemo} onBusyChange={setExtracting} onProposal={(value) => { retry.current = null; setReceipt((r) => ({ ...r, ...Object.fromEntries(["reference", "providerName", "sourceAmount", "sourceCurrency", "settlementAmount", "settlementCurrency", "receivedDate"].map((key) => [key, typeof value[key] === "string" ? value[key] : ""])), confirmed: undefined })); }} /><fieldset disabled={locked} className="grid gap-3 sm:grid-cols-2">{[["reference", "Receipt / bank reference"], ["providerName", "Receiving provider"], ["sourceAmount", `Amount of invoice covered (${invoice.currency})`], ["settlementAmount", `Net bank credit (${invoice.settlementCurrency})`]] .map(([key, label]) => <Field key={key} label={label!}><input required maxLength={key === "reference" ? 120 : key === "providerName" ? 100 : 24} className={inputClass} inputMode={key!.includes("Amount") ? "decimal" : "text"} value={String(receipt[key as keyof ReceiptDraft] ?? "")} onChange={(e) => receiptField(key as keyof ReceiptDraft, e.target.value)} /></Field>)}<Select label="Allocation currency" options={currencies} value={receipt.sourceCurrency ?? ""} onChange={(v) => receiptField("sourceCurrency", v)} /><Select label="Bank credit currency" options={currencies} value={receipt.settlementCurrency ?? ""} onChange={(v) => receiptField("settlementCurrency", v)} /><Field label="Received date"><input name="receivedDate" required type="date" className={inputClass} value={receipt.receivedDate ?? ""} onInput={(e) => receiptField("receivedDate", e.currentTarget.value)} onChange={(e) => receiptField("receivedDate", e.target.value)} /></Field></fieldset><label className="my-4 flex items-start gap-2 text-[12px] leading-relaxed"><input required disabled={locked} type="checkbox" checked={receipt.confirmed === true} onChange={(e) => receiptField("confirmed", e.target.checked)} className="mt-1 accent-[var(--color-orange)]" /><span>I have checked my provider or bank statement and confirm this receipt belongs to this invoice. This is a manual record.</span></label><div className="flex gap-2"><button disabled={locked || !receipt.confirmed} className={buttonClass}>Save & reconcile</button><button disabled={working} className={secondaryClass} type="button" onClick={() => setShowReceipt(false)}>Cancel</button></div></form>}
          <div className="mt-4 space-y-2">{receipts.map((r) => <div className="flex flex-wrap justify-between gap-2 rounded-xl bg-[var(--color-surface)] p-3 text-[12px]" key={r.id}><div><strong>{r.reference}</strong><p className="mt-1 text-[var(--color-muted)]">{r.providerName} · {r.receivedDate} · manual record</p></div><div className="text-right"><p>{displayMoney(r.sourceAmount, r.sourceCurrency)} allocated</p><p className="mt-1 text-[var(--color-muted)]">{displayMoney(r.settlementAmount, r.settlementCurrency)} bank credit</p></div></div>)}{!receipts.length && !showReceipt && <p className="py-3 text-[12px] text-[var(--color-muted)]">No receipts recorded yet.</p>}</div>
        </section>}
      </div>
    </div>
    <section className={panelClass} aria-label="Saved invoices"><div className="mb-4 flex items-center justify-between"><h2 className="text-[17px] font-bold">Your invoices</h2><span className="text-[11px] text-[var(--color-muted)]">Latest 100 · workspace private</span></div>{!invoices.length ? <p className="py-6 text-center text-[13px] text-[var(--color-muted)]">Your reviewed invoices will appear here. Start with an upload or enter one manually.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-[12px]"><thead className="border-b border-[var(--color-line)] text-[var(--color-muted)]"><tr>{["Invoice / client", "Total", "Outstanding", "Due", "Status", ""].map((title) => <th key={title} className="px-2 py-3 font-medium">{title}</th>)}</tr></thead><tbody>{invoices.map((row) => <tr key={row.id} className="border-b border-[var(--color-line)] last:border-0"><td className="px-2 py-4"><strong>{row.invoiceNumber}</strong><p className="mt-1 text-[var(--color-muted)]">{row.clientName}</p></td><td className="px-2 py-4 tabular-nums">{displayMoney(row.amount, row.currency)}</td><td className="px-2 py-4 tabular-nums">{displayMoney(row.outstanding, row.currency)}</td><td className="px-2 py-4">{row.dueDate ?? "—"}</td><td className="px-2 py-4">{statusLabel(row.status)}</td><td className="px-2 py-4"><button disabled={working} className={secondaryClass} onClick={() => { setSelected(row.id); setRouting(null); setProvider(""); setError(""); }}>Open <ArrowRight size={12} /></button></td></tr>)}</tbody></table></div>}</section>
  </div>;
}
