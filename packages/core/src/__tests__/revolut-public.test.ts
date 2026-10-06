import { describe, expect, it, vi } from "vitest";
import { revolutPublicReference } from "../public-pricing/revolut.js";
import { comparePrices } from "../pricing.js";

const now = new Date("2026-10-07T00:00:00Z");
const input = { sourceCurrency: "USD", destinationCurrency: "INR", amount: 10000 };
// Shape of the anonymous UK converter response observed on 2026-10-07.
const fixture = () => ({
  sender: { amount: 10000, currency: "USD" },
  recipient: { amount: 961855, currency: "INR" },
  rate: { from: "USD", to: "INR", rate: 96.18557006327628, timestamp: now.getTime() },
  plans: [{ id: "STANDARD", fees: { total: { amount: 0, currency: "USD" } } }],
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("Revolut public FX reference", () => {
  it("uses the anonymous converter, labels the region and keeps transfer costs incomplete", async () => {
    const fetcher = vi.fn(async () => response(fixture()));
    const row = await revolutPublicReference(input, fetcher, now);
    const [url, init] = fetcher.mock.calls[0]! as unknown as [string, RequestInit];
    expect(new URL(url).searchParams.get("country")).toBe("GB");
    expect(new URL(url).searchParams.get("amount")).toBe("10000");
    expect(init.headers).toEqual({ "Accept-Language": "en", Accept: "application/json" });
    expect(row).toMatchObject({ providerSlug: "revolut", basis: "live_public", partial: true, recipientAmount: 961855, feeAmount: 0 });
    expect(row.providerName).toContain("UK Standard");
    expect(row.observedAt).toBe(now.toISOString());
    expect(row.notes.join(" ")).toContain("India-registered");
  });

  it.each(["wrong currency", "wrong amount", "stale rate", "future rate", "missing Standard plan", "invalid rate"])("rejects %s instead of fabricating a quote", async (scenario) => {
    const body = fixture();
    if (scenario === "wrong currency") body.recipient.currency = "EUR";
    if (scenario === "wrong amount") body.sender.amount = 1000;
    if (scenario === "stale rate") body.rate.timestamp -= 10 * 60_000;
    if (scenario === "future rate") body.rate.timestamp += 2 * 60_000;
    if (scenario === "missing Standard plan") body.plans[0]!.id = "PREMIUM";
    if (scenario === "invalid rate") body.rate.rate = -1;
    await expect(revolutPublicReference(input, async () => response(body), now)).rejects.toThrow();
  });

  it("never ranks an FX-only public reference as the best complete transfer price", async () => {
    const fetcher: typeof fetch = async (url) => {
      if (String(url).includes("revolut.com")) return response({ ...fixture(), recipient: { amount: 9999999, currency: "INR" } });
      return response({ rate: 96, sourceCurrency: "USD", paymentOptions: [{ payIn: "BANK_TRANSFER", payOut: "BANK_TRANSFER", disabled: false, targetAmount: 950000, fee: { total: 100 } }] });
    };
    const result = await comparePrices(input, { fetcher, now });
    const row = result.rows.find((r) => r.providerSlug === "revolut")!;
    expect(row).toMatchObject({ partial: true, shortfall: null, totalCostPct: null });
    expect(result.rows[0]!.providerSlug).not.toBe("revolut");
  });

  it("preserves other prices when the public website blocks a request", async () => {
    const fetcher: typeof fetch = async (url) => String(url).includes("revolut.com")
      ? response({}, 403)
      : response({ rate: 96, sourceCurrency: "USD", paymentOptions: [{ payIn: "BANK_TRANSFER", payOut: "BANK_TRANSFER", disabled: false, targetAmount: 950000, fee: { total: 100 } }] });
    const result = await comparePrices(input, { fetcher, now });
    expect(result.rows.some((row) => row.providerSlug === "wise")).toBe(true);
    expect(result.rows.some((row) => row.providerSlug === "revolut")).toBe(false);
    expect(result.unavailable.find((row) => row.providerSlug === "revolut")).toBeDefined();
  });
});
