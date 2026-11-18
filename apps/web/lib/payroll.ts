import type { PriceRow } from "@railor/core";
import type { priceView } from "./price-view";
import { findColumn, parseAmount, type Table } from "./spreadsheet";

/**
 * Payroll pricing: one price check per employee payout, so a company sees the
 * cheapest way to pay each person and how far apart the options are.
 *
 * A sheet's amounts are one of two things, and the company says which:
 *   send     what the company sends, in the paying currency;
 *   receive  what each person receives — their net pay, in their currency.
 * Railor prices by the amount sent, so for net pay it estimates the send
 * amount at the mid-market rate, prices that, and reports what arrives
 * against the net pay (a shortfall or an excess). Those send amounts are
 * estimates and are always labelled so.
 *
 * Names and employee IDs stay in the browser. Only an opaque row id, the
 * amount, the currency and (optionally) the country are sent to be priced.
 */
export type AmountSide = "send" | "receive";

export interface PayrollColumns {
  name: number | null;
  /** Named as what the company sends ("Amount to send"). */
  send: number | null;
  /** Named as what the person receives ("Net pay"). */
  receive: number | null;
  /** An amount column that doesn't say which ("Amount", "Salary"). */
  amount: number | null;
  currency: number | null;
  country: number | null;
}
export interface PayrollRow { id: string; line: number; name: string; amount: number; currency: string; country: string | null }

export const PAYROLL_MAX_ROWS = 50;

const SEND = ["amount to send", "send amount", "sending amount", "amount sent", "you send"];
const RECEIVE = ["net pay", "net salary", "take home pay", "take home", "net amount", "amount to receive", "receive amount", "amount received"];
const AMOUNT = ["payout amount", "amount", "salary", "pay"];
const NAME = ["employee name", "employee", "name", "payee", "beneficiary", "employee id", "emp id", "staff id"];

export function detectPayrollColumns(header: string[]): PayrollColumns {
  const currency = findColumn(header, ["pay currency", "payout currency", "currency", "ccy"]);
  const country = findColumn(header, ["country code", "country", "location"], [currency]);
  const send = findColumn(header, SEND, [currency, country]);
  const receive = findColumn(header, RECEIVE, [currency, country, send]);
  const amount = send === null || receive === null ? findColumn(header, AMOUNT, [currency, country, send, receive]) : null;
  const name = findColumn(header, NAME, [currency, country, send, receive, amount]);
  return { name, send, receive, amount, currency, country };
}

/** Where this reading's amounts come from: the column named for the side, else whichever amount column there is. */
export function amountColumn(columns: PayrollColumns, side: AmountSide): number | null {
  return side === "receive" ? columns.receive ?? columns.amount ?? columns.send : columns.send ?? columns.amount ?? columns.receive;
}

/** A sheet whose only amount column is named for one side is read that way; otherwise the current choice stands. */
export function sideForColumns(columns: PayrollColumns, current: AmountSide): AmountSide {
  if (columns.receive !== null && columns.send === null) return "receive";
  if (columns.send !== null && columns.receive === null) return "send";
  return current;
}

export function readPayroll(table: Table, columns: PayrollColumns, side: AmountSide = "send", fallbackCurrency: string | null = null): { rows: PayrollRow[]; skipped: Array<{ line: number; reason: string }> } {
  const rows: PayrollRow[] = [];
  const skipped: Array<{ line: number; reason: string }> = [];
  const column = amountColumn(columns, side);
  if (column === null) return { rows, skipped: [{ line: 1, reason: "No amount column found." }] };
  for (let i = 1; i < table.length; i += 1) {
    const cells = table[i]!;
    const amount = parseAmount(cells[column]);
    const currency = (columns.currency !== null ? cells[columns.currency] : fallbackCurrency)?.trim().toUpperCase() ?? "";
    const country = columns.country !== null ? cells[columns.country]?.trim().toUpperCase() ?? "" : "";
    if (amount === null || amount <= 0) { skipped.push({ line: i + 1, reason: "No amount above zero." }); continue; }
    if (!/^[A-Z]{3}$/.test(currency)) { skipped.push({ line: i + 1, reason: "No 3-letter currency (e.g. INR)." }); continue; }
    rows.push({ id: `r${i}`, line: i + 1, name: (columns.name !== null ? cells[columns.name] : "") || `Row ${i + 1}`, amount, currency, country: /^[A-Z]{2}$/.test(country) ? country : null });
  }
  return { rows, skipped };
}

const cents = (value: number) => Math.round(value * 100) / 100;

