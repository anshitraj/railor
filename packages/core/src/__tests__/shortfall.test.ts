import { afterEach, describe, expect, it, vi } from "vitest";
import { chargeAmount, investigateShortfall, rateTerms, type RawCharge, type ShortfallInput, type ShortfallModel } from "../shortfall.js";
import { settleReceipt, type QuoteSnapshot, type ReceiptFx } from "../settlement.js";
import { frontierModels, modelUnavailable, withFrontierModel } from "../frontier-model.js";

const quote: QuoteSnapshot = {
  providerSlug: "infinity", providerName: "Infinity", product: "Infinity · receive by bank transfer", basis: "published", expected: 156_952.26, feeAmount: 8.5, feeCurrency: "USD",
  rate: 92.3, partial: false, missing: [], sourceLabel: "Infinity", sourceUrl: "https://www.infinityapp.in/faqs", observedAt: null, delivery: null, taxIncluded: false,
};
const fx: ReceiptFx = { source: "ECB", sourceUrl: "https://ecb.example", quoteDate: "2026-11-24", quoteRate: 92.79, receivedDate: "2026-11-24", receivedRate: 92.79 };
const input = (credited: number, overrides: Partial<ShortfallInput> = {}): ShortfallInput => ({
  provider: { slug: "infinity", name: "Infinity", domain: "infinityapp.in" }, quote, quoteAmount: 1700, allocated: 1700, invoiceCurrency: "USD", settlementCurrency: "INR",
  clientCountry: "US", accountCountry: "IN", purpose: "services", paymentMethod: "local_bank",
  settlement: settleReceipt({ expected: quote.expected, quoteAmount: 1700 }, { allocated: 1700, credited, fx }), ...overrides,
});

const OWN_PAGE = { url: "https://www.infinityapp.in/pricing", title: "Infinity pricing", text: `Pricing for receiving payments. We charge 0.5% on every payment. GST at 18% is charged on our fee. Correspondent banks may deduct up to USD 15 from an incoming wire before it reaches us. ${"Filler about the service. ".repeat(20)}` };
const OTHER_PAGE = { url: "https://blog.example.com/review", title: "A review", text: `A review of the service. Some readers report a bank charge of INR 500 on inward remittances. ${"More filler words here. ".repeat(20)}` };

const model = (charges: RawCharge[], citations = [{ uri: "https://x/1", title: "p" }, { uri: "https://x/2", title: "q" }]): ShortfallModel => ({
  name: "gemini-4-argon",
  search: vi.fn(async () => ({ queries: ["infinity fees gst"], citations })),
  extract: vi.fn(async () => ({ charges })),
});
const fetcher = async (uri: string) => (uri.endsWith("/1") ? OTHER_PAGE : OWN_PAGE);

describe("investigating missing money", () => {
  it("keeps only charges a fetched page backs, works out the amounts itself, and ranks the provider's own pages first", async () => {
    const charges: RawCharge[] = [
      { label: "GST on the fee", kind: "tax", sourceId: 1, quote: "GST at 18% is charged on our fee.", ruleType: "percent", value: 18, of: "fee", separateFromHeadline: true },
      { label: "Correspondent bank deduction", kind: "intermediary", sourceId: 1, quote: "Correspondent banks may deduct up to USD 15 from an incoming wire before it reaches us.", ruleType: "flat", value: 15, currency: "USD", separateFromHeadline: true },
      { label: "Invented charge", kind: "other", sourceId: 1, quote: "We secretly charge 5% on everything.", ruleType: "percent", value: 5, of: "amount", separateFromHeadline: true },
      { label: "Percent not printed", kind: "fx_markup", sourceId: 1, quote: "We charge 0.5% on every payment.", ruleType: "percent", value: 2, of: "amount", separateFromHeadline: true },
      { label: "Already in the fee", kind: "provider_fee", sourceId: 1, quote: "We charge 0.5% on every payment.", ruleType: "percent", value: 0.5, of: "amount", separateFromHeadline: false },
      { label: "Card-only surcharge", kind: "provider_fee", sourceId: 1, quote: "We charge 0.5% on every payment.", ruleType: "unquantified", separateFromHeadline: true, appliesToThisPayment: false },
      { label: "Bank charge", kind: "bank_charge", sourceId: 2, quote: "Some readers report a bank charge of INR 500 on inward remittances.", ruleType: "flat", value: 500, currency: "INR", separateFromHeadline: true },
    ];
    // The pages are returned in citation order [other, own]; the provider's own page is sorted first, so [1] is Infinity's.
    const result = await investigateShortfall(input(154_838), { model: model(charges), fetchSource: fetcher });
    expect(result.status).toBe("found");
    expect(result.shortfall).toBeCloseTo(2114.26, 1);
    const byLabel = Object.fromEntries(result.causes.map((cause) => [cause.label, cause]));
    expect(Object.keys(byLabel)).toEqual(expect.arrayContaining(["GST on the fee", "Correspondent bank deduction", "Percent not printed", "Bank charge"]));
    expect(byLabel["Invented charge"]).toBeUndefined();
    expect(byLabel["Already in the fee"]).toBeUndefined();
    expect(byLabel["Card-only surcharge"]).toBeUndefined();
    // 18% of an 8.50 USD fee at 92.3 INR per USD, and a flat USD 15, converted by the quote's own rate.
    expect(byLabel["GST on the fee"]).toMatchObject({ amount: 141.22, official: true, fits: true, rule: { type: "percent", value: 18, of: "fee" } });
    expect(byLabel["Correspondent bank deduction"]).toMatchObject({ amount: 1384.5, official: true, fits: true });
    // A figure the quote does not print is never used; the charge stays, unquantified.
    expect(byLabel["Percent not printed"]).toMatchObject({ rule: { type: "unquantified" }, amount: null, fits: false });
    // A third-party page can be listed but never counted.
    expect(byLabel["Bank charge"]).toMatchObject({ official: false, amount: 500 });
    expect(result.causes[0]!.official).toBe(true);
    expect(result.explainable).toBeCloseTo(141.22 + 1384.5, 2);
    expect(result.remaining).toBeCloseTo(result.shortfall - result.explainable, 2);
    expect(result.note).toMatch(/dropped/);
    expect(result.pages.map((page) => page.url)).toEqual([OWN_PAGE.url, OTHER_PAGE.url]);
  });

  it("never lets an answer that cited nothing through", async () => {
    const result = await investigateShortfall(input(154_838), { model: model([{ label: "x", kind: "other", sourceId: 1, quote: "y", ruleType: "unquantified", separateFromHeadline: true }], []), fetchSource: fetcher });
    expect(result).toMatchObject({ status: "nothing_found", causes: [], note: expect.stringContaining("without searching") });
  });

  it("says plainly when the pages list nothing extra", async () => {
    const result = await investigateShortfall(input(154_838), { model: model([]), fetchSource: fetcher });
    expect(result).toMatchObject({ status: "nothing_found", explainable: 0, note: expect.stringContaining("don’t list a charge") });
    expect(result.remaining).toBeCloseTo(result.shortfall, 2);
  });

  it("does not ask the model anything when nothing is missing", async () => {
    const fake = model([]);
    const result = await investigateShortfall(input(156_900), { model: fake, fetchSource: fetcher });
    expect(result.status).toBe("not_needed");
    expect(fake.search).not.toHaveBeenCalled();
  });

  it("reports when none of the cited pages could be read", async () => {
    const result = await investigateShortfall(input(154_838), { model: model([]), fetchSource: async () => { throw new Error("blocked"); } });
    expect(result).toMatchObject({ status: "nothing_found", note: expect.stringContaining("could be fetched") });
  });
});

