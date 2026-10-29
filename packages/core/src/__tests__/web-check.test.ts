import { describe, expect, it, vi } from "vitest";
import { comparePrices, type PriceRow } from "../pricing.js";
import { applyWebChecks, htmlToText, priceCheckClaims, quoteAddresses, quoteOnPage, runWebCheck, type FetchedSource, type WebCheckClaim, type WebCheckModel, type WebCheckResult } from "../web-check.js";
import type { CustomerContext } from "../customer-profiles.js";

const personal: CustomerContext = { profile: "personal", country: "IN", direction: "receive", purpose: "personal" };
const business: CustomerContext = { profile: "business", country: "IN", direction: "receive", purpose: "services" };
const wiseBody = { id: "q", sourceAmount: 1000, sourceCurrency: "USD", targetCurrency: "INR", rate: 96, expirationTime: "2099-01-01T00:00:00Z", paymentOptions: [{ payIn: "BANK_TRANSFER", payOut: "BANK_TRANSFER", disabled: false, sourceAmount: 1000, targetAmount: 95000, fee: { total: 11 } }] };
const now = new Date("2026-10-08T09:00:00Z");
const revolutBody = { sender: { amount: 1000, currency: "USD" }, recipient: { amount: 96600, currency: "INR" }, rate: { from: "USD", to: "INR", rate: 96.6, timestamp: now.getTime() }, plans: [{ id: "STANDARD", fees: { total: { amount: 0, currency: "USD" } } }] };
const fetcher: typeof fetch = async (url) => {
  if (String(url).includes("revolut.com")) return Response.json(revolutBody);
  if (String(url).includes("/v4/comparisons")) return Response.json({ providers: [{ alias: "remitly", name: "Remitly", quotes: [{ receivedAmount: 96500, rate: 96.5, fee: 0 }] }] });
  return Response.json(wiseBody);
};

const WISE_PAGE = "Guide to INR transfers. You can send INR to someone’s bank account in India, including NRE and NRO accounts, or UPI ID. Because of how we’re regulated, you can’t make transfers to India for investment or charitable donation. Our support team is available every day, including public holidays.";

function model(judgement: Awaited<ReturnType<WebCheckModel["judge"]>>, citations = [{ uri: "https://wise.com/help/inr", title: "wise.com" }]): WebCheckModel {
  return { name: "test-model", search: vi.fn(async () => ({ queries: ["wise usd to inr india"], citations })), judge: vi.fn(async () => judgement) };
}
const pages: Record<string, FetchedSource> = {
  "https://wise.com/help/inr": { url: "https://wise.com/help/inr", title: "Guide to INR transfers | Wise Help Centre", text: WISE_PAGE },
  "https://blog.example.com/wise": { url: "https://blog.example.com/wise", title: "A blog", text: "Some say Wise cannot pay Indian bank accounts in rupees any more, which is untrue." },
};
const fetchSource = async (uri: string) => {
  const page = pages[uri];
  if (!page) throw new Error("not found");
  return page;
};
const wiseClaim: WebCheckClaim = { key: "corridor:wise:x", kind: "corridor", providerSlug: "wise", providerName: "Wise", domain: "wise.com", statement: "Wise lets a customer pay in US Dollar (USD) and have Indian Rupee (INR) paid into a bank account in India." };

