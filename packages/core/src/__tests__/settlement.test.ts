import { describe, expect, it } from "vitest";
import { combineSettlements, fxMoveFor, pickQuote, settleReceipt, settlementTolerance, type ReceiptFx } from "../settlement.js";

const fx = (quoteRate: number, receivedRate: number): ReceiptFx => ({ source: "ECB", sourceUrl: "https://example.test", quoteDate: "2026-11-16", quoteRate, receivedDate: "2026-11-24", receivedRate });
// $1,700 quoted at 156,952.26 INR (about 92.32 per dollar after a 0.5% fee).
const quote = { expected: 156_952.26, quoteAmount: 1700 };

describe("quote-to-credit settlement", () => {
  it("calls a credit within rounding 'on target'", () => {
    const result = settleReceipt(quote, { allocated: 1700, credited: 156_900 });
    expect(result.verdict).toBe("on_target");
    expect(result.gap).toBeCloseTo(-52.26, 2);
  });

  it("blames the market, not a fee, when the rate moved by the same amount", () => {
    // ECB USD/INR fell from 94.02 to 92.79: about 1.31% less INR for the same dollars.
    const move = fxMoveFor(quote.expected, fx(94.02, 92.79))!;
    expect(move).toBeCloseTo(-2053.4, 0);
    const result = settleReceipt(quote, { allocated: 1700, credited: quote.expected + move, fx: fx(94.02, 92.79) });
    expect(result).toMatchObject({ verdict: "fx_only", fxChecked: true });
    expect(result.unexplained).toBeCloseTo(0, 2);
    expect(result.fxPct).toBeCloseTo(-1.31, 2);
  });

  it("separates market movement, named charges and the unexplained remainder", () => {
    const rate = fx(93, 92.5); // −0.5376%
    const move = fxMoveFor(quote.expected, rate)!;
    const credited = quote.expected + move - 168 - 500; // a bank charge of 168 and 500 nobody explains
    const result = settleReceipt(quote, { allocated: 1700, credited, deductions: [{ label: "Bank charge", amount: 168 }], fx: rate });
    expect(result.verdict).toBe("short");
    expect(result.deductionsTotal).toBe(168);
    expect(result.unexplained).toBeCloseTo(-500, 1);
    expect(result.credited - result.expected).toBeCloseTo(result.fxMove! - 168 + result.unexplained, 1);
  });

  it("says 'explained' when market movement and named charges cover everything", () => {
    const rate = fx(93, 92.5);
    const move = fxMoveFor(quote.expected, rate)!;
    const result = settleReceipt(quote, { allocated: 1700, credited: quote.expected + move - 236, deductions: [{ label: "GST on fee", amount: 236 }], fx: rate });
    expect(result.verdict).toBe("explained");
    expect(Math.abs(result.unexplained)).toBeLessThanOrEqual(result.tolerance);
  });

  it("never attributes an unchecked gap to the market", () => {
    const result = settleReceipt(quote, { allocated: 1700, credited: quote.expected - 3000 });
    expect(result).toMatchObject({ verdict: "short", fxChecked: false, fxMove: null });
    expect(result.unexplained).toBeCloseTo(-3000, 2);
  });

  it("flags more money than the quote and the market explain", () => {
    expect(settleReceipt(quote, { allocated: 1700, credited: quote.expected + 4000, fx: fx(93, 93) }).verdict).toBe("better");
  });

  it("compares a part payment with the same part of the quote", () => {
    const result = settleReceipt(quote, { allocated: 850, credited: 78_476.13 });
    expect(result.expected).toBeCloseTo(78_476.13, 2);
    expect(result.verdict).toBe("on_target");
  });

  it("carries a partial quote's missing cost into the result so a shortfall can be read against it", () => {
    const result = settleReceipt({ ...quote, partial: true, missing: ["e-FIRC charge"] }, { allocated: 1700, credited: quote.expected - 190 });
    expect(result.verdict).toBe("on_target"); // 190 INR is within the 0.25% tolerance of 156,952
    const bigger = settleReceipt({ ...quote, partial: true, missing: ["e-FIRC charge"] }, { allocated: 1700, credited: quote.expected - 900 });
    expect(bigger).toMatchObject({ verdict: "short", quotePartial: true, quoteMissing: ["e-FIRC charge"] });
  });

  it("combines several credits for one invoice", () => {
    const rate = fx(93, 92.5);
    const first = settleReceipt(quote, { allocated: 1000, credited: 90_000, fx: rate });
    const second = settleReceipt(quote, { allocated: 700, credited: 62_000, fx: rate });
    const all = combineSettlements([first, second])!;
    expect(all.expected).toBeCloseTo(first.expected + second.expected, 2);
    expect(all.credited).toBe(152_000);
    expect(all.fxChecked).toBe(true);
    const unchecked = combineSettlements([first, settleReceipt(quote, { allocated: 700, credited: 62_000 })])!;
    expect(unchecked.fxChecked).toBe(false);
    expect(combineSettlements([])).toBeNull();
  });

  it("needs at least one rupee, or a quarter of a percent, to call a difference real", () => {
    expect(settlementTolerance(100)).toBe(1);
    expect(settlementTolerance(200_000)).toBe(500);
  });

  it("matches a credit to the provider it came through, else the chosen quote", () => {
    const candidates = [{ providerSlug: "infinity", providerName: "Infinity" }, { providerSlug: "skydo", providerName: "Skydo" }, { providerSlug: "wise", providerName: "Wise Business" }];
    expect(pickQuote(candidates, "infinity", "skydo")?.providerSlug).toBe("skydo");
    expect(pickQuote(candidates, "infinity", "Wise")?.providerSlug).toBe("wise");
    expect(pickQuote(candidates, "infinity", "Some other bank")?.providerSlug).toBe("infinity");
    expect(pickQuote(candidates, null, undefined)).toBeNull();
  });
});

describe("receipt drafts", () => {
  it("needs only the credit, the date and the confirmation", async () => {
    const { ReceiptDraft, ExtractedReceipt } = await import("../freelancer.js");
    const draft = ReceiptDraft.parse({ settlementAmount: "154778", receivedDate: "2026-11-24", confirmed: true, requestId: "7f1f1c0e-2f55-4c06-9d4f-0a6a2a3d2a11" });
    expect(draft).toMatchObject({ settlementAmount: "154778", deductions: [] });
    expect(draft.reference).toBeUndefined();
    expect(() => ReceiptDraft.parse({ settlementAmount: "154778", receivedDate: "2026-11-24", confirmed: false, requestId: "7f1f1c0e-2f55-4c06-9d4f-0a6a2a3d2a11" })).toThrow();
    expect(() => ReceiptDraft.parse({ settlementAmount: "0", settlementCurrency: "INR", receivedDate: "2026-11-24", confirmed: true, requestId: "7f1f1c0e-2f55-4c06-9d4f-0a6a2a3d2a11" })).toThrow();
    expect(ReceiptDraft.parse({ settlementAmount: "10", receivedDate: "2026-11-24", confirmed: true, requestId: "7f1f1c0e-2f55-4c06-9d4f-0a6a2a3d2a11", deductions: [{ label: "Bank charge", amount: "118" }] }).deductions).toEqual([{ label: "Bank charge", amount: "118" }]);
    // A credit advice with no itemised charges still parses.
    expect(ExtractedReceipt.parse({ reference: null, providerName: null, sourceAmount: null, sourceCurrency: null, settlementAmount: "8500", settlementCurrency: "INR", receivedDate: null, warnings: [] }).deductions).toEqual([]);
  });
});
