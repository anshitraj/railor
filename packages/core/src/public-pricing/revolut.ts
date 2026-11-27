import { z } from "zod";
import type { PriceCheckInput, PriceRow } from "../pricing.js";

const money = z.object({ amount: z.number().finite().nonnegative(), currency: z.string() });
const publicQuote = z.object({
  sender: money,
  recipient: money,
  rate: z.object({ from: z.string(), to: z.string(), rate: z.number().finite().positive(), timestamp: z.number().finite() }),
  plans: z.array(z.object({ id: z.string(), fees: z.object({ total: money }) })),
});

/** Countries where Revolut's public exchange quote endpoint returns local Standard-plan rates (verified live 2026-11-26). */
const REVOLUT_COUNTRIES: Record<string, string> = {
  GB: "UK", US: "US", AU: "Australia", SG: "Singapore", CH: "Switzerland", JP: "Japan", NZ: "New Zealand",
  AT: "Austria", BE: "Belgium", DE: "Germany", DK: "Denmark", ES: "Spain", FR: "France",
  IE: "Ireland", IT: "Italy", NL: "Netherlands", NO: "Norway", PL: "Poland", PT: "Portugal", SE: "Sweden",
};

/**
 * The anonymous endpoint used by Revolut's currency-converter widget.
 * Verified live for GB, US, EU, AU, SG on 2026-11-26.
 * Website endpoint, not the authenticated Business API: conversion fees only,
 * with no confirmation of transfer fees or account/corridor eligibility.
 */
export async function revolutPublicReference(input: PriceCheckInput, fetcher: typeof fetch = fetch, now = new Date()): Promise<PriceRow> {
  const source = input.sourceCurrency.toUpperCase();
  const destination = input.destinationCurrency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(source) || !/^[A-Z]{3}$/.test(destination) || source === destination || !Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 10_000_000) {
    throw new Error("Invalid Revolut reference request.");
  }
  const requestedCountry = input.context?.direction === "send" && input.context.country in REVOLUT_COUNTRIES
    ? input.context.country
    : "GB";
  const regionLabel = REVOLUT_COUNTRIES[requestedCountry] ?? "UK";
  const params = new URLSearchParams({ amount: String(input.amount), country: requestedCountry, fromCurrency: source, toCurrency: destination, isRecipientAmount: "false" });
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
    providerName: `Revolut · ${regionLabel} Standard`,
    basis: "live_public",
    fundingLabel: "Revolut balance",
    recipientAmount: quote.recipient.amount,
    feeAmount: standard.fees.total.amount,
    feeCurrency: source,
    rate: quote.rate.rate,
    totalCostPct: null,
    partial: true,
    delivery: null,
    observedAt: new Date(quote.rate.timestamp).toISOString(),
    source: { label: `Revolut ${regionLabel} public FX converter`, url: "https://www.revolut.com/currency-converter/" },
    ...(destination === "EUR" ? {
      missing: ["Sender’s plan, remaining FX allowance and EUR payout route"],
      taxNote: "The converter shows an exchange fee only. Check the transfer details for any other charges.",
      receipt: "The sender can download a PDF confirmation for eligible bank transfers.",
    } : {}),
    senderCountry: requestedCountry,
    notes: [
      `Revolut's ${regionLabel} Standard-plan conversion rate, for someone who already holds a Revolut ${regionLabel} account. Revolut's transfer fee is not included.`,
      "A currency conversion amount, not a guaranteed bank payout or your business account's price.",
      ...(destination === "EUR" ? [
        "Personal Standard lists SEPA EUR bank payouts as free in the UK/EEA. Standard charges 1% on exchange above the rolling monthly fair-usage allowance and 1% on weekend exchange. Other payout routes and business plans have different fees. https://www.revolut.com/legal/standard-fees/",
        "Revolut transfer confirmations: https://help.revolut.com/help/transfers/outbound-transfers/how-to-send-money-to-another-bank/how-do-i-download-my-transfer-confirmation/",
      ] : []),
      ...(destination === "INR" || source === "INR"
        ? ["Revolut can send INR to Indian bank accounts, but standard Revolut accounts can't hold or receive INR, and Revolut India receives domestic UPI only."]
        : []),
      "This observation does not establish eligibility for an India-registered business. Confirm pricing and eligibility with Revolut.",
    ],
  };
}
