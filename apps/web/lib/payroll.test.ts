import { describe, expect, it } from "vitest";
import { comparePrices, type CustomerContext } from "@railor/core";
import { amountColumn, detectPayrollColumns, EXAMPLE_PAYROLL_CSV, midMarketSend, netPayGap, payrollFigure, readPayroll, sendToLand, sideForColumns } from "./payroll";
import { priceView } from "./price-view";
import { parseCsv } from "./spreadsheet";

describe("payroll sheets: what you send or what each person receives", () => {
  it("finds both amount columns in the example and reads each side from its own column", () => {
    const table = parseCsv(EXAMPLE_PAYROLL_CSV);
    const columns = detectPayrollColumns(table[0]!);
    expect(columns).toEqual({ name: 0, country: 1, currency: 2, send: 3, receive: 4, amount: null });
    expect(sideForColumns(columns, "send")).toBe("send");
    expect(sideForColumns(columns, "receive")).toBe("receive");
    const send = readPayroll(table, columns, "send").rows[0]!;
    const receive = readPayroll(table, columns, "receive").rows[0]!;
    expect(send).toMatchObject({ id: "r1", name: "Asha (example)", amount: 1700, currency: "INR", country: "IN" });
    expect(receive).toMatchObject({ id: "r1", amount: 158000, currency: "INR" });
  });

  it("reads a net-pay sheet as what each person receives, and never takes a currency column for an amount", () => {
    const columns = detectPayrollColumns(["Name", "Pay currency", "Net pay (local)"]);
    expect(columns).toMatchObject({ name: 0, currency: 1, receive: 2, send: null });
    expect(sideForColumns(columns, "send")).toBe("receive");
    const plain = detectPayrollColumns(["Payee", "Pay currency", "Salary"]);
    expect(plain).toMatchObject({ name: 0, currency: 1, amount: 2, send: null, receive: null });
    expect(sideForColumns(plain, "receive")).toBe("receive");
    // One amount column is read whichever way the company says its amounts are meant.
    expect(amountColumn(plain, "send")).toBe(2);
    expect(amountColumn(columns, "send")).toBe(2);
  });

  it("estimates the send amount at the mid-market rate, and rejects rates it can't use", () => {
    expect(midMarketSend(150_000, 93.75)).toBe(1600);
    // 158,000 ÷ 93.4445 = 1,690.843…
    expect(midMarketSend(158_000, 93.4445)).toBe(1690.84);
    expect(midMarketSend(150_000, 0)).toBeNull();
    expect(midMarketSend(-5, 90)).toBeNull();
    expect(midMarketSend(Number.NaN, 90)).toBeNull();
    // Too small to be a cent at this rate.
    expect(midMarketSend(0.001, 93)).toBeNull();
  });

  it("reports what arrives against the net pay as a shortfall, an excess or exact", () => {
    expect(netPayGap(149_000, 150_000)).toEqual({ amount: -1000, kind: "short", bps: 67 });
    expect(netPayGap(150_120, 150_000)).toEqual({ amount: 120, kind: "over", bps: -8 });
    expect(netPayGap(150_000, 150_000)).toEqual({ amount: 0, kind: "exact", bps: 0 });
    expect(netPayGap(1, 0)).toBeNull();
  });

  it("scales the send amount to land the full net pay, rounding up to the cent", () => {
    // 1,600 sent, 149,000 arrives: 150,000 needs 1,600 × 150,000 ÷ 149,000 = 1,610.738…
    expect(sendToLand(1600, 149_000, 150_000)).toBe(1610.74);
    expect(sendToLand(1600, 150_000, 150_000)).toBe(1600);
    expect(sendToLand(1600, 0, 150_000)).toBeNull();
  });
});

describe("payroll estimates only use prices the company can get", () => {
  const now = new Date("2026-11-18T10:00:00Z");
  const wise = { rate: 93.75, sourceCurrency: "USD", expirationTime: "2099-01-01T00:00:00Z", paymentOptions: [{ payIn: "BANK_TRANSFER", payOut: "BANK_TRANSFER", disabled: false, sourceAmount: 1600, targetAmount: 148_800, fee: { total: 12.8 } }] };
  // Revolut's UK converter: FX only, and higher than anything with a fee in it.
  const revolut = { sender: { amount: 1600, currency: "USD" }, recipient: { amount: 150_400, currency: "INR" }, rate: { from: "USD", to: "INR", rate: 94, timestamp: now.getTime() }, plans: [{ id: "STANDARD", fees: { total: { amount: 0, currency: "USD" } } }] };
  const fetcher = (wiseUp = true): typeof fetch => async (url) => {
    const href = String(url);
    if (href.startsWith("https://api.wise.com/v3/quotes")) return wiseUp ? Response.json(wise) : new Response("{}", { status: 503 });
    if (href.startsWith("https://www.revolut.com/")) return Response.json(revolut);
    return new Response("{}", { status: 404 });
  };
  const company = (country: string): CustomerContext => ({ profile: "business", country, direction: "send", purpose: "salary" });
  const check = (country: string, wiseUp = true) => comparePrices({ sourceCurrency: "USD", destinationCurrency: "INR", destinationCountry: "IN", amount: 1600, context: company(country) }, { fetcher: fetcher(wiseUp), now });

  it("drops Revolut's UK price for an Indian company and explains why", async () => {
    const view = priceView(await check("IN"), now.getTime());
    expect(view.quotes.map((row) => row.providerSlug)).not.toContain("revolut");
    const hidden = view.excluded.find((row) => row.providerSlug === "revolut")!;
    expect(hidden.profileAssessment?.status).toBe("not_supported");
    expect(hidden.profileAssessment?.reasons[0]).toMatch(/customers in the United Kingdom.*sender in India can't get it/);
    expect(payrollFigure(view)).toMatchObject({ status: "estimate", row: { providerSlug: "wise", recipientAmount: 148_800 } });
  });

  it("shows nothing rather than a price the company can't get", async () => {
    const view = priceView(await check("IN", false), now.getTime());
    expect(payrollFigure(view)).toBeNull();
    expect(view.excluded.some((row) => row.providerSlug === "revolut")).toBe(true);
  });

  it("keeps Revolut's UK price for a UK company, but never above a price that includes the fee", async () => {
    const view = priceView(await check("GB"), now.getTime());
    const revolutRow = view.quotes.find((row) => row.providerSlug === "revolut")!;
    expect(revolutRow).toMatchObject({ costComplete: false, recipientAmount: 150_400 });
    expect(payrollFigure(view)).toMatchObject({ status: "estimate", row: { providerSlug: "wise" } });
    // With nothing else, the FX-only figure is the estimate, and it says it leaves the fee out.
    const only = payrollFigure(priceView(await check("GB", false), now.getTime()));
    expect(only).toMatchObject({ status: "estimate", row: { providerSlug: "revolut", costComplete: false } });
  });

  it("leaves receiving untouched: there the price is the payer's", async () => {
    const result = await comparePrices({ sourceCurrency: "USD", destinationCurrency: "EUR", amount: 1600, context: { profile: "freelancer", country: "DE", direction: "receive", purpose: "services" } }, {
      fetcher: async (url) => String(url).startsWith("https://www.revolut.com/") ? Response.json({ ...revolut, recipient: { amount: 1450, currency: "EUR" }, rate: { ...revolut.rate, to: "EUR", rate: 0.91 } }) : new Response("{}", { status: 404 }),
      now,
    });
    expect(result.rows.find((row) => row.providerSlug === "revolut")?.profileAssessment?.status).not.toBe("not_supported");
  });
});
