import { describe, expect, it, vi } from "vitest";
import { readMoney2IndiaSheet } from "./money2india-evidence";

vi.mock("server-only", () => ({}));

const sheet = `<table><tr><th>Country</th><th>Exchange Rate (INR)</th><th>Service Charges</th></tr>
  <tr><td rowspan="2">USA</td><td rowspan="2">92.88</td><td>Below USD 1,000 – USD 4 fee</td></tr>
  <tr><td>USD 1000 &amp; above – Zero fee</td></tr><tr><td>UAE</td><td>25.29</td><td>12 AED</td></tr></table>
  <p>As on November 19, 2026 at 05:00 PM IST. Exchange rates are volatile.</p>`;
const query = { sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000 };

describe("Money2India published FX evidence", () => {
  it("uses the bank's timestamp and preserves both USD fee bands", () => {
    const evidence = readMoney2IndiaSheet(sheet, query, new Date("2026-11-19T12:00:00Z"));
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ providerSlug: "icici-bank", observedAt: "2026-11-19T11:30:00.000Z" });
    expect(evidence[0]?.summary).toContain("1 USD = 92.88 INR");
    expect(evidence[0]?.summary).toContain("USD 4 fee");
    expect(evidence[0]?.summary).toContain("Zero fee");
    expect(evidence[0]).not.toHaveProperty("recipientAmount");
  });

  it("omits an undated, future or outdated sheet", () => {
    expect(readMoney2IndiaSheet(sheet.split("<p>")[0]!, query, new Date("2026-11-19T12:00:00Z"))).toEqual([]);
    expect(readMoney2IndiaSheet(sheet, query, new Date("2026-11-19T11:00:00Z"))).toEqual([]);
    expect(readMoney2IndiaSheet(sheet, query, new Date("2026-11-27T12:00:00Z"))).toEqual([]);
  });
});
