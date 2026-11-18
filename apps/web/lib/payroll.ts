import { findColumn, parseAmount, type Table } from "./spreadsheet";

/**
 * Payroll pricing: one price check per employee payout, so a company sees the
 * cheapest way to pay each person and how far apart the options are.
 *
 * Amounts are what the company sends, in the paying currency; the currency
 * column says how each person is paid.
 *
 * Names and employee IDs stay in the browser. Only an opaque row id, the
 * amount, the currency and (optionally) the country are sent to be priced.
 */
export interface PayrollColumns { name: number | null; amount: number | null; currency: number | null; country: number | null }
export interface PayrollRow { id: string; line: number; name: string; amount: number; currency: string; country: string | null }

export const PAYROLL_MAX_ROWS = 50;

export function detectPayrollColumns(header: string[]): PayrollColumns {
  return {
    name: findColumn(header, ["employee name", "employee", "name", "payee", "beneficiary", "employee id", "emp id", "staff id"]),
    amount: findColumn(header, ["amount to send", "send amount", "net pay", "net salary", "net amount", "payout amount", "amount", "salary", "pay"]),
    currency: findColumn(header, ["pay currency", "currency", "ccy"]),
    country: findColumn(header, ["country code", "country", "location"]),
  };
}

export function readPayroll(table: Table, columns: PayrollColumns, fallbackCurrency: string | null): { rows: PayrollRow[]; skipped: Array<{ line: number; reason: string }> } {
  const rows: PayrollRow[] = [];
  const skipped: Array<{ line: number; reason: string }> = [];
  if (columns.amount === null) return { rows, skipped: [{ line: 1, reason: "No amount column found." }] };
  for (let i = 1; i < table.length; i += 1) {
    const cells = table[i]!;
    const amount = parseAmount(cells[columns.amount]);
    const currency = (columns.currency !== null ? cells[columns.currency] : fallbackCurrency)?.trim().toUpperCase() ?? "";
    const country = columns.country !== null ? cells[columns.country]?.trim().toUpperCase() ?? "" : "";
    if (amount === null || amount <= 0) { skipped.push({ line: i + 1, reason: "No amount above zero." }); continue; }
    if (!/^[A-Z]{3}$/.test(currency)) { skipped.push({ line: i + 1, reason: "No 3-letter currency (e.g. INR)." }); continue; }
    rows.push({ id: `r${i}`, line: i + 1, name: (columns.name !== null ? cells[columns.name] : "") || `Row ${i + 1}`, amount, currency, country: /^[A-Z]{2}$/.test(country) ? country : null });
  }
  return { rows, skipped };
}

export interface PayrollQuote {
  id: string;
  /** priced: a complete, comparable price. estimate: the best figure available, with a cost or eligibility still unconfirmed. */
  status: "priced" | "estimate" | "no_price" | "same_currency";
  reason?: string;
  best?: { provider: string; product: string | null; recipientAmount: number; dataStatus: string; costMinor: number | null; bps: number | null };
  /** Comparable complete prices for this payout. */
  options?: number;
  /** Best − least that arrives among comparable options, in the payout currency. */
  spread?: number | null;
  /** The same spread, converted at the mid-market benchmark, in the paying currency. */
  spreadInSource?: number | null;
  reference?: { rate: number; source: string; observedAt: string } | null;
}

/** Fictional example. Amounts are what the company sends, in the paying currency; Currency is how each person is paid. */
export const EXAMPLE_PAYROLL_CSV = `Employee,Country,Currency,Amount to send
Asha (example),IN,INR,1700
Daniel (example),MX,MXN,2400
Grace (example),PH,PHP,1250
Lukas (example),DE,EUR,3800
Maya (example),GB,GBP,2900
Tomás (example),BR,BRL,2100`;
