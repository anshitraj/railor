import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PriceCheckInput } from "@railor/core";

vi.mock("server-only", () => ({}));
vi.stubEnv("DATABASE_URL", "");
vi.stubEnv("PGLITE_DATA_DIR", mkdtempSync(join(tmpdir(), "railor-quote-snapshot-")));

const { ensureMigrated, getDb, sourceSnapshots } = await import("@railor/database");
const { xoomBankQuoteRow } = await import("@railor/core");
const { loadPublicQuoteObservations, savePublicQuoteObservation } = await import("./public-quote-observations");
const { parseRiaCalculator } = await import("./ria-public-quote");

const input: PriceCheckInput = {
  sourceCurrency: "USD", destinationCurrency: "SGD", destinationCountry: "SG", amount: 1000,
  context: { country: "SG", profile: "personal", direction: "receive", purpose: "personal", paymentMethod: "local_bank" },
};

describe("public quote persistence", () => {
  it("reuses an exact route from storage and refuses another amount, method, or expired observation", async () => {
    await ensureMigrated();
    const now = new Date();
    const row = xoomBankQuoteRow("SGD", input.amount, { received: 1253.3, rate: 1.2533, fee: 4.99, firstTransfer: false }, now)!;
    await savePublicQuoteObservation(input, row);
    await savePublicQuoteObservation(input, row);
    const db = await getDb();
    expect(await db.select({ id: sourceSnapshots.id }).from(sourceSnapshots)).toHaveLength(1);
    expect(await loadPublicQuoteObservations(input, now)).toMatchObject([{ providerSlug: "xoom", recipientAmount: 1253.3, feeAmount: 4.99, costComplete: false }]);
    expect(await loadPublicQuoteObservations({ ...input, amount: 1001 }, now)).toEqual([]);
    expect(await loadPublicQuoteObservations({ ...input, context: { ...input.context!, paymentMethod: "wire" } }, now)).toEqual([]);
    expect(await loadPublicQuoteObservations(input, new Date(now.getTime() + 15 * 60_000))).toEqual([]);
  });
});

describe("Ria public bank calculator", () => {
  const india = { ...input, destinationCurrency: "INR", destinationCountry: "IN", context: { ...input.context!, country: "IN" } };
  const checkedAt = new Date("2026-11-25T06:30:00Z");
  const capture = {
    url: "https://www.riamoneytransfer.com/en-us/send-money-to-india/",
    amount: "1,000.00", payout: "93,627.70", rate: "93.6277 INR",
    totals: "Your first transfer has a promo rate!\nUSD\nINR\nPayment methodBank\nDelivery methodBank\nFee\n0.990 USD first transfer fee\nTotal to pay1,000.00 USD",
  };
  it("returns the validated bank-funded first-transfer offer with a short expiry", () => {
    expect(parseRiaCalculator(capture, india, checkedAt)).toMatchObject({
      providerSlug: "ria", recipientAmount: 93627.7, rate: 93.6277, feeAmount: 0, partial: true,
      publicOffer: { kind: "first_transfer", displayUntil: "2026-11-25T06:33:00.000Z" },
    });
  });

  it("rejects an old payout, a different method or amount, and an expired promo", () => {
    expect(parseRiaCalculator({ ...capture, payout: "46,813.85" }, india, checkedAt)).toBeNull();
    expect(parseRiaCalculator({ ...capture, totals: capture.totals.replace("Payment methodBank", "Payment methodDebit card") }, india, checkedAt)).toBeNull();
    expect(parseRiaCalculator(capture, { ...india, amount: 500 }, checkedAt)).toBeNull();
    expect(parseRiaCalculator(capture, india, new Date("2027-01-01T00:00:00Z"))).toBeNull();
  });
});
