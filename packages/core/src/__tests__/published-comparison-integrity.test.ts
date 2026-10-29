import { describe, expect, it } from "vitest";
import { comparePrices, PUBLISHED_PRICING, type PriceCheckInput } from "../pricing.js";
import { skydoFxTime, skydoPublicFx } from "../public-pricing/skydo.js";
import { mulyaPublicFx } from "../public-pricing/mulya.js";

const now = new Date("2026-10-29T12:00:00Z");
const input: PriceCheckInput = { sourceCurrency: "USD", destinationCurrency: "INR", destinationCountry: "IN", amount: 1000, context: { profile: "freelancer", country: "IN", direction: "receive", purpose: "services" } };
const publicQuote = { sourceAmount: 1000, sourceCurrency: "USD", targetCurrency: "INR", rate: 90, expirationTime: "2026-10-29T12:30:00Z", paymentOptions: [{ payIn: "BANK_TRANSFER", payOut: "BANK_TRANSFER", disabled: false, sourceAmount: 1000, targetAmount: 89550, fee: { total: 5 } }] };
const fetcher: typeof fetch = async (url) => String(url).includes("skydo.com/api/fxratelist") ? Response.json([{ base: "USD", target: "INR", fx_rate: 91, api_timestamp: "Oct 29, 2026, 5:30:00 PM" }]) : String(url).includes("revolut") ? new Response("{}", { status: 503 }) : Response.json(publicQuote);

describe("published comparison integrity", () => {
  it("does not recommend a public AED rate as a confirmed UAE bank-funded Wise route", async () => {
    const network: typeof fetch = async () => Response.json({ ...publicQuote, sourceCurrency: "AED" });
    const result = await comparePrices({ sourceCurrency: "AED", destinationCurrency: "INR", amount: 1000, context: { country: "AE", profile: "personal", direction: "send", purpose: "personal" } }, { fetcher: network, now });
    const wise = result.rows.find(row => row.providerSlug === "wise");
    expect(wise).toMatchObject({ partial: true, costComplete: false, shortfall: null });
    expect(wise?.notes.join(" ")).toContain("already held in a Wise balance");
  });
  it("keeps Refrens FX and Salt availability gaps out of complete-price recommendations", async () => {
    const schedule = PUBLISHED_PRICING.find(item => item.slug === "refrens")!;
    expect(schedule.fee(input, 1000)?.amount).toBe(15);
    expect(schedule.fee({ ...input, amount: 10000 }, 10000)?.amount).toBe(60);
    const result = await comparePrices(input, { fetcher, now });
    for (const slug of ["refrens", "salt"]) expect(result.rows.find(row => row.providerSlug === slug)).toMatchObject({ partial: true, costComplete: false, shortfall: null });
  });
  it("uses Skydo's own timestamped FX rather than substituting the reference rate", async () => {
    const result = await comparePrices(input, { fetcher, now });
    const skydo = result.rows.find((row) => row.providerSlug === "skydo")!;
    expect(result.reference?.rate).toBe(90);
    expect(skydo).toMatchObject({ rate: 91, feeAmount: 22.42, recipientAmount: 88959.78, rateSource: { observedAt: now.toISOString(), url: "https://www.skydo.com/api/fxratelist" } });
  });
  it("ranks a cheaper verified standard model instead of pinning Skydo as the winner", async () => {
    const result = await comparePrices(input, { fetcher, now });
    expect(result.rows.find((row) => row.shortfall === 0)?.providerSlug).toBe("infinity");
    expect(result.rows.find((row) => row.providerSlug === "infinity")).toMatchObject({ feeAmount: 5, recipientAmount: 89550, partial: false });
    expect(result.rows.find((row) => row.providerSlug === "payzoll")).toMatchObject({ feeAmount: 10, partial: true, shortfall: null });
    expect(result.rows.find((row) => row.providerSlug === "xflow")?.profileAssessment?.status).toBe("documented");
    expect(result.rows.find((row) => row.providerSlug === "dashx")).toMatchObject({ feeAmount: 3, partial: true, shortfall: null });
  });
  it("uses Mulya's public rate and distinguishes retrieval time from a provider publication date", async () => {
    const network: typeof fetch = async (url, init) => String(url).includes("app.mulya.co/api/site/liveRate/") ? Response.json({ details: { rate: 89.9 } }, { headers: { date: now.toUTCString() } }) : fetcher(url, init);
    const result = await comparePrices(input, { fetcher: network, now });
    const mulya = result.rows.find((row) => row.providerSlug === "mulya")!;
    expect(mulya).toMatchObject({ rate: 89.9, feeAmount: 10, recipientAmount: 89001, rateSource: { observedAt: now.toISOString(), url: "https://app.mulya.co/api/site/liveRate/USDINR" } });
    expect(mulya.notes.join(" ")).toContain("no rate-publication timestamp");
  });
  it("does not let an anomalous public widget manufacture a winning rate", async () => {
    const network: typeof fetch = async (url, init) => String(url).includes("skydo.com/api/fxratelist") ? Response.json([{ base: "USD", target: "INR", fx_rate: 90000, api_timestamp: "Oct 29, 2026, 5:30:00 PM" }]) : fetcher(url, init);
    const result = await comparePrices(input, { fetcher: network, now });
    expect(result.rows.find((row) => row.providerSlug === "skydo")?.rate).toBe(90);
  });
  it("converts the INR-denominated MoneySaver minimum before deducting it from a USD invoice", async () => {
    const result = await comparePrices({ ...input, amount: 1100 }, { fetcher, now });
    expect(result.rows.find((row) => row.providerSlug === "razorpay")).toMatchObject({ feeAmount: 1180, feeCurrency: "INR", recipientAmount: 97820 });
    const schedule = PUBLISHED_PRICING.find((item) => item.slug === "razorpay")!;
    expect(schedule.fee({ ...input, amount: 2000 }, 2000, 90)?.amount).toBe(2124);
  });
  it("applies PayGlocal flat slabs before its headline percentage", () => {
    const schedule = PUBLISHED_PRICING.find((item) => item.slug === "payglocal")!;
    expect(schedule.fee(input, 2000)?.amount).toBe(11.8);
    expect(schedule.fee(input, 2000.01)?.amount).toBe(21.24);
    expect(schedule.fee(input, 7500)?.amount).toBe(21.24);
    expect(schedule.fee(input, 20000)?.amount).toBe(59);
  });
  it("does not invent a standard plan above a provider's published custom-pricing threshold", () => {
    expect(PUBLISHED_PRICING.find((item) => item.slug === "infinity")!.fee(input, 50_000.01)).toBeNull();
    expect(PUBLISHED_PRICING.find((item) => item.slug === "winvesta")!.fee(input, 2000.01)).toBeNull();
    expect(PUBLISHED_PRICING.find((item) => item.slug === "skydo")!.appliesTo({ ...input, destinationCountry: "SG" })).not.toBeNull();
  });
  it("does not promote export-collection models into personal remittance prices", async () => {
    const result = await comparePrices({ ...input, context: { ...input.context!, profile: "personal", purpose: "personal" } }, { fetcher, now });
    for (const slug of ["infinity", "mulya", "razorpay", "payglocal"]) expect(result.rows.some((row) => row.providerSlug === slug)).toBe(false);
  });
});

