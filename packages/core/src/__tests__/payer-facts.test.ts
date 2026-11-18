import { describe, expect, it } from "vitest";
import { comparePrices } from "../pricing.js";
import { payerFacts } from "../public-pricing/payer-facts.js";
import type { CustomerContext } from "../customer-profiles.js";

/**
 * Tax and receipt facts for the senders' services in a price check, each read
 * from the provider's own pages on 2026-11-18. Providers whose pages were not
 * read keep "unknown"; providers whose pages say nothing show "not stated".
 */
const now = new Date("2026-11-18T12:00:00Z");
const quote = (collected: string) => ({ rate: 91, fee: 0, receivedAmount: 91_000, dateCollected: collected, sourceCountry: "US", targetCountry: "IN" });
const feed = {
  amount: 1000, sourceCurrency: "USD", targetCurrency: "INR",
  providers: ["remitly", "xoom", "world-remit", "western-union", "ofx", "chase"].map((alias) => ({ alias, name: alias, quotes: [quote("2026-11-18T10:00:00Z")] })),
};
const fetcher: typeof fetch = async (url, init) => {
  if (String(url).includes("/v4/comparisons")) return Response.json(feed);
  if (!String(url).includes("/v3/quotes")) return new Response("{}", { status: 503 });
  const { sourceAmount } = JSON.parse(String(init?.body ?? "{}")) as { sourceAmount: number };
  return Response.json({ sourceAmount, sourceCurrency: "USD", targetCurrency: "INR", rate: 90, expirationTime: "2026-11-18T12:30:00Z", paymentOptions: [{ payIn: "BANK_TRANSFER", payOut: "BANK_TRANSFER", disabled: false, sourceAmount, targetAmount: (sourceAmount - 5) * 90, fee: { total: 5 } }] });
};
const context = (overrides: Partial<CustomerContext> = {}): CustomerContext => ({ profile: "freelancer", country: "IN", direction: "receive", purpose: "services", paymentMethod: "transfer_service", ...overrides });
const check = (overrides?: Partial<CustomerContext>) => comparePrices({ sourceCurrency: "USD", destinationCurrency: "INR", destinationCountry: "IN", amount: 1000, includeMarket: true, context: context(overrides) }, { fetcher, now });

describe("payer-side tax and receipt facts", () => {
  it("answers both questions for Wise from its help centre, by profile", async () => {
    const business = (await check()).rows.find((row) => row.providerSlug === "wise")!;
    expect(business.receipt).toContain("No Objection Certificate (NOC)");
    expect(business.receipt).toContain("FIRA");
    expect(business.taxIncluded).toBeNull();
    expect(business.taxNote).toContain("never reduces what you receive");
    expect(business.notes.join(" ")).toContain("https://wise.com/help/articles/2565007/do-i-need-to-pay-any-tax-on-transfers");
    expect(business.notes.join(" ")).toContain("https://wise.com/help/articles/2655509/");
    // Wise issues a NOC for business INR transfers only.
    const personal = (await check({ profile: "personal", purpose: "personal" })).rows.find((row) => row.providerSlug === "wise")!;
    expect(personal.receipt).toContain("None");
  });

  it("fills what each market provider's own pages state and marks the rest not stated", async () => {
    const rows = Object.fromEntries((await check()).rows.map((row) => [row.providerSlug, row]));
    expect(rows["market:remitly"]).toMatchObject({ taxIncluded: false, receipt: null });
    expect(rows["market:remitly"]!.taxNote).toContain("applicable taxes");
    expect(rows["market:western-union"]).toMatchObject({ taxIncluded: false, receipt: null });
    expect(rows["market:ofx"]).toMatchObject({ taxIncluded: false, receipt: null });
    expect(rows["market:xoom"]).toMatchObject({ taxIncluded: null, receipt: null });
    expect(rows["market:xoom"]!.taxNote).toContain("Local Taxes");
    expect(rows["market:world-remit"]!.taxNote).toContain("no tax is payable");
    for (const slug of ["market:remitly", "market:xoom", "market:world-remit", "market:western-union", "market:ofx"]) expect(rows[slug]!.notes.join(" "), slug).toContain("Tax and receipt facts read 2026-11-18");
  });

  it("leaves a provider whose pages were not read unknown", async () => {
    const chase = (await check()).rows.find((row) => row.providerSlug === "market:chase")!;
    expect(chase.taxIncluded).toBeUndefined();
    expect(chase.receipt).toBeUndefined();
    expect(chase.taxNote).toBeUndefined();
    expect(payerFacts("market:chase")).toBeNull();
  });

  it("looks a provider up by slug, ignoring the market prefix and case", () => {
    expect(payerFacts("wise", context())?.sources).toHaveLength(2);
    expect(payerFacts("market:Remitly")?.taxIncluded).toBe(false);
  });
});
