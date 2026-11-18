import { describe, expect, it, vi } from "vitest";
import { wisePublicTargetQuote } from "../payments/adapters/wise.js";

const now = new Date("2026-11-18T10:00:00Z");
// Shape of the anonymous /v3/quotes response for a targetAmount request, observed on 2026-11-18.
const body = (target = 142_000) => ({
  rate: 93.4445, sourceCurrency: "USD", targetCurrency: "INR", targetAmount: target, expirationTime: "2026-11-18T10:30:00Z",
  paymentOptions: [
    { payIn: "BANK_TRANSFER", payOut: "BANK_TRANSFER", disabled: false, sourceAmount: 1533.1, targetAmount: target, fee: { total: 13.48 }, price: { total: { value: { amount: 13.48, currency: "USD" } } } },
    { payIn: "DEBIT", payOut: "BANK_TRANSFER", disabled: false, sourceAmount: 1545.99, targetAmount: target, fee: { total: 26.37 } },
    { payIn: "BALANCE", payOut: "BANK_TRANSFER", disabled: true, sourceAmount: 1526.58, targetAmount: target, fee: { total: 6.96 } },
  ],
});

describe("Wise public quote for an exact amount received", () => {
  it("asks for the target amount and returns what to send by bank transfer, fee included", async () => {
    const fetcher = vi.fn(async () => Response.json(body()));
    const quote = await wisePublicTargetQuote({ sourceAsset: "usd", destinationCurrency: "INR", targetAmount: 142_000 }, fetcher, now);
    const [url, init] = fetcher.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("https://api.wise.com/v3/quotes");
    expect(JSON.parse(String(init.body))).toEqual({ sourceCurrency: "USD", targetCurrency: "INR", targetAmount: 142_000 });
    expect(quote).toMatchObject({ sourceAmount: 1533.1, targetAmount: 142_000, rate: 93.4445, feeAmount: 13.48, feeCurrency: "USD", payInLabel: "by bank transfer into Wise", observedAt: now.toISOString() });
  });

  it("refuses a quote for a different amount, a missing rate, or a stablecoin", async () => {
    await expect(wisePublicTargetQuote({ sourceAsset: "USD", destinationCurrency: "INR", targetAmount: 142_000 }, async () => Response.json(body(140_000)), now)).rejects.toThrow(/no matching quote/);
    await expect(wisePublicTargetQuote({ sourceAsset: "USD", destinationCurrency: "INR", targetAmount: 142_000 }, async () => Response.json({ ...body(), rate: 0 }), now)).rejects.toThrow();
    await expect(wisePublicTargetQuote({ sourceAsset: "USD", destinationCurrency: "INR", targetAmount: 142_000 }, async () => new Response("{}", { status: 422 }), now)).rejects.toThrow(/HTTP 422/);
    const never = vi.fn();
    await expect(wisePublicTargetQuote({ sourceAsset: "USD", destinationCurrency: "USDC", targetAmount: 500 }, never as unknown as typeof fetch, now)).rejects.toThrow(/fiat/);
    await expect(wisePublicTargetQuote({ sourceAsset: "USD", destinationCurrency: "INR", targetAmount: 0 }, never as unknown as typeof fetch, now)).rejects.toThrow();
    expect(never).not.toHaveBeenCalled();
  });
});
