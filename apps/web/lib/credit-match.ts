import { findColumn, parseAmount, type Table } from "./spreadsheet";

/**
 * Finds the bank credit for an invoice in a statement the user drops in, in the
 * browser: nothing is uploaded. A credit is a candidate when its narration
 * carries the invoice number, or when its amount sits close to what the quote
 * expected and it arrived after the quote.
 */
export interface CreditCandidate {
  line: number;
  narration: string;
  amount: number;
  /** YYYY-MM-DD when the statement's date could be read. */
  date: string | null;
  match: "invoice" | "amount";
}

const SYNONYMS = {
  narration: ["narration", "transaction remarks", "description", "particulars", "remarks", "details", "reference", "chq ref no", "ref no", "utr"],
  credit: ["credit amount", "deposit amt", "deposit amount", "deposits", "deposit", "credit", "cr amount", "amount credited"],
  amount: ["amount", "transaction amount", "txn amount"],
  direction: ["dr cr", "cr dr", "debit credit", "credit debit", "type", "transaction type", "dr or cr"],
  date: ["value date", "value dt", "transaction date", "txn date", "post date", "posted", "date"],
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (value: number) => String(value).padStart(2, "0");

/** Statement dates come in many shapes; read the common ones, and Excel's serial days. */
export function parseStatementDate(cell: string | undefined): string | null {
  const text = (cell ?? "").trim();
  if (!text) return null;
  const valid = (y: number, m: number, d: number) => {
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
  };
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  if (match) return valid(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})\b/.exec(text);
  if (match) return valid(match[3]!.length === 2 ? 2000 + Number(match[3]) : Number(match[3]), Number(match[2]), Number(match[1]));
  match = /^(\d{1,2})[-/. ]([A-Za-z]{3})[a-z]*[-/. ,]*(\d{2}|\d{4})\b/.exec(text);
  if (match) {
    const month = MONTHS.indexOf(match[2]!.toLowerCase()) + 1;
    return month ? valid(match[3]!.length === 2 ? 2000 + Number(match[3]) : Number(match[3]), month, Number(match[1])) : null;
  }
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const serial = Math.floor(Number(text));
    if (serial > 36_000 && serial < 80_000) return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10);
  }
  return null;
}

const key = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

interface Layout { header: number; narration: number; credit: number | null; amount: number | null; direction: number | null; date: number | null }

/** Statements often start with account details; the header is the first row that names a narration and an amount. */
function layoutOf(table: Table): Layout | null {
  for (let row = 0; row < Math.min(table.length, 25); row += 1) {
    const header = table[row]!;
    const narration = findColumn(header, SYNONYMS.narration);
    const credit = findColumn(header, SYNONYMS.credit, [narration]);
    const amount = credit === null ? findColumn(header, SYNONYMS.amount, [narration]) : null;
    if (narration === null || (credit === null && amount === null)) continue;
    return { header: row, narration, credit, amount, direction: findColumn(header, SYNONYMS.direction, [narration, credit, amount]), date: findColumn(header, SYNONYMS.date, [narration, credit, amount]) };
  }
  return null;
}

export interface CreditSearch {
  invoiceNumber: string;
  /** What the quote expected to arrive; omit to match on the invoice number alone. */
  expected: number | null;
  /** YYYY-MM-DD the quote was saved; earlier credits cannot be for it. */
  quoteDate: string | null;
  /** How far from the expected amount a credit may be, in percent. Rates move and fees apply. */
  tolerancePct?: number;
}

export function findCredits(table: Table, search: CreditSearch): { candidates: CreditCandidate[]; readable: boolean; credits: number } {
  const layout = layoutOf(table);
  if (!layout) return { candidates: [], readable: false, credits: 0 };
  const invoiceKey = key(search.invoiceNumber);
  const band = (search.tolerancePct ?? 8) / 100;
  const found: Array<CreditCandidate & { distance: number }> = [];
  let credits = 0;
  for (let i = layout.header + 1; i < table.length; i += 1) {
    const cells = table[i]!;
    const raw = layout.credit !== null ? parseAmount(cells[layout.credit]) : parseAmount(cells[layout.amount!]);
    if (raw === null || raw <= 0) continue;
    // One signed column plus a Dr/Cr marker: skip the debits.
    const direction = layout.direction !== null ? (cells[layout.direction] ?? "").trim().toLowerCase() : "";
    if (layout.credit === null && /^(d|dr|debit|withdrawal)\b/.test(direction)) continue;
    credits += 1;
    const narration = cells[layout.narration] ?? "";
    const date = layout.date !== null ? parseStatementDate(cells[layout.date]) : null;
    const named = invoiceKey.length >= 4 && key(narration).includes(invoiceKey);
    const near = search.expected !== null && search.expected > 0 && Math.abs(raw - search.expected) / search.expected <= band
      && (!date || !search.quoteDate || date >= search.quoteDate);
    if (!named && !near) continue;
    found.push({ line: i + 1, narration, amount: raw, date, match: named ? "invoice" : "amount", distance: search.expected ? Math.abs(raw - search.expected) : 0 });
  }
  found.sort((a, b) => Number(b.match === "invoice") - Number(a.match === "invoice") || a.distance - b.distance || (b.date ?? "").localeCompare(a.date ?? ""));
  return { candidates: found.slice(0, 5).map(({ distance: _distance, ...rest }) => rest), readable: true, credits };
}