describe("charge amounts and rate terms", () => {
  const ctx = { quote, quoteAmount: 1700, allocated: 1700, invoiceCurrency: "USD", settlementCurrency: "INR" };
  it("works amounts out from the quote's own fee and rate", () => {
    expect(chargeAmount({ type: "flat", value: 500, currency: "INR" }, ctx)).toBe(500);
    expect(chargeAmount({ type: "flat", value: 15, currency: "USD" }, ctx)).toBe(1384.5);
    expect(chargeAmount({ type: "flat", value: 15, currency: "EUR" }, ctx)).toBeNull();
    expect(chargeAmount({ type: "percent", value: 1, of: "amount" }, ctx)).toBe(1569.1);
    expect(chargeAmount({ type: "percent", value: 18, of: "fee" }, ctx)).toBe(141.22);
    expect(chargeAmount({ type: "percent", value: 18, of: "fee" }, { ...ctx, allocated: 850 })).toBe(70.61);
    expect(chargeAmount({ type: "unquantified" }, ctx)).toBeNull();
    expect(chargeAmount({ type: "percent", value: 18, of: "fee" }, { ...ctx, quote: { ...quote, feeAmount: null } })).toBeNull();
  });

  it("sets the rate that arrived beside mid-market and the rate the quote assumed", () => {
    const terms = rateTerms(input(90_000, { quoteAmount: 1700 }));
    expect(terms?.effectiveRate).toBeCloseTo(52.9412, 3);
    const good = rateTerms({ ...input(154_838), settlement: settleReceipt({ expected: quote.expected, quoteAmount: 1700 }, { allocated: 1700, credited: 154_838, fx }) });
    expect(good).toMatchObject({ midRate: 92.79 });
    expect(good!.belowMidPct).toBeCloseTo(1.83, 1);
    expect(good!.quotedBelowMidPct).toBeCloseTo(0.5, 1);
  });
});

describe("frontier model chain", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("starts with Gemini 4 Argon and can be overridden without a release", () => {
    expect(frontierModels()[0]).toBe("gemini-4-argon");
    vi.stubEnv("RAILOR_FRONTIER_MODEL", "gemini-5-next, gemini-4-argon");
    expect(frontierModels()).toEqual(["gemini-5-next", "gemini-4-argon"]);
  });

  it("moves to the next model when one is unavailable, but surfaces real failures", async () => {
    const attempt = vi.fn(async (name: string) => { if (name === "a") throw Object.assign(new Error("models/a is not found"), { status: 404 }); return `answered by ${name}`; });
    expect(await withFrontierModel(attempt, ["a", "b"])).toEqual({ value: "answered by b", model: "b" });
    await expect(withFrontierModel(async () => { throw new Error("The request was blocked"); }, ["a", "b"])).rejects.toThrow("blocked");
    expect(modelUnavailable({ status: 429 })).toBe(true);
    expect(modelUnavailable(new Error("quota exceeded"))).toBe(true);
    expect(modelUnavailable(new Error("boom"))).toBe(false);
  });
});
