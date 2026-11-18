import { z } from "zod";
import type { PriceCheckInput, PriceRow } from "../pricing.js";

const indiaCalculator = "https://www.airwallex.com/en-us/business-account/transfers/send-money-to-india";
const europeCalculator = "https://www.airwallex.com/en-us/business-account/transfers/send-money-to-europe";
const usFees = "https://www.airwallex.com/en-us/terms/fee-schedule";
const euroCountries = new Set(["AT", "BE", "BG", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"]);
const quote = z.object({
  ccyPair: z.enum(["USDINR", "EURUSD"]),
  sellAmount: z.number().finite().positive(),
  buyAmount: z.number().finite().positive(),
  clientRate: z.number().finite().positive(),
  awxRate: z.number().finite().positive(),
  createdAt: z.number().finite().positive(),
});

export function hasAirwallexPublicReference(input: PriceCheckInput): boolean {
  const context = input.context;
  if (input.sourceCurrency !== "USD" || !context || context.purpose === "personal" || context.profile === "personal") return false;
  const usSender = context.country === "US" && context.direction === "send" && context.profile === "business"
    && (!context.paymentMethod || context.paymentMethod === "local_bank");
  if (input.destinationCurrency === "INR") return usSender && input.destinationCountry === "IN";
  return input.destinationCurrency === "EUR" && (!input.destinationCountry || euroCountries.has(input.destinationCountry))
    && (usSender || (context.direction === "receive" && context.paymentMethod === "transfer_service"));
}

/** The US outbound calculator requests unmarked FX. Its result excludes payout fees. */
export async function airwallexPublicReference(input: PriceCheckInput, fetcher: typeof fetch, now: Date): Promise<PriceRow | null> {
  if (!hasAirwallexPublicReference(input)) return null;

  const euro = input.destinationCurrency === "EUR";
  const params = new URLSearchParams({ sellAmount: String(input.amount), sellCcy: "USD", buyCcy: input.destinationCurrency, feePercent: "0" });
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
  if (fx.ccyPair !== (euro ? "EURUSD" : "USDINR")) return null;
  const rate = euro ? 1 / fx.clientRate : fx.clientRate;
  const age = now.getTime() - fx.createdAt;
  if (Math.abs(fx.sellAmount - input.amount) > .000001 || age < -60_000 || age > 300_000
    || Math.abs(fx.clientRate / fx.awxRate - 1) > .000001
    || Math.abs(fx.buyAmount - fx.sellAmount * rate) > Math.max(.03, euro ? fx.sellAmount * .000001 : 0)) return null;

  return {
    providerSlug: "airwallex",
    providerName: "Airwallex",
    product: { id: "airwallex:us-public-fx", label: "US business · FX reference" },
    basis: "live_public",
    recipientAmount: fx.buyAmount,
    feeCurrency: null,
    feeAmount: null,
    rate,
    totalCostPct: null,
    partial: true,
    side: "payer",
    delivery: null,
    ...(euro ? {
      taxNote: "The standard U.S. local transfer fee excludes applicable GST. Confirm the sender’s actual charges.",
      receipt: "Where available, the sender can download transfer confirmation from their account.",
    } : {}),
    observedAt: new Date(fx.createdAt).toISOString(),
    source: { label: "Airwallex US public calculator", url: euro ? europeCalculator : indiaCalculator },
    missing: ["Airwallex FX markup and payout fee"],
    notes: [
      euro
        ? "The conversion shown is before fees, for an eligible US business sending EUR to Europe."
        : "The amount is Airwallex’s indicative USD-to-INR conversion before fees. It is shown for a US business sending money to India.",
      euro
        ? `The current US fee schedule lists a 0.50% standard EUR FX margin and a $1 local EUR payout fee where applicable. Grow and Accelerate are exempt from the local payout fee. Check the applicable rate and payout rail in the sender’s account. ${usFees}`
        : `The US schedule lists a $2 local INR payout fee where standard transfer fees apply. Grow and Accelerate are exempt from that fee. Check the applicable markup and total in your account. ${usFees}`,
      ...(euro ? ["Airwallex transfer confirmations: https://help.airwallex.com/hc/en-gb/articles/17985003563279-How-to-view-and-manage-transfers"] : []),
    ],
  };
}
