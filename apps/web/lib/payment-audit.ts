import { findColumn, parseAmount, type Table } from "./spreadsheet";

/**
 * Payment audit: match what a provider reported paying to what the bank
 * actually credited, by payment reference, and show the differences.
 *
 *   matched          one bank credit for the reference, amount within the sanity band
 *   check_amount     paired by reference, but the amounts differ by more than the band
 *   ambiguous        several bank credits could be this payment, or one credit fits several
 *   missing_at_bank  the provider reports it; no bank credit carries the reference
 *   not_in_report    a bank credit no provider row explains
 *   duplicate        the same reference appears more than once in one file
 *
 * Differences are in integer minor units and basis points of what the
 * provider reported (positive = less arrived than reported).
 */
export type AuditStatus = "matched" | "check_amount" | "ambiguous" | "missing_at_bank" | "not_in_report" | "duplicate";

export const STATUS_LABEL: Record<AuditStatus, string> = {
  matched: "Matched",
  check_amount: "Check amount",
  ambiguous: "Ambiguous",
  missing_at_bank: "Missing at bank",
  not_in_report: "Not in report",
  duplicate: "Duplicate",
};

export interface AuditColumns { reference: number | null; amount: number | null; currency: number | null; date: number | null }
export interface AuditRow { line: number; reference: string; amount: number; currency: string | null; date: string | null }
export interface AuditLine {
  status: AuditStatus;
  reference: string;
  provider: AuditRow | null;
  bank: AuditRow | null;
  currency: string | null;
  /** Reported − credited, in minor units; null when unpaired. */
  differenceMinor: number | null;
  bps: number | null;
  note: string;
}

const SYNONYMS = {
  reference: ["reference", "payment reference", "ref", "transaction id", "transfer id", "utr", "invoice", "invoice number", "narration", "description", "remarks", "details", "particulars"],
  providerAmount: ["recipient amount", "target amount", "amount received", "payout amount", "credited amount", "net amount", "settlement amount", "amount"],
  bankAmount: ["credit amount", "credit", "deposit", "deposits", "amount", "cr"],
  currency: ["currency", "ccy", "target currency", "settlement currency"],
  date: ["value date", "date", "transaction date", "posted", "created"],
};

export function detectAuditColumns(header: string[], kind: "provider" | "bank"): AuditColumns {
  return {
    reference: findColumn(header, SYNONYMS.reference),
    amount: findColumn(header, kind === "provider" ? SYNONYMS.providerAmount : SYNONYMS.bankAmount),
    currency: findColumn(header, SYNONYMS.currency),
    date: findColumn(header, SYNONYMS.date),
  };
}

/** Rows with a reference and a positive amount; the rest are counted as skipped. */
export function readAuditRows(table: Table, columns: AuditColumns): { rows: AuditRow[]; skipped: number } {
  const rows: AuditRow[] = [];
  let skipped = 0;
  if (columns.reference === null || columns.amount === null) return { rows, skipped: Math.max(0, table.length - 1) };
  for (let i = 1; i < table.length; i += 1) {
    const cells = table[i]!;
    const reference = cells[columns.reference] ?? "";
    const amount = parseAmount(cells[columns.amount]);
    if (!reference || amount === null || amount <= 0) { skipped += 1; continue; }
    rows.push({ line: i + 1, reference, amount, currency: columns.currency !== null ? (cells[columns.currency] || null)?.toUpperCase() ?? null : null, date: columns.date !== null ? cells[columns.date] || null : null });
  }
  return { rows, skipped };
}

const key = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
const minor = (value: number) => BigInt(Math.round(value * 100));

function difference(expected: number, received: number) {
  const e = minor(expected);
  const diff = e - minor(received);
  if (e === 0n) return { differenceMinor: Number(diff), bps: null };
  const n = diff * 10_000n;
  const negative = n < 0n;
  const q = ((negative ? -n : n) * 2n + e) / (e * 2n);
  return { differenceMinor: Number(diff), bps: Number(negative ? -q : q) };
}