describe("the screenshot case: personal money into India", () => {
  it("prices it through a sender's service, never through a Revolut UK converter rate or a business export product", async () => {
    const result = await comparePrices({ sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000, includeMarket: true, context: personal }, { fetcher, now });
    const bySlug = (slug: string) => result.rows.find((r) => r.providerSlug === slug)!;
    expect(bySlug("revolut").profileAssessment).toMatchObject({ status: "not_supported", priceApplicable: false });
    expect(bySlug("revolut").profileAssessment!.reasons.join(" ")).toContain("UPI only");
    for (const slug of ["skydo", "payzoll"]) expect(bySlug(slug).profileAssessment?.status).toBe("not_supported");
    expect(bySlug("wise")).toMatchObject({ side: "payer", partial: false, shortfall: 0, profileAssessment: { status: "documented", priceApplicable: true } });
    // Consumer remittance apps fit personal money: costed, still an estimate that is never "best".
    expect(bySlug("market:remitly")).toMatchObject({ side: "payer", partial: false, shortfall: null });
    expect(bySlug("market:remitly").totalCostPct).not.toBeNull();
  });

  it("never lets a fee-excluded FX figure outrank a full price, with or without a profile", async () => {
    const result = await comparePrices({ sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000 }, { fetcher, now });
    const order = result.rows.map((r) => r.providerSlug);
    expect(result.rows.find((r) => r.providerSlug === "revolut")).toMatchObject({ costComplete: false });
    expect(order.indexOf("wise")).toBeLessThan(order.indexOf("revolut"));
  });

  it("keeps business export collection for businesses and marks the recipient's own products", async () => {
    const result = await comparePrices({ sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000, context: business }, { fetcher, now });
    expect(result.rows.find((r) => r.providerSlug === "skydo")).toMatchObject({ side: "recipient", profileAssessment: { status: "documented" } });
    expect(result.rows.find((r) => r.providerSlug === "revolut")?.profileAssessment?.status).toBe("not_supported");
  });
});

describe("claims a price check makes", () => {
  it("checks the corridor for a sender's service and the profile for a receiving product", async () => {
    let claims: WebCheckClaim[] = [];
    await comparePrices({ sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000, includeMarket: true, context: personal }, {
      fetcher, now, webChecks: async (c) => ((claims = c), { results: [], pending: new Set(), configured: true }),
    });
    const of = (slug: string) => claims.find((c) => c.providerSlug === slug)!;
    expect(of("wise")).toMatchObject({ kind: "corridor", domain: "wise.com" });
    expect(of("wise").statement).toBe("Wise lets a customer pay in US Dollar (USD) and have Indian Rupee (INR) paid into a bank account in India.");
    expect(of("revolut").statement).toBe("An individual (not a business or freelancer) in India can receive personal money such as family support from abroad through Revolut.");
    expect(of("skydo")).toMatchObject({ kind: "profile", domain: "skydo.com" });
    expect(claims.some((c) => c.providerSlug.startsWith("market:"))).toBe(false);
  });

  it("is stable across polls, so a cached verdict is found again", () => {
    const row = { providerSlug: "wise", providerName: "Wise", basis: "live_public" } as PriceRow;
    const input = { sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000 };
    expect(priceCheckClaims(input, [row])[0]!.key).toBe(priceCheckClaims({ ...input, amount: 50 }, [row])[0]!.key);
  });
});

describe("what a verdict does to a row", () => {
  const verdict = (overrides: Partial<WebCheckResult>): WebCheckResult => ({
    key: wiseClaim.key, providerSlug: "wise", kind: "corridor", statement: wiseClaim.statement, verdict: "supported", quote: "x".repeat(30),
    sourceUrl: "https://wise.com/help/inr", sourceTitle: "Wise", official: true, searchQueries: [], pages: [], note: null, model: "m", checkedAt: now.toISOString(), ...overrides,
  });
  const row = (): PriceRow => ({ providerSlug: "wise", providerName: "Wise", basis: "live_public", recipientAmount: 95000, feeAmount: 11, feeCurrency: "USD", rate: 96, totalCostPct: null, partial: false, delivery: null, observedAt: "", source: { label: "Wise" }, notes: [] });

  it("removes a row its provider's own site contradicts, quoting the sentence", () => {
    const rows = [row()];
    const summary = applyWebChecks(rows, [wiseClaim], [verdict({ verdict: "contradicted", quote: "We cannot send INR to bank accounts in India right now." })], new Set());
    expect(rows[0]).toMatchObject({ partial: true, profileAssessment: { status: "not_supported", priceApplicable: false } });
    expect(rows[0]!.profileAssessment!.reasons[0]).toContain("We cannot send INR");
    expect(summary).toMatchObject({ checked: 1, contradicted: 1 });
  });

  it("only flags a third-party contradiction, and never promotes a confirmation", () => {
    const rows = [row()];
    applyWebChecks(rows, [wiseClaim], [verdict({ verdict: "contradicted", official: false })], new Set());
    expect(rows[0]!.profileAssessment).toBeUndefined();
    expect(rows[0]!.webChecks![0]).toMatchObject({ state: "contradicted", conflict: true });
    const excluded = { ...row(), profileAssessment: { status: "not_supported" } } as PriceRow;
    applyWebChecks([excluded], [wiseClaim], [verdict({})], new Set());
    expect(excluded.profileAssessment!.status).toBe("not_supported");
    expect(excluded.webChecks![0]).toMatchObject({ state: "supported", conflict: true });
  });

  it("marks checks still running", () => {
    const rows = [row()];
    expect(applyWebChecks(rows, [wiseClaim], [], new Set([wiseClaim.key])).pending).toBe(1);
    expect(rows[0]!.webChecks![0]!.state).toBe("pending");
  });
});

