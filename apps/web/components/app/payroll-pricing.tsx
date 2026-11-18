"use client";

import { useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Download, FileSpreadsheet, FileText, Loader2, Lock, RotateCcw, Sparkles, UploadCloud, Users } from "lucide-react";
import { amountColumn, detectPayrollColumns, EXAMPLE_PAYROLL_CSV, PAYROLL_MAX_ROWS, readPayroll, sideForColumns, type AmountSide, type PayrollColumns, type PayrollQuote, type PayrollRow } from "../../lib/payroll";
import { parseCsv, readTable, type Table } from "../../lib/spreadsheet";
import { toast } from "../toast";
import { PayslipImport, type PayslipFigures } from "./payslip-import";
import styles from "./company-tools.module.css";

const PAY_FROM = ["USD", "EUR", "GBP", "SGD", "AED", "AUD", "CAD", "INR"];
// Outbound INR is priced per account (LRS), so a public comparison can't start there.
const PUBLICLY_PRICED = new Set(["USD", "EUR", "GBP", "SGD", "AED", "AUD", "CAD"]);
const PAYSLIP_HEADER = ["Employee", "Country", "Currency", "Net pay"];

// Whole amounts stay whole ("1,700 USD"); anything with cents shows both digits ("2,883.90 USD").
function amount(value: number, currency: string, digits = 2) {
  const cents = Math.round(value * 100) % 100 !== 0;
  return `${value.toLocaleString("en-US", { minimumFractionDigits: cents ? digits : 0, maximumFractionDigits: digits })} ${currency}`;
}

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, "\"\"")}"` : safe;
};

type Sheet = { name: string; table: Table; columns: PayrollColumns; source: "file" | "example" | "payslips" };

/**
 * Upload a payroll sheet (or payslips); each payout is priced on Railor's
 * comparison. Names stay in this browser — only amounts, currencies and
 * countries are sent. Amounts are either what the company sends or each
 * person's net pay; for net pay, the send amount is a mid-market estimate.
 */
