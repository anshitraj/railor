import { describe, expect, it } from "vitest";
import { parsePayslipExtraction } from "../payslip-extraction.js";

const response = (value: unknown, finishReason = "STOP") => ({ text: JSON.stringify(value), candidates: [{ finishReason }] });

describe("payslip extraction", () => {
  it("keeps only net pay, currency and country, dropping anything else the model returns", () => {
    const parsed = parsePayslipExtraction(response({ netPay: "142000.50", currency: "INR", country: "IN", warnings: [], employeeName: "Synthetic Person", pan: "XXXXX0000X" }));
    expect(parsed).toEqual({ netPay: "142000.50", currency: "INR", country: "IN", warnings: [] });
  });

  it("refuses a cut-off answer and figures it can't trust", () => {
    expect(() => parsePayslipExtraction(response({ netPay: "1", currency: "INR", country: "IN", warnings: [] }, "MAX_TOKENS"))).toThrow(/could not be read safely/);
    expect(() => parsePayslipExtraction({ candidates: [] })).toThrow();
    expect(() => parsePayslipExtraction(response({ netPay: "1,42,000", currency: "INR", country: "IN", warnings: [] }))).toThrow();
    expect(() => parsePayslipExtraction(response({ netPay: "142000", currency: "USDC", country: "IN", warnings: [] }))).toThrow();
    expect(() => parsePayslipExtraction(response({ netPay: "142000", currency: "INR", country: "XX", warnings: [] }))).toThrow();
  });

  it("returns nulls, with the reason, when the payslip is unclear", () => {
    expect(parsePayslipExtraction(response({ netPay: null, currency: "EUR", country: null, warnings: ["Two pay periods are shown."] }))).toEqual({ netPay: null, currency: "EUR", country: null, warnings: ["Two pay periods are shown."] });
  });
});
