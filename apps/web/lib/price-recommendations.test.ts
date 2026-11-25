import { describe, expect, it } from "vitest";
import type { PriceRow } from "@railor/core";
import { priceRowKey } from "./price-display";
import { recommendedPriceRows } from "./price-recommendations";
const row = (providerSlug: string, amount: number, extra: Partial<PriceRow> = {}) => ({ providerSlug, recipientAmount: amount, basis: "published", partial: false, costComplete: true, feeAmount: 10, profileAssessment: { status: "documented", priceApplicable: true }, ...extra }) as PriceRow;
describe("provider comparison recommendations", () => {
  it("keeps the complete winner and brings a potentially cheaper known-fee reference into view", () => {
    const winner = row("complete", 990), partial = row("known-fee", 997, { partial: true, costComplete: false });
    const original = [winner, row("second", 980), row("third", 970), partial];
    expect(recommendedPriceRows(original, winner).map((value) => value.providerSlug)).toEqual(["complete", "known-fee", "second", "third"]);
    expect(original[1]?.providerSlug).toBe("second");
    expect(partial.partial).toBe(true);
  });
  it("does not promote FX-only, unknown-profile, dated-market or contradicted references", () => {
    const winner = row("complete", 990);
    for (const extra of [{ basis: "exact", partial: true }, { basis: "market_estimate", partial: true }, { partial: true, costComplete: false, profileAssessment: { status: "unconfirmed", priceApplicable: false } }, { partial: true, costComplete: false, webChecks: [{ state: "contradicted" }] }]) {
      const other = row("unconfirmed", 999, extra as Partial<PriceRow>);
      expect(recommendedPriceRows([winner, row("second", 980), other], winner)[1]?.providerSlug).toBe("second");
    }
  });
  it("preserves all unique providers and pins no more than two promising references", () => {
    const winner = row("complete", 990);
    const rows = [winner, ...[995, 997, 999].map((amount) => row(`partial-${amount}`, amount, { partial: true, costComplete: false }))];
    const result = recommendedPriceRows(rows, winner);
    expect(result.map((value) => value.providerSlug)).toEqual(["complete", "partial-999", "partial-997", "partial-995"]);
    expect(new Set(result.map((value) => value.providerSlug)).size).toBe(rows.length);
  });

  it("keeps independently selectable products from the same provider", () => {
    const account = row("wise", 990, { product: { id: "wise:receive", label: "Wise receiving account" } });
    const remittance = row("wise", 982, { product: { id: "wise:send", label: "Client sends with Wise" } });
    expect(priceRowKey(account)).not.toBe(priceRowKey(remittance));
    expect(recommendedPriceRows([remittance, account], account)).toEqual([account, remittance]);
  });
});
