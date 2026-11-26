import { describe, expect, it, vi } from "vitest";
import { comparePrices, type PriceCheckInput } from "../pricing.js";
import { airwallexPublicReference } from "../public-pricing/airwallex.js";

const now = new Date("2026-11-18T15:26:00Z");
const input = {
  sourceCurrency: "USD", destinationCurrency: "INR", destinationCountry: "IN", amount: 1000,
  context: { country: "US", profile: "business", direction: "send", purpose: "services" },
} satisfies PriceCheckInput;
const response = { ccyPair: "USDINR", sellAmount: 1000, buyAmount: 93421.86, clientRate: 93.42186, awxRate: 93.42186, createdAt: now.getTime() };

describe("Airwallex's public FX reference", () => {
  it("reads the inverse EURUSD rate as EUR per dollar, before fees", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({
      ...response, ccyPair: "EURUSD", buyAmount: 911.49, clientRate: 1.097108, awxRate: 1.097108,
    }));
    const row = await airwallexPublicReference({ ...input, destinationCurrency: "EUR", destinationCountry: "DE" }, fetcher, now);
    expect(row).toMatchObject({ recipientAmount: 911.49, feeAmount: null, partial: true });
    expect(row?.rate).toBeCloseTo(.91149, 5);
  });
  it("appears as a partial price with no fee assumption or winning rank", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => String(url).includes("airwallex.com/api/fx/") ? Response.json(response) : new Response(null, { status: 503 }));
    const result = await comparePrices(input, { fetcher, now });
    const row = result.rows.find(item => item.providerSlug === "airwallex");
    expect(row).toMatchObject({ basis: "live_public", partial: true, costComplete: false, feeAmount: null, recipientAmount: 93421.86, shortfall: null, totalCostPct: null });
    expect(fetcher.mock.calls.find(([url]) => String(url).includes("airwallex"))?.[0]).toContain("sellAmount=1000&sellCcy=USD&buyCcy=INR&feePercent=0");
  });

  it("does not fetch a US sender reference for an Indian recipient or another funding rail", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(airwallexPublicReference({ ...input, context: { ...input.context, country: "IN", direction: "receive" } }, fetcher, now)).resolves.toBeNull();
    await expect(airwallexPublicReference({ ...input, context: { ...input.context, paymentMethod: "wire" } }, fetcher, now)).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    { ccyPair: "USDGBP" }, { sellAmount: 999 }, { buyAmount: 93000 }, { createdAt: now.getTime() - 301_000 },
  ])("rejects a stale or mismatched response: %j", async (patch) => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ ...response, ...patch }));
    await expect(airwallexPublicReference(input, fetcher, now)).resolves.toBeNull();
  });

  it("supports expanded multi-currency business pairs such as GBP to INR and GBP to EUR", async () => {
    const gbpInrFetcher = vi.fn<typeof fetch>(async () => Response.json({
      ccyPair: "GBPINR", sellAmount: 1000, buyAmount: 121111.21, clientRate: 121.111212, awxRate: 121.111212, createdAt: now.getTime(),
    }));
    const gbpInr = await airwallexPublicReference({
      sourceCurrency: "GBP", destinationCurrency: "INR", destinationCountry: "IN", amount: 1000,
      context: { country: "GB", profile: "business", direction: "send", purpose: "services" },
    }, gbpInrFetcher, now);
    expect(gbpInr).toMatchObject({ providerSlug: "airwallex", recipientAmount: 121111.21, rate: 121.111212, partial: true });

    const gbpEurFetcher = vi.fn<typeof fetch>(async () => Response.json({
      ccyPair: "EURGBP", sellAmount: 1000, buyAmount: 1194.37, clientRate: 0.837262, awxRate: 0.837262, createdAt: now.getTime(),
    }));
    const gbpEur = await airwallexPublicReference({
      sourceCurrency: "GBP", destinationCurrency: "EUR", destinationCountry: "DE", amount: 1000,
      context: { country: "GB", profile: "business", direction: "send", purpose: "services" },
    }, gbpEurFetcher, now);
    expect(gbpEur).toMatchObject({ providerSlug: "airwallex", recipientAmount: 1194.37, partial: true });
    expect(gbpEur?.rate).toBeCloseTo(1.19437, 4);
  });
});