/** A bank narration may carry the reference among other text; short references must match exactly. */
function mentions(bankReference: string, providerKey: string) {
  const bank = key(bankReference);
  return bank === providerKey || (providerKey.length >= 5 && bank.includes(providerKey));
}

export interface AuditOptions { sanityBps?: number }

export function auditPayments(provider: AuditRow[], bank: AuditRow[], options: AuditOptions = {}): AuditLine[] {
  const sanityBps = options.sanityBps ?? 500;
  const lines: AuditLine[] = [];
  const providerCounts = new Map<string, number>();
  for (const row of provider) providerCounts.set(key(row.reference), (providerCounts.get(key(row.reference)) ?? 0) + 1);
  const bankCounts = new Map<string, number>();
  for (const row of bank) bankCounts.set(key(row.reference), (bankCounts.get(key(row.reference)) ?? 0) + 1);

  const claimed = new Map<AuditRow, AuditRow>();
  const contested = new Set<AuditRow>();
  const pairs: Array<{ row: AuditRow; candidates: AuditRow[] }> = [];
  for (const row of provider) {
    const k = key(row.reference);
    if ((providerCounts.get(k) ?? 0) > 1) {
      lines.push({ status: "duplicate", reference: row.reference, provider: row, bank: null, currency: row.currency, differenceMinor: null, bps: null, note: `Reference appears ${providerCounts.get(k)} times in the provider report.` });
      continue;
    }
    pairs.push({ row, candidates: bank.filter((credit) => mentions(credit.reference, k)) });
  }
  for (const { candidates } of pairs) for (const credit of candidates) {
    if (claimed.has(credit)) contested.add(credit);
    claimed.set(credit, credit);
  }

  for (const { row, candidates } of pairs) {
    const currency = row.currency;
    if (!candidates.length) {
      lines.push({ status: "missing_at_bank", reference: row.reference, provider: row, bank: null, currency, differenceMinor: null, bps: null, note: "No bank credit carries this reference." });
      continue;
    }
    const open = candidates.filter((credit) => !contested.has(credit));
    const within = open.filter((credit) => Math.abs(difference(row.amount, credit.amount).bps ?? Infinity) <= sanityBps);
    if (candidates.length > 1 && within.length === candidates.length && candidates.every((credit) => minor(credit.amount) === minor(candidates[0]!.amount))) {
      lines.push({ status: "duplicate", reference: row.reference, provider: row, bank: candidates[0]!, currency, differenceMinor: null, bps: null, note: `Possibly credited twice: ${candidates.length} bank credits carry this reference for the same amount.` });
      continue;
    }
    const pick = open.length === 1 ? open[0]! : within.length === 1 ? within[0]! : null;
    if (!pick || (candidates.length > 1 && within.length !== 1)) {
      lines.push({ status: "ambiguous", reference: row.reference, provider: row, bank: null, currency, differenceMinor: null, bps: null, note: candidates.length > 1 ? `${candidates.length} bank credits could be this payment.` : "This bank credit also matches another reported payment." });
      continue;
    }
    if (pick.currency && currency && pick.currency !== currency) {
      lines.push({ status: "check_amount", reference: row.reference, provider: row, bank: pick, currency, differenceMinor: null, bps: null, note: `Currencies differ: reported ${currency}, credited ${pick.currency}.` });
      continue;
    }
    const diff = difference(row.amount, pick.amount);
    const sane = Math.abs(diff.bps ?? Infinity) <= sanityBps;
    lines.push({
      status: sane ? "matched" : "check_amount",
      reference: row.reference, provider: row, bank: pick, currency: currency ?? pick.currency, ...diff,
      note: sane ? (diff.differenceMinor === 0 ? "Exact match." : diff.differenceMinor > 0 ? "Less arrived than reported." : "More arrived than reported.") : `Amounts differ by more than ${sanityBps / 100}% — check it’s the same payment.`,
    });
  }

  const used = new Set(lines.flatMap((line) => (line.bank ? [line.bank] : [])));
  for (const credit of bank) {
    if (used.has(credit) || claimed.has(credit)) continue;
    const duplicate = (bankCounts.get(key(credit.reference)) ?? 0) > 1;
    lines.push({ status: duplicate ? "duplicate" : "not_in_report", reference: credit.reference, provider: null, bank: credit, currency: credit.currency, differenceMinor: null, bps: null, note: duplicate ? `Reference appears ${bankCounts.get(key(credit.reference))} times in the bank file.` : "No provider row explains this credit." });
  }
  return lines;
}