/**
 * What to send so `target` converts at the mid-market rate. It leaves out
 * every fee and FX margin, so through a real route it arrives a little short:
 * the shortfall is that route's cost.
 */
export function midMarketSend(target: number, midRate: number): number | null {
  if (!Number.isFinite(target) || !(target > 0) || !Number.isFinite(midRate) || !(midRate > 0)) return null;
  const send = cents(target / midRate);
  return send > 0 ? send : null;
}

export interface NetPayGap {
  /** What arrives minus the net pay, in the payout currency: negative is a shortfall. */
  amount: number;
  kind: "short" | "over" | "exact";
  /** The shortfall as a share of net pay, in basis points (negative for an excess). */
  bps: number;
}

export function netPayGap(arrives: number, target: number): NetPayGap | null {
  if (!Number.isFinite(arrives) || !Number.isFinite(target) || !(target > 0)) return null;
  const amount = cents(arrives - target);
  return { amount, kind: amount < 0 ? "short" : amount > 0 ? "over" : "exact", bps: Math.round((-amount / target) * 10_000) || 0 };
}

/**
 * What to send to land the full net pay through the same route, scaling its
 * all-in rate (what arrives ÷ what was sent). An estimate: a fixed fee doesn't
 * scale, so it errs slightly high when scaling up and slightly low when
 * scaling down. Rounded up to the cent.
 */
export function sendToLand(sent: number, arrives: number, target: number): number | null {
  if (![sent, arrives, target].every(Number.isFinite) || !(sent > 0) || !(arrives > 0) || !(target > 0)) return null;
  return Math.ceil(((sent * target) / arrives) * 100 - 1e-7) / 100;
}

/**
 * The one figure payroll shows for a payout: the best complete price, or else
 * the top estimate. priceView has already dropped what this sender can't use
 * (Revolut's UK price for a company outside the UK, expired quotes); of the
 * rest, a figure that includes the fee comes before an FX-only one, so a
 * conversion rate with the transfer fee left out never wins on looks.
 */
export function payrollFigure(view: ReturnType<typeof priceView>): { row: PriceRow & { recipientAmount: number }; status: "priced" | "estimate" } | null {
  if (view.best && view.best.recipientAmount !== null) return { row: view.best as PriceRow & { recipientAmount: number }, status: "priced" };
  const priced = view.quotes.filter((row): row is PriceRow & { recipientAmount: number } => row.recipientAmount !== null);
  const top = priced.find((row) => row.costComplete !== false) ?? priced[0];
  return top ? { row: top, status: "estimate" } : null;
}

export interface PayrollQuote {
  id: string;
  /** priced: a complete, comparable price. estimate: the best figure available, with a cost or eligibility still unconfirmed. */
  status: "priced" | "estimate" | "no_price" | "same_currency";
  reason?: string;
  best?: { provider: string; product: string | null; recipientAmount: number; dataStatus: string; costMinor: number | null; bps: number | null; feeIncluded: boolean };
  /** Comparable complete prices for this payout. */
  options?: number;
  /** Best − least that arrives among comparable options, in the payout currency. */
  spread?: number | null;
  /** The same spread, converted at the mid-market benchmark, in the paying currency. */
  spreadInSource?: number | null;
  reference?: { rate: number; source: string; observedAt: string } | null;
  /** Net-pay sheets only: the send amount Railor estimated and priced, and what arrives against the net pay. */
  netPay?: {
    /** Net pay, in the payout currency. */
    target: number;
    /** The send amount priced, in the paying currency: the net pay at the mid-market rate. An estimate. */
    sent: number;
    midRate: number;
    rateSource: string;
    /** What arrives against the net pay; null when the figure leaves a fee out. */
    gap: NetPayGap | null;
    /**
     * What to send to land the full net pay through the best option. A
     * provider quote when the provider prices by the amount received (Wise's
     * public quote does), otherwise scaled from that option's price.
     */
    land: { amount: number; basis: "provider_quote" | "estimate"; provider: string } | null;
  };
}

/** Fictional example. "Amount to send" is in the paying currency; "Net pay" is what each person receives, in their currency. */
export const EXAMPLE_PAYROLL_CSV = `Employee,Country,Currency,Amount to send,Net pay
Asha (example),IN,INR,1700,158000
Daniel (example),MX,MXN,2400,44000
Grace (example),PH,PHP,1250,79000
Lukas (example),DE,EUR,3800,3450
Maya (example),GB,GBP,2900,2190
Tomás (example),BR,BRL,2100,12000`;