describe("Mulya public calculator validation", () => {
  it("rejects malformed rates and stale server/cache timestamps", async () => {
    for (const [body, headers] of [[{ details: { rate: "90" } }, {}], [{ details: { rate: -1 } }, {}], [{ details: { rate: 90 } }, { age: "601" }], [{ details: { rate: 90 } }, { date: "Thu, 29 Oct 2026 11:00:00 GMT" }]] as const) {
      const fetcher: typeof fetch = async () => Response.json(body, { headers });
      expect(await mulyaPublicFx(input, fetcher, now)).toBeNull();
    }
  });
});

describe("Skydo public calculator FX validation", () => {
  it("parses IST explicitly and rejects invalid dates", () => {
    expect(skydoFxTime("Oct 29, 2026, 5:30:00 PM")).toBe("2026-10-29T12:00:00.000Z");
    expect(skydoFxTime("Oct 29, 2026, 12:00:00 AM")).toBe("2026-10-28T18:30:00.000Z");
    expect(skydoFxTime("Feb 30, 2026, 5:30:00 PM")).toBeNull();
    expect(skydoFxTime("Oct 29, 2026, 25:00:00 PM")).toBeNull();
    expect(skydoFxTime("2026-10-29")).toBeNull();
  });
  it("rejects missing, stale, future and non-positive rate observations", async () => {
    for (const patch of [{ api_timestamp: null }, { api_timestamp: "Oct 29, 2026, 5:00:00 PM" }, { api_timestamp: "Oct 29, 2026, 6:30:00 PM" }, { fx_rate: 0 }, { fx_rate: "91" }]) {
      const fetcher: typeof fetch = async () => Response.json([{ base: "USD", target: "INR", fx_rate: 91, api_timestamp: "Oct 29, 2026, 5:30:00 PM", ...patch }]);
      expect(await skydoPublicFx(input, fetcher, now)).toBeNull();
    }
  });
});
