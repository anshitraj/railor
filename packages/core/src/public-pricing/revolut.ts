import { z } from "zod";
import type { PriceCheckInput, PriceRow } from "../pricing.js";

const money = z.object({ amount: z.number().finite().nonnegative(), currency: z.string() });
const publicQuote = z.object({
  sender: money,
  recipient: money,
  rate: z.object({ from: z.string(), to: z.string(), rate: z.number().finite().positive(), timestamp: z.number().finite() }),
  plans: z.array(z.object({ id: z.string(), fees: z.object({ total: money }) })),
});

/**
 * The anonymous endpoint used by Revolut's UK currency-converter widget.
 * Verified against its public widget script and a live response on 2026-10-07.
 * Website endpoint, not the authenticated Business API: conversion fees only,
 * with no confirmation of transfer fees or account/corridor eligibility.
 */
export async function revolutPublicReference(input: PriceCheckInput, fetcher: typeof fetch = fetch, now = new Date()): Promise<PriceRow> {
  const source = input.sourceCurrency.toUpperCase();
  const destination = input.destinationCurrency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(source) || !/^[A-Z]{3}$/.test(destination) || source === destination || !Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 10_000_000) {
    throw new Error("Invalid Revolut reference request.");
  }
  const params = new URLSearchParams({ amount: String(input.amount), country: "GB", fromCurrency: source, toCurrency: destination, isRecipientAmount: "false" });
  const response = await fetcher(`https://www.revolut.com/api/exchange/quote?${params}`, {
    headers: { "Accept-Language": "en", Accept: "application/json" },
    signal: AbortSignal.timeout(4_000),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Public reference unavailable (HTTP ${response.status}).`);
  const quote = publicQuote.parse(await response.json());
  const standard = quote.plans.find((plan) => plan.id === "STANDARD");
  const age = now.getTime() - quote.rate.timestamp;
  if (!standard || quote.sender.currency !== source || quote.recipient.currency !== destination || quote.rate.from !== source || quote.rate.to !== destination
    || Math.abs(quote.sender.amount - input.amount) > 0.000001 || quote.recipient.amount <= 0 || standard.fees.total.currency !== source
    || age > 5 * 60_000 || age < -60_000) {
    throw new Error("Public reference did not match this request or was out of date.");
  }
  return {
    providerSlug: "revolut",
    providerName: "Revolut · UK Standard",
    basis: "live_public",
    recipientAmount: quote.recipient.amount,
    feeAmount: standard.fees.total.amount,
    feeCurrency: source,
    rate: quote.rate.rate,
    totalCostPct: null,
    partial: true,
    delivery: null,
    observedAt: new Date(quote.rate.timestamp).toISOString(),
    source: { label: "Revolut UK public FX converter", url: "https://www.revolut.com/currency-converter/" },
    notes: [
      "UK Standard personal-plan FX reference. Bank-transfer fees are not included.",
      "A currency conversion amount, not a guaranteed bank payout or your business account's price.",
      "This observation does not establish eligibility for an India-registered business. Confirm pricing and eligibility with Revolut.",
    ],
  };
}
