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