describe("a verdict only counts when Railor finds the quote itself", () => {
  it("accepts a sentence copied from the provider's own page", async () => {
    const result = await runWebCheck(wiseClaim, { model: model({ verdict: "supported", sourceId: 1, quote: "You can send INR to someone's bank account in India, including NRE and NRO accounts, or UPI ID." }), fetchSource, now: () => now });
    expect(result).toMatchObject({ verdict: "supported", official: true, sourceUrl: "https://wise.com/help/inr", searchQueries: ["wise usd to inr india"] });
  });

  it.each([
    ["an invented sentence", { verdict: "contradicted" as const, sourceId: 1, quote: "Wise has stopped all transfers to bank accounts in India." }, "not found"],
    ["an edited quote", { verdict: "supported" as const, sourceId: 1, quote: "You can send INR to someone's bank account in India … or UPI ID." }, "not found"],
    ["a real sentence about something else", { verdict: "contradicted" as const, sourceId: 1, quote: "Our support team is available every day, including public holidays." }, "does not address"],
    ["a page that was never fetched", { verdict: "supported" as const, sourceId: 4, quote: "You can send INR to someone's bank account in India, including NRE and NRO accounts, or UPI ID." }, "cited no fetched page"],
  ])("downgrades %s to unclear", async (_label, judgement, note) => {
    const result = await runWebCheck(wiseClaim, { model: model(judgement), fetchSource, now: () => now });
    expect(result.verdict).toBe("unclear");
    expect(result.note).toContain(note);
  });

  it("discards an answer that never searched, without reading any page", async () => {
    const fetchSpy = vi.fn(fetchSource);
    const result = await runWebCheck(wiseClaim, { model: model({ verdict: "supported" }, []), fetchSource: fetchSpy });
    expect(result).toMatchObject({ verdict: "unclear" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reads the provider's own pages first and labels independent sources", async () => {
    const m = model({ verdict: "contradicted", sourceId: 2, quote: "Some say Wise cannot pay Indian bank accounts in rupees any more, which is untrue." }, [
      { uri: "https://blog.example.com/wise", title: "blog" }, { uri: "https://wise.com/help/inr", title: "wise" },
    ]);
    const result = await runWebCheck(wiseClaim, { model: m, fetchSource });
    expect(result.pages.map((p) => p.url)).toEqual(["https://wise.com/help/inr", "https://blog.example.com/wise"]);
    expect(result).toMatchObject({ verdict: "contradicted", official: false });
  });
});

describe("verification primitives", () => {
  it("normalizes presentation but not content", () => {
    expect(quoteOnPage("You can send INR to someone's bank account in India", "…You can  send INR to someone’s bank\naccount in India, including…")).toBe(true);
    expect(quoteOnPage("too short", "too short")).toBe(false);
    expect(quoteAddresses("An individual in India can receive personal money from abroad through Revolut.", "You can receive money into your INR Revolut account via UPI transfers only.", "Revolut", "How to transfer funds to Revolut | Revolut India")).toBe(true);
    expect(quoteAddresses("Wise pays INR into a bank account in India.", "Our offices are closed on Sundays and public holidays.", "Wise")).toBe(false);
  });

  it("turns HTML into readable text", () => {
    expect(htmlToText("<html><head><style>p{}</style><script>alert(1)</script></head><body><p>Fees &amp; limits</p><p>Send&nbsp;INR &#8211; fast</p></body></html>")).toBe("Fees & limits\nSend INR – fast");
  });
});
