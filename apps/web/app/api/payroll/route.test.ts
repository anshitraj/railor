import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PriceCheckInput, PriceCheckResult, PriceRow, ProviderProfileAssessment } from "@railor/core";

const mocks = vi.hoisted(() => ({ session: vi.fn(), limit: vi.fn(), price: vi.fn(), target: vi.fn(), ticker: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../../lib/auth", () => ({ getSession: mocks.session }));
vi.mock("../../../lib/rate-limit", () => ({ consumeLimit: mocks.limit }));
vi.mock("../../../lib/pricing", () => ({ runPriceCheck: mocks.price }));
vi.mock("@railor/core", async (original) => ({ ...await original<typeof import("@railor/core")>(), wisePublicTargetQuote: mocks.target, fxTicker: mocks.ticker }));
const { POST } = await import("./route");

const unconfirmed = { status: "unconfirmed", reasons: ["No verified rules for this account holder, country and payment product yet."], verification: [], fees: "", limits: "", corridors: "", settlement: [], documents: [], purpose: "", priceApplicable: false, sources: [], reviewedAt: null } as unknown as ProviderProfileAssessment;
/** A public quote priced at what each request sends, losing `cost` (in the payout currency). */
function row(slug: string, name: string, input: PriceCheckInput, rate: number, cost: number, extra: Partial<PriceRow> = {}): PriceRow {
  return {
    providerSlug: slug, providerName: name, basis: "live_public", recipientAmount: Math.round((input.amount * rate - cost) * 100) / 100, feeAmount: null, feeCurrency: null, rate,
    totalCostPct: null, partial: true, costComplete: true, delivery: null, observedAt: "2026-11-18T10:00:00Z", source: { label: "Public quote" }, notes: [], shortfall: null, profileAssessment: { ...unconfirmed }, ...extra,
  };
}
const result = (input: PriceCheckInput, rows: PriceRow[], rate: number): PriceCheckResult => ({ input, reference: { rate, source: "Wise", observedAt: "2026-11-18T10:00:00Z" }, rows, unavailable: [], generatedAt: "2026-11-18T10:00:00Z" });

function post(body: unknown) {
  return new Request("http://localhost/api/payroll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "USER", email: "fixture@test.invalid" }, organization: { id: "ORG", building: "company", entityCountry: "IN" }, role: "owner" });
  mocks.limit.mockResolvedValue(true);
  mocks.ticker.mockResolvedValue([]);
  mocks.target.mockRejectedValue(new Error("no target quote"));
});

describe("payroll pricing of net pay", () => {
  it("estimates the send amount at mid-market, prices it, and uses Wise's own quote for the exact net pay", async () => {
    mocks.target.mockResolvedValue({ sourceCurrency: "USD", targetCurrency: "INR", sourceAmount: 1533.1, targetAmount: 142_000, rate: 93.4445, feeAmount: 13.48, feeCurrency: "USD", payInLabel: "by bank transfer into Wise", observedAt: "2026-11-18T10:00:00Z" });
    mocks.price.mockImplementation(async (_org: string, input: PriceCheckInput) => result(input, [row("wise", "Wise", input, 93.4445, 1260)], 93.4445));
    const response = await POST(post({ sourceCurrency: "USD", amountSide: "receive", payouts: [{ id: "r1", amount: 142_000, currency: "INR", country: "IN", name: "Asha" }] }));
    expect(response.status).toBe(200);
    const body = await response.json();
    // 142,000 ÷ 93.4445 = 1,519.62 is what was priced.
    expect(mocks.price).toHaveBeenCalledWith("ORG", expect.objectContaining({ sourceCurrency: "USD", destinationCurrency: "INR", destinationCountry: "IN", amount: 1519.62 }));
    expect(body.quotes[0]).toMatchObject({
      id: "r1", status: "estimate", best: { provider: "Wise", feeIncluded: true },
      netPay: { target: 142_000, sent: 1519.62, midRate: 93.4445, gap: { kind: "short", amount: -1259.87 }, land: { amount: 1533.1, basis: "provider_quote", provider: "Wise" } },
    });
    // Names never reach pricing.
    expect(JSON.stringify(mocks.price.mock.calls)).not.toContain("Asha");
    expect(JSON.stringify(mocks.target.mock.calls)).not.toContain("Asha");
  });

  it("scales the best option's own price when it isn't Wise, and says it's an estimate", async () => {
    mocks.ticker.mockResolvedValue([{ from: "USD", to: "INR", rate: 93.75, observedAt: "2026-11-18T10:00:00Z" }]);
    mocks.price.mockImplementation(async (_org: string, input: PriceCheckInput) => result(input, [row("xflow", "Xflow", input, 93.75, 1000, { basis: "published", partial: false, shortfall: 0, profileAssessment: { ...unconfirmed, status: "documented", priceApplicable: true } })], 93.75));
    const body = await (await POST(post({ sourceCurrency: "USD", amountSide: "receive", payouts: [{ id: "r1", amount: 150_000, currency: "INR", country: "IN" }] }))).json();
    expect(body.quotes[0]).toMatchObject({ status: "priced", netPay: { sent: 1600, gap: { kind: "short", amount: -1000, bps: 67 }, land: { amount: 1610.74, basis: "estimate", provider: "Xflow" } } });
  });

  it("gives no gap or send-to-land figure when the best figure leaves the fee out", async () => {
    mocks.ticker.mockResolvedValue([{ from: "GBP", to: "INR", rate: 118, observedAt: "2026-11-18T10:00:00Z" }]);
    mocks.session.mockResolvedValue({ user: { id: "USER", email: "fixture@test.invalid" }, organization: { id: "ORG", building: "company", entityCountry: "GB" }, role: "owner" });
    mocks.price.mockImplementation(async (_org: string, input: PriceCheckInput) => result(input, [row("revolut", "Revolut · UK Standard", input, 118, 0, { costComplete: false })], 118));
    const body = await (await POST(post({ sourceCurrency: "GBP", amountSide: "receive", payouts: [{ id: "r1", amount: 118_000, currency: "INR" }] }))).json();
    expect(body.quotes[0]).toMatchObject({ status: "estimate", reason: expect.stringMatching(/transfer fee isn’t included/), best: { feeIncluded: false }, netPay: { sent: 1000, gap: null, land: null } });
  });

  it("never prices a net pay without a mid-market rate, and never treats a stablecoin as a dollar", async () => {
    // DAI: Wise quotes no stablecoin, so there's no rate, and USD → DAI is never assumed 1:1.
    const body = await (await POST(post({ sourceCurrency: "USD", amountSide: "receive", payouts: [{ id: "r1", amount: 500, currency: "DAI" }] }))).json();
    expect(body.quotes[0]).toMatchObject({ status: "no_price", reason: expect.stringMatching(/No mid-market rate for USD to DAI/) });
    expect(mocks.price).not.toHaveBeenCalled();
  });

  it("keeps the send-side cap, while net pay in a high-unit currency can run to millions", async () => {
    expect((await POST(post({ sourceCurrency: "USD", payouts: [{ id: "r1", amount: 50_000_000, currency: "IDR" }] }))).status).toBe(400);
    mocks.ticker.mockResolvedValue([{ from: "USD", to: "IDR", rate: 16_500, observedAt: "2026-11-18T10:00:00Z" }]);
    mocks.price.mockImplementation(async (_org: string, input: PriceCheckInput) => result(input, [row("wise", "Wise", input, 16_500, 160_000)], 16_500));
    const response = await POST(post({ sourceCurrency: "USD", amountSide: "receive", payouts: [{ id: "r1", amount: 50_000_000, currency: "IDR", country: "ID" }] }));
    expect(response.status).toBe(200);
    expect((await response.json()).quotes[0].netPay).toMatchObject({ sent: 3030.3, gap: { kind: "short" }, land: { basis: "estimate" } });
  });

  it("prices send-side sheets as before, at the amount in the sheet", async () => {
    mocks.price.mockImplementation(async (_org: string, input: PriceCheckInput) => result(input, [row("wise", "Wise", input, 93.75, 1000)], 93.75));
    const body = await (await POST(post({ sourceCurrency: "USD", payouts: [{ id: "r1", amount: 1700, currency: "INR", country: "IN" }] }))).json();
    expect(mocks.price).toHaveBeenCalledWith("ORG", expect.objectContaining({ amount: 1700 }));
    expect(body.quotes[0].netPay).toBeUndefined();
    expect(mocks.target).not.toHaveBeenCalled();
  });
});
