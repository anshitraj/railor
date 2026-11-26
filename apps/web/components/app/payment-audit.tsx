"use client";

import { useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Download, FileSpreadsheet, Landmark, Lock, ReceiptText, RotateCcw, Sparkles, UploadCloud } from "lucide-react";
import { auditCsv, auditPayments, detectAuditColumns, EXAMPLE_BANK_CSV, EXAMPLE_PROVIDER_CSV, readAuditRows, STATUS_LABEL, summarizeAudit, type AuditColumns, type AuditStatus } from "../../lib/payment-audit";
import { parseCsv, readTable, type Table } from "../../lib/spreadsheet";
import { toast } from "../toast";
import styles from "./company-tools.module.css";

type Slot = { name: string; table: Table; columns: AuditColumns; example: boolean };
const ORDER: AuditStatus[] = ["matched", "check_amount", "missing_at_bank", "not_in_report", "ambiguous", "duplicate"];
const TONE: Record<AuditStatus, string> = { matched: "good", check_amount: "warn", missing_at_bank: "bad", not_in_report: "info", ambiguous: "amber", duplicate: "dup" };
const MEANING: Record<AuditStatus, string> = {
  matched: "One credit carries the reference and the amount is within 5%.",
  check_amount: "Paired by reference, but the amounts are far apart.",
  missing_at_bank: "The provider reports it; no credit carries the reference.",
  not_in_report: "A bank credit no provider row explains.",
  ambiguous: "More than one credit could be this payment.",
  duplicate: "The same reference appears more than once.",
};