export function PayrollPricing({ defaultCurrency, payslips }: { defaultCurrency: string; payslips: { aiEnabled: boolean; sharedDemo: boolean; canUpload: boolean } }) {
  const reduce = useReducedMotion();
  const input = useRef<HTMLInputElement>(null);
  const [sourceCurrency, setSourceCurrency] = useState(PUBLICLY_PRICED.has(defaultCurrency) ? defaultCurrency : "USD");
  const [side, setSide] = useState<AmountSide>("send");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [priced, setPriced] = useState<{ side: AmountSide; currency: string; quotes: Map<string, PayrollQuote> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);

  // A price is only shown for the reading and currency it was made for.
  const quotes = priced && priced.side === side && priced.currency === sourceCurrency ? priced.quotes : null;
  const parsed = useMemo(() => (sheet ? readPayroll(sheet.table, sheet.columns, side, null) : null), [sheet, side]);
  const rows = useMemo(() => parsed?.rows.slice(0, PAYROLL_MAX_ROWS) ?? [], [parsed]);
  const extra = Math.max(0, (parsed?.rows.length ?? 0) - PAYROLL_MAX_ROWS);
  const receive = side === "receive";

  const totals = useMemo(() => {
    if (!quotes) return null;
    let sent = 0, cost = 0, spread = 0, complete = 0, land = 0, landSent = 0, landed = 0, landEstimate = false;
    const estimates = rows.filter((row) => quotes.get(row.id)?.status === "estimate").length;
    for (const row of rows) {
      const quote = quotes.get(row.id);
      if (quote?.netPay?.land) {
        landed += 1; land += quote.netPay.land.amount; landSent += quote.netPay.sent;
        if (quote.netPay.land.basis === "estimate" || quote.status === "estimate") landEstimate = true;
      }
      if (quote?.status !== "priced" || !quote.best || !quote.reference?.rate) continue;
      complete += 1; sent += quote.netPay?.sent ?? row.amount;
      if (quote.best.costMinor !== null) cost += quote.best.costMinor / 100 / quote.reference.rate;
      if (quote.spreadInSource) spread += quote.spreadInSource;
    }
    return {
      priced: complete, estimates, sent, cost, spread, bps: sent ? Math.round((cost / sent) * 10_000) : null,
      landed, land, landEstimate, aboveMid: land - landSent, aboveBps: landSent ? Math.round(((land - landSent) / landSent) * 10_000) : null,
    };
  }, [quotes, rows]);

  function load(next: Sheet) {
    setSheet(next);
    setSide((current) => sideForColumns(next.columns, current));
    setPriced(null);
  }

  async function choose(file: File | null | undefined) {
    if (!file) return;
    try {
      const table = await readTable(file);
      if (table.length < 2) throw new Error("This sheet has no rows under the header.");
      load({ name: file.name, table, columns: detectPayrollColumns(table[0]!), source: "file" });
      setImporting(false);
    } catch (error) {
      toast.error(`Couldn’t read ${file.name}`, (error as Error).message);
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  function addPayslips(figures: PayslipFigures[]) {
    const base = sheet?.source === "payslips" ? sheet.table : [PAYSLIP_HEADER];
    const table = [...base, ...figures.map((figure) => [figure.label, figure.country ?? "", figure.currency ?? "", figure.netPay ?? ""])];
    load({ name: "Imported payslips", table, columns: detectPayrollColumns(PAYSLIP_HEADER), source: "payslips" });
    setImporting(false);
  }

  async function priceAll() {
    if (!rows.length) return;
    const request = { side, currency: sourceCurrency };
    setBusy(true);
    try {
      const response = await fetch("/api/payroll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceCurrency, amountSide: side, payouts: rows.map((row) => ({ id: row.id, amount: row.amount, currency: row.currency, country: row.country })) }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Payroll pricing failed. Try again.");
      setPriced({ ...request, quotes: new Map((body.quotes as PayrollQuote[]).map((quote) => [quote.id, quote])) });
    } catch (error) {
      toast.error("Couldn’t price this payroll", (error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const header = receive
      ? ["Employee", "Country", "Payout currency", "Net pay", `Send estimate (${sourceCurrency}, mid-market)`, "Mid-market rate", "Best option", "Product", "Arrives", "Short (-) / over (+)", "Shortfall (bps)", `Send to land net pay (${sourceCurrency})`, "Send-to-land basis", "Data status", "Note"]
      : ["Employee", "Country", "Payout currency", `Sent (${sourceCurrency})`, "Best option", "Product", "Arrives", "Cost vs mid-market", "Cost (bps)", "Gap to priciest option", "Data status", "Note"];
    const body = rows.map((row) => {
      const quote = quotes?.get(row.id);
      const best = quote?.best;
      const net = quote?.netPay;
      return receive
        ? [row.name, row.country ?? "", row.currency, row.amount, net?.sent ?? "", net?.midRate ?? "", best?.provider ?? "", best?.product ?? "", best ? best.recipientAmount : "", net?.gap?.amount ?? "", net?.gap?.bps ?? "", net?.land?.amount ?? "", net?.land ? (net.land.basis === "provider_quote" ? `${net.land.provider} quote for the exact amount` : `Estimate from ${net.land.provider}'s price`) : "", best?.dataStatus ?? "", quote?.reason ?? ""]
        : [row.name, row.country ?? "", row.currency, row.amount, best?.provider ?? "", best?.product ?? "", best ? best.recipientAmount : "", best?.costMinor != null ? (best.costMinor / 100).toFixed(2) : "", best?.bps ?? "", quote?.spread ?? "", best?.dataStatus ?? "", quote?.reason ?? ""];
    });
    const url = URL.createObjectURL(new Blob([[header, ...body].map((r) => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "railor-payroll-pricing.csv"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Payroll pricing exported", "railor-payroll-pricing.csv");
  }

  const where = (line: number) => (sheet?.source === "payslips" ? sheet.table[line - 1]?.[0] ?? `line ${line}` : `line ${line}`);
  const missing = sheet ? (amountColumn(sheet.columns, side) === null ? "an amount" : sheet.columns.currency === null ? "a currency" : null) : null;

  return (
    <div className={styles.tool}>
      <div className={styles.payrollBar}>
        <label className={styles.payFrom}>
          <span>You pay from</span>
          <select value={sourceCurrency} onChange={(event) => setSourceCurrency(event.target.value)}>{PAY_FROM.map((code) => <option key={code} value={code}>{code}</option>)}</select>
        </label>
        <p className={styles.privacy}><Lock size={13} aria-hidden />Names stay in this browser. Only amounts and currencies are priced.</p>
        <span className={styles.grow} />
        {sheet ? <button type="button" className={`${styles.ghost} press`} onClick={() => { setSheet(null); setPriced(null); }}><RotateCcw size={14} aria-hidden />Start over</button> : null}
        <button type="button" className={`${styles.ghost} press`} aria-expanded={importing} onClick={() => setImporting((open) => !open)}><FileText size={14} aria-hidden />Import payslips</button>
        <button type="button" className={`${styles.ghost} press`} onClick={() => { const table = parseCsv(EXAMPLE_PAYROLL_CSV); load({ name: "example-payroll.csv", table, columns: detectPayrollColumns(table[0]!), source: "example" }); setImporting(false); }}><Sparkles size={14} aria-hidden />Use example sheet</button>
      </div>

      {importing ? <PayslipImport {...payslips} onImported={addPayslips} onClose={() => setImporting(false)} /> : null}

      <input ref={input} type="file" className="sr-only" accept=".csv,.xlsx,text/csv" aria-label="Choose a payroll sheet" onChange={(event) => void choose(event.target.files?.[0])} />
      {!sheet ? (
        <button type="button" className={`${styles.bigDrop} press`} data-dragging={dragging || undefined} onClick={() => input.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void choose(event.dataTransfer.files[0]); }}>
          <span className={styles.slotIcon}><UploadCloud size={20} aria-hidden /></span>
          <strong>Drop your payroll sheet, or browse</strong>
          <small>CSV or Excel (.xlsx). One row per person: an amount (what you send, or their net pay), the currency they’re paid in, and their country if you have it.</small>
        </button>
      ) : (
        <section className={styles.results} aria-label="Payroll">
          {sheet.source === "example" ? <p className={styles.example}>Example sheet — fictional people, for trying payroll pricing.</p> : null}
          <div className={styles.fileRow}>
            {sheet.source === "payslips" ? <FileText size={16} aria-hidden /> : <FileSpreadsheet size={16} aria-hidden />}
            <strong>{sheet.name}</strong>
            <small>{rows.length} payouts{extra ? ` (first ${PAYROLL_MAX_ROWS}; ${extra} more not priced)` : ""}</small>
            {sheet.source === "payslips" ? <button type="button" onClick={() => setImporting(true)}>Add payslips</button> : <button type="button" onClick={() => input.current?.click()}>Replace</button>}
          </div>

          <div className={styles.sideRow}>
            <span id="payroll-side">Amounts in my sheet are</span>
            <div role="group" aria-labelledby="payroll-side" className={styles.segment}>
              {([["send", `What I send (${sourceCurrency})`], ["receive", "What each person receives (their currency)"]] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={side === value} onClick={() => setSide(value)}>
                  {side === value ? <motion.span layoutId="payroll-side-thumb" className={styles.segmentThumb} transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.32, bounce: 0 }} /> : null}
                  <span className={styles.segmentLabel}>{label}</span>
                </button>
              ))}
            </div>
          </div>
          {receive ? <p className={styles.estimateNote}><strong>Estimated send amounts.</strong> Railor prices by what you send, so each send amount is the net pay at the mid-market rate, priced and then checked against the net pay. Where Wise is best, “send to land it” is Wise’s own quote for the exact amount; otherwise it’s scaled from the best option’s price.</p> : null}

          {missing ? <p className={styles.warn}>Railor couldn’t find {missing} column. Name the columns “{receive ? "Net pay" : "Amount to send"}” and “Currency”.</p> : null}
          {totals && !totals.priced && totals.estimates ? <p className={styles.warn}>{totals.estimates} {totals.estimates === 1 ? "payout has" : "payouts have"} an estimate only: a cost or your company’s eligibility isn’t confirmed for these routes yet, so nothing is ranked as best. Connect your provider account for exact prices.</p> : null}
          {totals && !totals.priced && !totals.estimates && !totals.landed ? <p className={styles.warn}>None of these payouts could be priced from {sourceCurrency}. {sourceCurrency === "INR" ? "Outbound INR prices depend on your own account; try paying from USD or EUR." : "Check the currencies, or try again shortly."}</p> : null}
          {receive && totals?.landed ? (
            <div className={styles.tiles}>
              <div className={styles.tile} data-tone="good"><span>Net pay covered</span><strong>{totals.landed}<small> of {rows.length} payouts{totals.estimates ? ` · ${totals.estimates} estimates` : ""}</small></strong></div>
              <div className={styles.tile}><span>Send to land every net pay</span><strong>≈ {amount(Math.ceil(totals.land), sourceCurrency, 0)}<small>{totals.landEstimate ? " · estimate" : ""}</small></strong></div>
              <div className={styles.tile} data-tone={totals.aboveMid > 0 ? "bad" : undefined}><span>Above the mid-market amount</span><strong>≈ {amount(Math.round(totals.aboveMid), sourceCurrency, 0)}<small>{totals.aboveBps !== null ? ` · ${totals.aboveBps} bps` : ""}</small></strong></div>
            </div>
          ) : !receive && totals?.priced ? (
            <div className={styles.tiles}>
              <div className={styles.tile} data-tone="good"><span>Priced</span><strong>{totals.priced}<small> of {rows.length} payouts{totals.estimates ? ` · ${totals.estimates} estimates` : ""}</small></strong></div>
              <div className={styles.tile}><span>Best options cost</span><strong>≈ {amount(Math.round(totals.cost), sourceCurrency, 0)}<small>{totals.bps !== null ? ` · ${totals.bps} bps` : ""}</small></strong></div>
              <div className={styles.tile} data-tone={totals.spread > 0 ? "bad" : undefined}><span>Priciest options would lose</span><strong>≈ {amount(Math.round(totals.spread), sourceCurrency, 0)}<small> more</small></strong></div>
            </div>
          ) : null}
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                {receive
                  ? <tr><th>Employee</th><th className={styles.num}>Net pay</th><th className={styles.num}>Sends ≈</th><th>Best option</th><th className={styles.num}>Arrives</th><th className={styles.num}>vs net pay</th></tr>
                  : <tr><th>Employee</th><th className={styles.num}>Sends</th><th>Best option</th><th className={styles.num}>Arrives</th><th className={styles.num}>Cost vs mid-market</th><th className={styles.num}>Gap to priciest</th></tr>}
              </thead>
              <tbody>
                {rows.map((row: PayrollRow, index) => {
                  const quote = quotes?.get(row.id);
                  const net = quote?.netPay;
                  const estimate = quote?.status === "estimate";
                  return (
                    <motion.tr key={row.id} initial={reduce || !quotes ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: Math.min(index, 12) * 0.03 }}>
                      <td><strong className={styles.person}>{row.name}</strong><small className={styles.sub}>{row.country ?? "Country not given"} · paid in {row.currency}</small></td>
                      {receive ? (
                        <>
                          <td className={styles.num}>{amount(row.amount, row.currency)}</td>
                          <td className={styles.num}>{net && quote?.status !== "same_currency" ? <>≈ {amount(net.sent, sourceCurrency)}<small>at mid-market</small></> : quote?.status === "same_currency" ? amount(row.amount, sourceCurrency) : "—"}</td>
                        </>
                      ) : <td className={styles.num}>{amount(row.amount, sourceCurrency)}</td>}
                      <td>{quote?.best ? <><strong className={styles.person}>{quote.best.provider}{estimate ? <span className={styles.estimate}>Estimate</span> : null}</strong><small className={styles.sub}>{estimate ? quote.reason : `${quote.best.product ?? quote.best.dataStatus} · ${quote.options} compared`}</small></> : quote ? <small className={styles.sub}>{quote.reason}</small> : <small className={styles.sub}>{busy ? "Pricing…" : "Not priced yet"}</small>}</td>
                      <td className={styles.num}>{quote?.best ? `${estimate ? "≈ " : ""}${amount(quote.best.recipientAmount, row.currency)}` : "—"}</td>
                      {receive ? (
                        <td className={styles.num} data-short={net?.gap?.kind === "short" || undefined} data-over={net?.gap?.kind === "over" || undefined}>
                          {net?.gap ? <>{net.gap.kind === "exact" ? "Exact" : `${estimate ? "≈ " : ""}${net.gap.kind === "short" ? "−" : "+"}${amount(Math.abs(net.gap.amount), row.currency)}`}<small>{net.gap.kind === "short" ? `short · ${net.gap.bps} bps` : net.gap.kind === "over" ? "over" : "net pay"}</small></> : quote?.best ? <>—<small>fee not included</small></> : "—"}
                          {net?.land ? <small>Send {amount(net.land.amount, sourceCurrency)} to land it · {net.land.basis === "provider_quote" ? `${net.land.provider} quote` : "estimate"}</small> : null}
                        </td>
                      ) : (
                        <>
                          <td className={styles.num}>{quote?.best?.costMinor != null ? <>{amount(quote.best.costMinor / 100, row.currency)}<small>{quote.best.bps} bps</small></> : "—"}</td>
                          <td className={styles.num} data-short={quote?.spread ? true : undefined}>{quote?.spread ? amount(quote.spread, row.currency) : "—"}</td>
                        </>
                      )}
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {parsed?.skipped.length ? <p className={styles.muted}>Skipped {parsed.skipped.length} {parsed.skipped.length === 1 ? "row" : "rows"}: {parsed.skipped.slice(0, 3).map((item) => `${where(item.line)} (${item.reason})`).join(", ")}{parsed.skipped.length > 3 ? "…" : ""}</p> : null}
          <div className={styles.actions}>
            <p className={styles.muted}>{receive
              ? `Send amounts, shortfalls and totals are estimates from the mid-market rate, in ${sourceCurrency}. Confirm each price with the provider before paying.`
              : `Costs are measured against the mid-market rate and converted back to ${sourceCurrency} at that rate, so totals are approximate. Confirm each price with the provider before paying.`}</p>
            <span className={styles.grow} />
            {quotes ? <button type="button" className={`${styles.ghost} press`} onClick={exportCsv}><Download size={14} aria-hidden />Export CSV</button> : null}
            <button type="button" className={`${styles.primary} press`} disabled={busy || !rows.length} onClick={priceAll}>{busy ? <Loader2 size={15} className={styles.spin} aria-hidden /> : <Users size={15} aria-hidden />}{busy ? `Pricing ${rows.length} payouts…` : quotes ? "Price again" : `Price ${rows.length} payouts`}</button>
          </div>
        </section>
      )}
    </div>
  );
}