export interface AuditSummary {
  counts: Record<AuditStatus, number>;
  /** Over matched rows only, per currency. */
  totals: Array<{ currency: string; reported: number; credited: number; differenceMinor: number; bps: number | null }>;
}

export function summarizeAudit(lines: AuditLine[]): AuditSummary {
  const counts = Object.fromEntries((Object.keys(STATUS_LABEL) as AuditStatus[]).map((status) => [status, 0])) as Record<AuditStatus, number>;
  const byCurrency = new Map<string, { reported: bigint; credited: bigint }>();
  for (const line of lines) {
    counts[line.status] += 1;
    if (line.status !== "matched" || !line.provider || !line.bank) continue;
    const currency = line.currency ?? "—";
    const total = byCurrency.get(currency) ?? { reported: 0n, credited: 0n };
    total.reported += minor(line.provider.amount);
    total.credited += minor(line.bank.amount);
    byCurrency.set(currency, total);
  }
  const totals = [...byCurrency].map(([currency, total]) => {
    const diff = difference(Number(total.reported) / 100, Number(total.credited) / 100);
    return { currency, reported: Number(total.reported) / 100, credited: Number(total.credited) / 100, ...diff };
  });
  return { counts, totals };
}

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  // Neutralise spreadsheet formulas in exported text.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, "\"\"")}"` : safe;
};

export function auditCsv(lines: AuditLine[]): string {
  const header = ["Status", "Reference", "Reported amount", "Credited amount", "Currency", "Difference", "Difference (bps)", "Note", "Report line", "Bank line"];
  const body = lines.map((line) => [STATUS_LABEL[line.status], line.reference, line.provider?.amount ?? "", line.bank?.amount ?? "", line.currency ?? "", line.differenceMinor === null ? "" : (line.differenceMinor / 100).toFixed(2), line.bps ?? "", line.note, line.provider?.line ?? "", line.bank?.line ?? ""]);
  return [header, ...body].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/** Example files for trying the audit — clearly fictional. */
export const EXAMPLE_PROVIDER_CSV = `Transfer ID,Reference,Recipient amount,Currency,Date
TX-1001,INV-2041,158210.40,INR,2026-11-02
TX-1002,INV-2042,93410.00,INR,2026-11-03
TX-1003,INV-2043,46705.10,INR,2026-11-04
TX-1004,INV-2044,280230.00,INR,2026-11-05
TX-1005,INV-2045,18682.00,INR,2026-11-06
TX-1006,INV-2046,74728.80,INR,2026-11-07`;

export const EXAMPLE_BANK_CSV = `Value date,Narration,Credit,Currency
2026-11-03,NEFT CR/UTR8841/INV-2041 CLIENT PAYMENT,158210.40,INR
2026-11-04,IMPS/UTR9912/INV2042,92980.00,INR
2026-11-05,INWARD REMIT INV-2044,276540.00,INR
2026-11-06,UPI/REF77310/SELF,25000.00,INR
2026-11-07,NEFT CR/INV-2045,18682.00,INR
2026-11-07,NEFT CR/INV-2045 RETRY,18682.00,INR
2026-11-08,INWARD REMIT INV-2046,61200.00,INR`;