/** Where every row went: one ring, a slice per outcome, the matched share in the middle. */
function AuditDonut({ counts, total, reduce, filter, onPick }: { counts: Record<AuditStatus, number>; total: number; reduce: boolean | null; filter: AuditStatus | "all"; onPick: (status: AuditStatus | "all") => void }) {
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  const slices = ORDER.filter((status) => counts[status]);
  const gap = slices.length > 1 ? 3 : 0;
  let offset = 0;
  const arcs = slices.map((status) => {
    const share = counts[status] / total;
    const length = Math.max(0, share * circumference - gap);
    const arc = { status, length, offset };
    offset += share * circumference;
    return arc;
  });
  const percent = total ? Math.round((counts.matched / total) * 100) : 0;
  return (
    <div className={styles.donutPanel}>
      <div className={styles.donut} role="img" aria-label={`${counts.matched} of ${total} rows matched. ${slices.map((status) => `${STATUS_LABEL[status]} ${counts[status]}`).join(", ")}`}>
        <svg viewBox="0 0 160 160" aria-hidden="true">
          <circle cx="80" cy="80" r={radius} className={styles.donutTrack} />
          {arcs.map(({ status, length, offset: start }, index) => (
            <motion.circle key={status} cx="80" cy="80" r={radius} className={styles.donutArc} data-tone={TONE[status]} data-active={filter === status || undefined} data-dim={(filter !== "all" && filter !== status) || undefined}
              strokeDashoffset={-start}
              initial={reduce ? false : { strokeDasharray: `0 ${circumference}` }}
              animate={{ strokeDasharray: `${length} ${circumference - length}` }}
              transition={{ duration: 0.7, delay: index * 0.08, ease: [0.23, 1, 0.32, 1] }}
              onClick={() => onPick(filter === status ? "all" : status)} />
          ))}
        </svg>
        <div className={styles.donutCenter}><strong>{percent}<small>%</small></strong><span>{counts.matched} of {total} matched</span></div>
      </div>
      <ul className={styles.donutLegend}>
        {slices.map((status) => (
          <li key={status}>
            <button type="button" data-tone={TONE[status]} aria-pressed={filter === status} onClick={() => onPick(filter === status ? "all" : status)}>
              <i aria-hidden />
              <span><strong>{STATUS_LABEL[status]}</strong><small>{MEANING[status]}</small></span>
              <b>{counts[status]}<em>{Math.round((counts[status] / total) * 100)}%</em></b>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function money(minor: number, currency: string | null) {
  const value = Math.abs(minor) / 100;
  const text = value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "INR" ? `₹${text}` : `${text}${currency ? ` ${currency}` : ""}`;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Match a provider's payout report to the bank statement, in this browser.
 * Nothing is uploaded: the files are read here and forgotten when you leave.
 */
export function PaymentAudit() {
  const reduce = useReducedMotion();
  const [provider, setProvider] = useState<Slot | null>(null);
  const [bank, setBank] = useState<Slot | null>(null);
  const [filter, setFilter] = useState<AuditStatus | "all">("all");

  const result = useMemo(() => {
    if (!provider || !bank) return null;
    const reported = readAuditRows(provider.table, provider.columns);
    const credited = readAuditRows(bank.table, bank.columns);
    const lines = auditPayments(reported.rows, credited.rows);
    return { lines, summary: summarizeAudit(lines), skipped: reported.skipped + credited.skipped };
  }, [provider, bank]);

  const shown = result ? result.lines.filter((line) => filter === "all" || line.status === filter).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)) : [];
  const total = result?.lines.length ?? 0;
  const flagged = result ? total - result.summary.counts.matched : 0;

  function useExample() {
    const p = parseCsv(EXAMPLE_PROVIDER_CSV); const b = parseCsv(EXAMPLE_BANK_CSV);
    setProvider({ name: "example-provider-report.csv", table: p, columns: detectAuditColumns(p[0]!, "provider"), example: true });
    setBank({ name: "example-bank-statement.csv", table: b, columns: detectAuditColumns(b[0]!, "bank"), example: true });
    setFilter("all");
  }

  return (
    <div className={styles.tool}>
      <div className={styles.slots}>
        <FileSlot kind="provider" title="Provider report" hint="The payout export from Wise, Skydo, Xflow or your bank’s remittance desk." icon={<ReceiptText size={18} aria-hidden />} slot={provider} onChange={setProvider} />
        <FileSlot kind="bank" title="Bank statement" hint="The credits as your bank shows them: CSV or Excel." icon={<Landmark size={18} aria-hidden />} slot={bank} onChange={setBank} />
      </div>
      <div className={styles.actions}>
        <p className={styles.privacy}><Lock size={13} aria-hidden />Files stay in this browser. Nothing is uploaded or saved.</p>
        <span className={styles.grow} />
        {provider || bank ? <button type="button" className={`${styles.ghost} press`} onClick={() => { setProvider(null); setBank(null); }}><RotateCcw size={14} aria-hidden />Start over</button> : null}
        <button type="button" className={`${styles.ghost} press`} onClick={useExample}><Sparkles size={14} aria-hidden />Use example files</button>
      </div>

      {result ? (
        <section className={styles.results} aria-label="Audit results">
          {provider?.example ? <p className={styles.example}>Example files — fictional payments, for trying the audit.</p> : null}
          <div className={styles.tiles}>
            <div className={styles.tile} data-tone="good"><span>Matched</span><strong>{result.summary.counts.matched}<small> of {total}</small></strong></div>
            {result.summary.totals.map((totalRow) => (
              <div key={totalRow.currency} className={styles.tile} data-tone={totalRow.differenceMinor > 0 ? "bad" : "good"}>
                <span>{totalRow.differenceMinor > 0 ? "Arrived short" : totalRow.differenceMinor < 0 ? "Arrived over" : "Difference"} · matched {totalRow.currency}</span>
                <strong>{money(totalRow.differenceMinor, totalRow.currency)}<small> · {totalRow.bps ?? 0} bps</small></strong>
              </div>
            ))}
            <div className={styles.tile} data-tone={flagged ? "warn" : "good"}><span>Need a look</span><strong>{flagged}<small> {flagged === 1 ? "row" : "rows"}</small></strong></div>
          </div>
          <AuditDonut counts={result.summary.counts} total={total} reduce={reduce} filter={filter} onPick={setFilter} />
          <div className={styles.filters} role="group" aria-label="Show">
            <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All <span>{total}</span></button>
            {ORDER.filter((status) => result.summary.counts[status]).map((status) => (
              <button key={status} type="button" aria-pressed={filter === status} data-tone={TONE[status]} onClick={() => setFilter(status)}><i aria-hidden />{STATUS_LABEL[status]} <span>{result.summary.counts[status]}</span></button>
            ))}
            <span className={styles.grow} />
            <button type="button" className={`${styles.exportButton} press`} onClick={() => { download("railor-payment-audit.csv", auditCsv(result.lines)); toast.success("Audit exported", "railor-payment-audit.csv"); }}><Download size={14} aria-hidden />Export CSV</button>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Status</th><th>Reference</th><th className={styles.num}>Reported</th><th className={styles.num}>Credited</th><th className={styles.num}>Difference</th><th>Note</th></tr></thead>
              <tbody>
                {shown.map((line, index) => (
                  <tr key={`${line.status}:${line.reference}:${line.provider?.line ?? ""}:${line.bank?.line ?? ""}:${index}`}>
                    <td><span className={styles.status} data-tone={TONE[line.status]}>{STATUS_LABEL[line.status]}</span></td>
                    <td className={styles.ref}>{line.reference}</td>
                    <td className={styles.num}>{line.provider ? line.provider.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</td>
                    <td className={styles.num}>{line.bank ? line.bank.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</td>
                    <td className={styles.num} data-short={line.differenceMinor !== null && line.differenceMinor > 0 || undefined}>{line.differenceMinor === null ? "—" : line.differenceMinor === 0 ? "0" : <>{line.differenceMinor > 0 ? "−" : "+"}{money(line.differenceMinor, line.currency)}<small>{line.bps} bps</small></>}</td>
                    <td className={styles.note}>{line.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.skipped ? <p className={styles.muted}>{result.skipped} rows had no reference or amount and were skipped.</p> : null}
          <p className={styles.muted}>Difference = reported − credited, in basis points of the reported amount (100 bps = 1%). Rows more than 5% apart are flagged, not matched.</p>
        </section>
      ) : (
        <div className={styles.emptyState}>
          <FileSpreadsheet size={22} aria-hidden />
          <p><strong>Add both files to start.</strong> Railor matches each payment by its reference, checks the amounts, and flags anything missing, duplicated or unclear.</p>
        </div>
      )}
    </div>
  );
}

function FileSlot({ kind, title, hint, icon, slot, onChange }: { kind: "provider" | "bank"; title: string; hint: string; icon: React.ReactNode; slot: Slot | null; onChange: (slot: Slot | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  async function choose(file: File | null | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const table = await readTable(file);
      if (table.length < 2) throw new Error("This file has no rows under the header.");
      onChange({ name: file.name, table, columns: detectAuditColumns(table[0]!, kind), example: false });
    } catch (error) {
      toast.error(`Couldn’t read ${file.name}`, (error as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  const header = slot?.table[0] ?? [];
  const missing = slot && (slot.columns.reference === null || slot.columns.amount === null);
  return (
    <div className={styles.slot} data-dragging={dragging || undefined} data-ready={slot ? true : undefined}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void choose(event.dataTransfer.files[0]); }}>
      <div className={styles.slotHead}><span className={styles.slotIcon}>{icon}</span><div><h2>{title}</h2><p>{hint}</p></div></div>
      <input ref={input} type="file" className="sr-only" accept=".csv,.xlsx,text/csv" aria-label={`Choose the ${title.toLowerCase()} file`} onChange={(event) => void choose(event.target.files?.[0])} />
      {slot ? (
        <>
          <div className={styles.fileRow}><FileSpreadsheet size={16} aria-hidden /><strong>{slot.name}</strong><small>{slot.table.length - 1} rows</small><button type="button" onClick={() => input.current?.click()}>Replace</button></div>
          <div className={styles.mapping}>
            {(["reference", "amount", "currency"] as const).map((field) => (
              <label key={field}>
                <span>{field === "reference" ? "Reference" : field === "amount" ? (kind === "provider" ? "Amount paid out" : "Amount credited") : "Currency"}</span>
                <select value={slot.columns[field] ?? ""} onChange={(event) => onChange({ ...slot, columns: { ...slot.columns, [field]: event.target.value === "" ? null : Number(event.target.value) } })}>
                  <option value="">{field === "currency" ? "Not in this file" : "Choose a column"}</option>
                  {header.map((cell, index) => <option key={index} value={index}>{cell || `Column ${index + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
          {missing ? <p className={styles.warn}>Choose the reference and amount columns to match this file.</p> : null}
        </>
      ) : (
        <button type="button" className={`${styles.drop} press`} disabled={busy} onClick={() => input.current?.click()}>
          <UploadCloud size={20} aria-hidden />
          <strong>{busy ? "Reading…" : "Drop a file or browse"}</strong>
          <small>CSV or Excel (.xlsx), up to 5 MB</small>
        </button>
      )}
    </div>
  );
}
