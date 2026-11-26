import { z } from "zod";
import type { PriceCheckInput, PriceRow } from "../pricing.js";

const indiaCalculator = "https://www.airwallex.com/en-us/business-account/transfers/send-money-to-india";
const europeCalculator = "https://www.airwallex.com/en-us/business-account/transfers/send-money-to-europe";
const singaporeCalculator = "https://www.airwallex.com/en-us/business-account/transfers/send-money-to-singapore";
const usFees = "https://www.airwallex.com/en-us/terms/fee-schedule";
const euroCountries = new Set(["AT", "BE", "BG", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"]);
const AIRWALLEX_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "AUD", "CAD", "SGD", "HKD", "JPY", "CHF", "NZD",
  "INR", "PHP", "MXN", "IDR", "MYR", "VND", "THB", "KRW", "PLN", "SEK", "NOK", "DKK", "AED", "CNY", "ZAR",
]);
const quote = z.object({
  ccyPair: z.string().regex(/^[A-Z]{6}$/),
  sellAmount: z.number().finite().positive(),
  buyAmount: z.number().finite().positive(),
  clientRate: z.number().finite().positive(),
  awxRate: z.number().finite().positive(),
  createdAt: z.number().finite().positive(),
});

export function hasAirwallexPublicReference(input: PriceCheckInput): boolean {
  const context = input.context;
  const sell = input.sourceCurrency.toUpperCase();
  const buy = input.destinationCurrency.toUpperCase();
  if (!AIRWALLEX_CURRENCIES.has(sell) || !AIRWALLEX_CURRENCIES.has(buy) || sell === buy) return false;
  if (!context || context.purpose === "personal" || context.profile === "personal") return false;
  if (context.paymentMethod && context.paymentMethod !== "local_bank" && context.paymentMethod !== "transfer_service") return false;
  // Preserve India receiving guard: Airwallex does not price Indian domestic receiving accounts here.
  if (buy === "INR" && context.direction === "receive" && context.country === "IN") return false;
  if (sell === "USD" && buy === "INR") {
    return context.country === "US" && context.direction === "send" && context.profile === "business"
      && (!context.paymentMethod || context.paymentMethod === "local_bank")
      && input.destinationCountry === "IN";
  }
  if (sell === "USD" && buy === "SGD") {
    const usSender = context.country === "US" && context.direction === "send" && context.profile === "business"
      && (!context.paymentMethod || context.paymentMethod === "local_bank");
    return (!input.destinationCountry || input.destinationCountry === "SG")
      && (usSender || (context.direction === "receive" && (context.country === "SG" || input.destinationCountry === "SG") && (context.paymentMethod === "transfer_service" || context.paymentMethod === "local_bank")));
  }
  if (sell === "USD" && buy === "EUR") {
    const usSender = context.country === "US" && context.direction === "send" && context.profile === "business"
      && (!context.paymentMethod || context.paymentMethod === "local_bank");
    return (!input.destinationCountry || euroCountries.has(input.destinationCountry))
      && (usSender || (context.direction === "receive" && context.paymentMethod === "transfer_service"));
  }
  return context.direction === "send" && context.profile === "business"
    && (!context.paymentMethod || context.paymentMethod === "local_bank");
}

/** Public indicative FX calculator across Airwallex's supported currencies (15/15 pairs verified HTTP 200 on 2026-11-26). Excludes FX markup and payout fees. */
export async function airwallexPublicReference(input: PriceCheckInput, fetcher: typeof fetch, now: Date): Promise<PriceRow | null> {
  if (!hasAirwallexPublicReference(input)) return null;

  const sell = input.sourceCurrency.toUpperCase();
  const buy = input.destinationCurrency.toUpperCase();
  const euro = sell === "USD" && buy === "EUR";
  const singapore = sell === "USD" && buy === "SGD";
  const params = new URLSearchParams({ sellAmount: String(input.amount), sellCcy: sell, buyCcy: buy, feePercent: "0" });
  const response = await fetcher(`https://www.airwallex.com/api/fx/fxRate/indicativeQuote?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(4_000),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) return null;
  const parsed = quote.safeParse(await response.json());
  if (!parsed.success) return null;
  const fx = parsed.data;
  const direct = fx.ccyPair === `${sell}${buy}`;
  const inverse = fx.ccyPair === `${buy}${sell}`;
  if (!direct && !inverse) return null;
  const rate = inverse ? 1 / fx.clientRate : fx.clientRate;
  const age = now.getTime() - fx.createdAt;
  if (Math.abs(fx.sellAmount - input.amount) > .000001 || age < -60_000 || age > 300_000
    || Math.abs(fx.clientRate / fx.awxRate - 1) > .000001
    || Math.abs(fx.buyAmount - fx.sellAmount * rate) > Math.max(1, fx.buyAmount * .002)) return null;

  const senderCountry = input.context?.direction === "send" ? input.context.country : "US";
  const isUs = senderCountry === "US";
  return {
    providerSlug: "airwallex",
    providerName: "Airwallex",
    product: { id: isUs ? "airwallex:us-public-fx" : `airwallex:${senderCountry.toLowerCase()}-public-fx`, label: isUs ? "US business · FX reference" : "Business · FX reference" },
    basis: "live_public",
    recipientAmount: fx.buyAmount,
    feeCurrency: null,
    feeAmount: null,
    rate,
    totalCostPct: null,
    partial: true,
    side: "payer",
    ...(singapore ? { senderCountry: "US", paymentMethods: ["local_bank", "transfer_service"] as PriceRow["paymentMethods"] } : !isUs ? { senderCountry } : {}),
    delivery: null,
    ...(euro ? {
      taxNote: "The standard U.S. local transfer fee excludes applicable GST. Confirm the sender’s actual charges.",
      receipt: "Where available, the sender can download transfer confirmation from their account.",
    } : {}),
    observedAt: new Date(fx.createdAt).toISOString(),
    source: { label: isUs ? "Airwallex US public calculator" : "Airwallex public FX calculator", url: euro ? europeCalculator : singapore ? singaporeCalculator : buy === "INR" ? indiaCalculator : "https://www.airwallex.com/business-account/transfers" },
    missing: ["Airwallex FX markup and payout fee"],
    notes: [
      euro
        ? "The conversion shown is before fees, for an eligible US business sending EUR to Europe."
        : `The amount is Airwallex’s indicative ${sell} → ${buy} conversion before FX markup and payout fees for an eligible business sender.`,
      euro
        ? `The current US fee schedule lists a 0.50% standard EUR FX margin and a $1 local EUR payout fee where applicable. Grow and Accelerate are exempt from the local payout fee. Check the applicable rate and payout rail in the sender’s account. ${usFees}`
        : singapore
          ? `For US business accounts, the fee schedule lists a 0.50% standard SGD FX margin and a $1 local payout where standard transfer fees apply. Grow and Accelerate are exempt from that payout fee. ${usFees}`
          : buy === "INR" && isUs
            ? `The US schedule lists a $2 local INR payout fee where standard transfer fees apply. Grow and Accelerate are exempt from that fee. Check the applicable markup and total in your account. ${usFees}`
            : `Airwallex publishes a standard 0.50% FX margin on major currencies (0.40% in Singapore) and 1.00% on other currencies, plus any applicable local or SWIFT payout fee. ${usFees}`,
      ...(euro ? ["Airwallex transfer confirmations: https://help.airwallex.com/hc/en-gb/articles/17985003563279-How-to-view-and-manage-transfers"] : []),
    ],
  };
}
