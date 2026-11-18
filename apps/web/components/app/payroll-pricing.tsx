"use client";

import { useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Download, FileSpreadsheet, Loader2, Lock, RotateCcw, Sparkles, UploadCloud, Users } from "lucide-react";
import { detectPayrollColumns, EXAMPLE_PAYROLL_CSV, PAYROLL_MAX_ROWS, readPayroll, type PayrollColumns, type PayrollQuote, type PayrollRow } from "../../lib/payroll";
import { parseCsv, readTable, type Table } from "../../lib/spreadsheet";
import { toast } from "../toast";
import styles from "./company-tools.module.css";

const PAY_FROM = ["USD", "EUR", "GBP", "SGD", "AED", "AUD", "CAD", "INR"];
// Outbound INR is priced per account (LRS), so a public comparison can't start there.
const PUBLICLY_PRICED = new Set(["USD", "EUR", "GBP", "SGD", "AED", "AUD", "CAD"]);

function amount(value: number, currency: string, digits = 2) {
  return `${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits })} ${currency}`;
}

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, "\"\"")}"` : safe;
};

/**
 * Upload a payroll sheet; each payout is priced on Railor's comparison. Names
 * stay in this browser — only amounts, currencies and countries are sent.
 */
export function PayrollPricing({ defaultCurrency }: { defaultCurrency: string }) {
  const reduce = useReducedMotion();
  const input = useRef<HTMLInputElement>(null);
  const [sourceCurrency, setSourceCurrency] = useState(PUBLICLY_PRICED.has(defaultCurrency) ? defaultCurrency : "USD");
  const [sheet, setSheet] = useState<{ name: string; table: Table; columns: PayrollColumns; example: boolean } | null>(null);
  const [quotes, setQuotes] = useState<Map<string, PayrollQuote> | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const parsed = useMemo(() => (sheet ? readPayroll(sheet.table, sheet.columns, null) : null), [sheet]);
  const rows = parsed?.rows.slice(0, PAYROLL_MAX_ROWS) ?? [];
  const extra = Math.max(0, (parsed?.rows.length ?? 0) - PAYROLL_MAX_ROWS);

  const totals = useMemo(() => {
    if (!quotes) return null;
    let sent = 0, cost = 0, spread = 0, priced = 0;
    const estimates = rows.filter((row) => quotes.get(row.id)?.status === "estimate").length;
    for (const row of rows) {
      const quote = quotes.get(row.id);
      if (quote?.status !== "priced" || !quote.best || !quote.reference?.rate) continue;
      priced += 1; sent += row.amount;
      if (quote.best.costMinor !== null) cost += quote.best.costMinor / 100 / quote.reference.rate;
      if (quote.spreadInSource) spread += quote.spreadInSource;
    }
    return { priced, estimates, sent, cost, spread, bps: sent ? Math.round((cost / sent) * 10_000) : null };
  }, [quotes, rows]);

  async function choose(file: File | null | undefined) {
    if (!file) return;
    try {
      const table = await readTable(file);
      if (table.length < 2) throw new Error("This sheet has no rows under the header.");
      setSheet({ name: file.name, table, columns: detectPayrollColumns(table[0]!), example: false });
      setQuotes(null);
    } catch (error) {
      toast.error(`Couldn’t read ${file.name}`, (error as Error).message);
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  async function priceAll() {
    if (!rows.length) return;
    setBusy(true);
    try {
      const response = await fetch("/api/payroll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceCurrency, payouts: rows.map((row) => ({ id: row.id, amount: row.amount, currency: row.currency, country: row.country })) }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Payroll pricing failed. Try again.");
      setQuotes(new Map((body.quotes as PayrollQuote[]).map((quote) => [quote.id, quote])));
    } catch (error) {
      toast.error("Couldn’t price this payroll", (error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const header = ["Employee", "Country", "Payout currency", `Sent (${sourceCurrency})`, "Best option", "Product", "Arrives", "Cost vs mid-market", "Cost (bps)", "Gap to priciest option", "Data status", "Note"];
    const body = rows.map((row) => {
      const quote = quotes?.get(row.id);
      const best = quote?.best;
      return [row.name, row.country ?? "", row.currency, row.amount, best?.provider ?? "", best?.product ?? "", best ? best.recipientAmount : "", best?.costMinor != null ? (best.costMinor / 100).toFixed(2) : "", best?.bps ?? "", quote?.spread ?? "", best?.dataStatus ?? "", quote?.reason ?? ""];
    });
    const url = URL.createObjectURL(new Blob([[header, ...body].map((r) => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "railor-payroll-pricing.csv"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Payroll pricing exported", "railor-payroll-pricing.csv");
  }

  return (
    <div className={styles.tool}>
      <div className={styles.payrollBar}>
        <label className={styles.payFrom}>
          <span>You pay from</span>
          <select value={sourceCurrency} onChange={(event) => { setSourceCurrency(event.target.value); setQuotes(null); }}>{PAY_FROM.map((code) => <option key={code} value={code}>{code}</option>)}</select>
        </label>
        <p className={styles.privacy}><Lock size={13} aria-hidden />Names stay in this browser. Only amounts and currencies are priced.</p>
        <span className={styles.grow} />
        {sheet ? <button type="button" className={`${styles.ghost} press`} onClick={() => { setSheet(null); setQuotes(null); }}><RotateCcw size={14} aria-hidden />Start over</button> : null}
        <button type="button" className={`${styles.ghost} press`} onClick={() => { const table = parseCsv(EXAMPLE_PAYROLL_CSV); setSheet({ name: "example-payroll.csv", table, columns: detectPayrollColumns(table[0]!), example: true }); setQuotes(null); }}><Sparkles size={14} aria-hidden />Use example sheet</button>
      </div>

      <input ref={input} type="file" className="sr-only" accept=".csv,.xlsx,text/csv" aria-label="Choose a payroll sheet" onChange={(event) => void choose(event.target.files?.[0])} />
      {!sheet ? (
        <button type="button" className={`${styles.bigDrop} press`} data-dragging={dragging || undefined} onClick={() => input.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void choose(event.dataTransfer.files[0]); }}>
          <span className={styles.slotIcon}><UploadCloud size={20} aria-hidden /></span>
          <strong>Drop your payroll sheet, or browse</strong>
          <small>CSV or Excel (.xlsx). One row per person: amount to send, the currency they’re paid in, and their country if you have it.</small>
        </button>
      ) : (
        <section className={styles.results} aria-label="Payroll">
          {sheet.example ? <p className={styles.example}>Example sheet — fictional people, for trying payroll pricing.</p> : null}
          <div className={styles.fileRow}><FileSpreadsheet size={16} aria-hidden /><strong>{sheet.name}</strong><small>{rows.length} payouts{extra ? ` (first ${PAYROLL_MAX_ROWS}; ${extra} more not priced)` : ""}</small><button type="button" onClick={() => input.current?.click()}>Replace</button></div>
          {sheet.columns.amount === null || sheet.columns.currency === null ? <p className={styles.warn}>Railor couldn’t find {sheet.columns.amount === null ? "an amount" : "a currency"} column. Name the columns “Amount to send” and “Currency”.</p> : null}
          {totals && !totals.priced && totals.estimates ? <p className={styles.warn}>{totals.estimates} {totals.estimates === 1 ? "payout has" : "payouts have"} an estimate only: a cost or your company’s eligibility isn’t confirmed for these routes yet, so nothing is ranked as best. Connect your provider account for exact prices.</p> : null}
          {totals && !totals.priced && !totals.estimates ? <p className={styles.warn}>None of these payouts could be priced from {sourceCurrency}. {sourceCurrency === "INR" ? "Outbound INR prices depend on your own account; try paying from USD or EUR." : "Check the currencies, or try again shortly."}</p> : null}
          {totals?.priced ? (
            <div className={styles.tiles}>
              <div className={styles.tile} data-tone="good"><span>Priced</span><strong>{totals.priced}<small> of {rows.length} payouts{totals.estimates ? ` · ${totals.estimates} estimates` : ""}</small></strong></div>
              <div className={styles.tile}><span>Best options cost</span><strong>≈ {amount(Math.round(totals.cost), sourceCurrency, 0)}<small>{totals.bps !== null ? ` · ${totals.bps} bps` : ""}</small></strong></div>
              <div className={styles.tile} data-tone={totals.spread > 0 ? "bad" : undefined}><span>Priciest options would lose</span><strong>≈ {amount(Math.round(totals.spread), sourceCurrency, 0)}<small> more</small></strong></div>
            </div>
          ) : null}
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Employee</th><th className={styles.num}>Sends</th><th>Best option</th><th className={styles.num}>Arrives</th><th className={styles.num}>Cost vs mid-market</th><th className={styles.num}>Gap to priciest</th></tr></thead>
              <tbody>
                {rows.map((row: PayrollRow, index) => {
                  const quote = quotes?.get(row.id);
                  return (
                    <motion.tr key={row.id} initial={reduce || !quotes ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: Math.min(index, 12) * 0.03 }}>
                      <td><strong className={styles.person}>{row.name}</strong><small className={styles.sub}>{row.country ?? "Country not given"} · paid in {row.currency}</small></td>
                      <td className={styles.num}>{amount(row.amount, sourceCurrency)}</td>
                      <td>{quote?.best ? <><strong className={styles.person}>{quote.best.provider}{quote.status === "estimate" ? <span className={styles.estimate}>Estimate</span> : null}</strong><small className={styles.sub}>{quote.status === "estimate" ? quote.reason : `${quote.best.product ?? quote.best.dataStatus} · ${quote.options} compared`}</small></> : quote ? <small className={styles.sub}>{quote.reason}</small> : <small className={styles.sub}>{busy ? "Pricing…" : "Not priced yet"}</small>}</td>
                      <td className={styles.num}>{quote?.best ? `${quote.status === "estimate" ? "≈ " : ""}${amount(quote.best.recipientAmount, row.currency)}` : "—"}</td>
                      <td className={styles.num}>{quote?.best?.costMinor != null ? <>{amount(quote.best.costMinor / 100, row.currency)}<small>{quote.best.bps} bps</small></> : "—"}</td>
                      <td className={styles.num} data-short={quote?.spread ? true : undefined}>{quote?.spread ? amount(quote.spread, row.currency) : "—"}</td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {parsed?.skipped.length ? <p className={styles.muted}>Skipped {parsed.skipped.length} {parsed.skipped.length === 1 ? "row" : "rows"}: {parsed.skipped.slice(0, 3).map((item) => `line ${item.line} (${item.reason})`).join(", ")}{parsed.skipped.length > 3 ? "…" : ""}</p> : null}
          <div className={styles.actions}>
            <p className={styles.muted}>Costs are measured against the mid-market rate and converted back to {sourceCurrency} at that rate, so totals are approximate. Confirm each price with the provider before paying.</p>
            <span className={styles.grow} />
            {quotes ? <button type="button" className={`${styles.ghost} press`} onClick={exportCsv}><Download size={14} aria-hidden />Export CSV</button> : null}
            <button type="button" className={`${styles.primary} press`} disabled={busy || !rows.length} onClick={priceAll}>{busy ? <Loader2 size={15} className={styles.spin} aria-hidden /> : <Users size={15} aria-hidden />}{busy ? `Pricing ${rows.length} payouts…` : quotes ? "Price again" : `Price ${rows.length} payouts`}</button>
          </div>
        </section>
      )}
    </div>
  );
}
