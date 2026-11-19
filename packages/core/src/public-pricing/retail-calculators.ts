import { z } from "zod";
import type { PriceCheckInput, PriceRow } from "../pricing.js";
import { htmlToText } from "../web-check.js";
import { shared } from "./shared-cache.js";

const quoteLifetime = 15 * 60_000;
const sendwaveOrigins: Record<string, string> = { US: "USD", GB: "GBP", CA: "CAD", FR: "EUR", IT: "EUR", ES: "EUR", IE: "EUR" };
const sendwaveTargets: Record<string, [currency: string, page: string]> = {
  GH: ["GHS", "ghana"], KE: ["KES", "kenya"], NG: ["NGN", "nigeria"], PH: ["PHP", "philippines"],
  UG: ["UGX", "uganda"], TZ: ["TZS", "tanzania"], BD: ["BDT", "bangladesh"], LK: ["LKR", "sri-lanka"], SN: ["XOF", "senegal"],
};
const lemfiTargets = {
  KE: { from: "USD", origin: "US", to: "KES", path: "/en-us/international-money-transfer/kenya" },
  GH: { from: "USD", origin: "US", to: "GHS", path: "/en-us/international-money-transfer/ghana" },
  NG: { from: "USD", origin: "US", to: "NGN", path: "/en-us/international-money-transfer/nigeria" },
  NP: { from: "GBP", origin: "GB", to: "NPR", path: "/en-gb/international-money-transfer/nepal" },
} as const;
const careemCountries = new Set(["GB", "IN", "PK", "PH", "SA", "BD", "TR", "LB", "EG", "JO", "CA",
  "AT", "BE", "HR", "CY", "EE", "FI", "IT", "DE", "GR", "IE", "FR", "LV", "LI", "LU", "LT", "MC", "MT", "NL", "PT", "SM", "SK", "SI", "ES"]);
const careemUrl = "https://www.careem.com/en-AE/pay/sendmoney/";
const careemFees = "https://help.careem.com/hc/en-us/articles/12203235105043-Are-there-any-fees-for-sending-money-abroad";

function personalTransfer(input: PriceCheckInput) {
  return input.context?.profile === "personal" && input.context.purpose === "personal" ? input.context : null;
}

function recipientCountry(input: PriceCheckInput, origin: string, fallback?: string) {
  const context = personalTransfer(input);
  if (context?.direction === "send" && context.country === origin) return input.destinationCountry ?? fallback;
  if (context?.direction === "receive" && (!input.destinationCountry || input.destinationCountry === context.country)) return context.country;
  return undefined;
}

function publicPrice(now: Date): Pick<PriceRow, "basis" | "partial" | "totalCostPct" | "observedAt" | "expiresAt"> {
  return { basis: "live_public", partial: true, totalCostPct: null, observedAt: now.toISOString(), expiresAt: new Date(now.getTime() + quoteLifetime).toISOString() };
}

const decimal = z.string().regex(/^\d+(?:\.\d+)?$/).transform(Number).pipe(z.number().finite());
const sendwaveQuote = z.object({
  effectiveExchangeRate: decimal,
  effectiveFeeAmount: decimal,
  effectiveSendAmount: decimal,
  payAmount: decimal,
  receiveAmount: decimal,
  sendBonusAmount: decimal,
  campaignsApplied: z.array(z.unknown()),
});
let sendwaveBlockedUntil = 0;

export async function sendwavePublicPrice(input: PriceCheckInput, fetcher: typeof fetch, now: Date): Promise<PriceRow | null> {
  const context = personalTransfer(input);
  if (!context || (context.paymentMethod && context.paymentMethod !== "transfer_service")) return null;
  const origins = Object.keys(sendwaveOrigins).filter(code => sendwaveOrigins[code] === input.sourceCurrency);
  const origin = context.direction === "send" ? context.country : origins.length === 1 ? origins[0] : undefined;
  if (!origin || !origins.includes(origin) || Date.now() < sendwaveBlockedUntil) return null;
  const fallback = Object.keys(sendwaveTargets).find(code => sendwaveTargets[code]?.[0] === input.destinationCurrency);
  const country = recipientCountry(input, origin, input.destinationCurrency === "XOF" ? undefined : fallback);
  const target = country ? sendwaveTargets[country] : undefined;
  if (!country || !target || target[0] !== input.destinationCurrency) return null;

  const url = new URL("https://www.sendwave.com/api/pricing/public");
  url.search = new URLSearchParams({
    amountType: "SEND", amount: String(input.amount), sendCurrency: input.sourceCurrency, receiveCurrency: input.destinationCurrency,
    sendCountryIso2: origin.toLowerCase(), receiveCountryIso2: country.toLowerCase(), locale: "en",
  }).toString();
  const response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(4_000), headers: { Accept: "application/json" } });
  if (response.status === 429) {
    const retry = response.headers.get("retry-after");
    const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? (Date.parse(retry) - Date.now()) / 1_000 : NaN;
    sendwaveBlockedUntil = Date.now() + (Number.isFinite(seconds) ? Math.max(seconds, 60) : 60) * 1_000;
  }
  if (!response.ok) return null;
  const parsed = sendwaveQuote.safeParse(await response.json());
  if (!parsed.success) return null;
  const amount = parsed.data;
  if (amount.effectiveSendAmount !== input.amount || amount.sendBonusAmount || amount.campaignsApplied.length
    || amount.effectiveExchangeRate <= 0 || amount.receiveAmount <= 0
    || Math.abs(amount.payAmount - amount.effectiveSendAmount - amount.effectiveFeeAmount) > .011
    || Math.abs(amount.receiveAmount - input.amount * amount.effectiveExchangeRate) > .51) return null;
  return {
    ...publicPrice(now), providerSlug: "sendwave", providerName: "Sendwave", senderCountry: origin,
    product: { id: "sendwave:public-calculator", label: "Sendwave · public transfer calculator" },
    recipientAmount: amount.receiveAmount, feeAmount: amount.effectiveFeeAmount, feeCurrency: input.sourceCurrency, rate: amount.effectiveExchangeRate,
    paymentMethods: ["transfer_service"], delivery: null,
    source: { label: "Sendwave public calculator", url: `https://www.sendwave.com/en/countries/${target[1]}` },
    missing: ["Confirm funding and delivery method in Sendwave."],
    notes: ["Sendwave’s website gives the amount, exchange rate and transfer fee for this route. Check the app for the funding and payout method at checkout."],
  };
}

const index = z.number().int().nonnegative();
const references = z.object({ data: index });
const lemfiEnvelope = z.object({ failure: index, ageMs: index, quote: index });
const lemfiFields = z.object({ baseRate: index, rate: index, stale: index, promotion: index, fee: index });
const lemfiFee = z.object({ min: index, max: index, minTransactionAmount: index });

export async function lemfiPublicPrice(input: PriceCheckInput, fetcher: typeof fetch, now: Date): Promise<PriceRow | null> {
  const context = personalTransfer(input);
  if (!context || (context.paymentMethod && context.paymentMethod !== "transfer_service")) return null;
  const target = Object.entries(lemfiTargets).find(([country, route]) => route.from === input.sourceCurrency && route.to === input.destinationCurrency
    && recipientCountry(input, route.origin, country) === country);
  if (!target) return null;
  const [, route] = target;
  const url = `https://lemfi.com${route.path}`;
  const response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(4_000) });
  if (!response.ok) return null;
  const html = await response.text();
  const json = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!json) return null;
  // Nuxt uses index references for server-rendered calculator data.
  const data = z.array(z.unknown()).parse(JSON.parse(json));
  const root = references.safeParse(data[1]);
  if (!root.success) return null;
  const wrapper = data[root.data.data];
  const fields = Array.isArray(wrapper) && wrapper[0] === "ShallowReactive" && typeof wrapper[1] === "number" ? data[wrapper[1]] : wrapper;
  const pricing = z.object({ "currency-converter-v-0-0-0": index }).safeParse(fields);
  if (!pricing.success) return null;
  const envelope = lemfiEnvelope.safeParse(data[pricing.data["currency-converter-v-0-0-0"]]);
  if (!envelope.success || data[envelope.data.failure] !== null) return null;
  const quote = lemfiFields.safeParse(data[envelope.data.quote]);
  const age = data[envelope.data.ageMs];
  const httpAge = Number(response.headers.get("age") ?? 0) * 1_000;
  if (!quote.success || data[quote.data.stale] !== false || data[quote.data.promotion] !== null
    || typeof age !== "number" || age < 0 || !Number.isFinite(httpAge) || httpAge < 0 || age + httpAge >= quoteLifetime) return null;
  const rate = decimal.safeParse(data[quote.data.baseRate]);
  const fee = lemfiFee.safeParse(data[quote.data.fee]);
  if (!rate.success || rate.data <= 0 || data[quote.data.baseRate] !== data[quote.data.rate] || !fee.success) return null;
  const shownRate = htmlToText(html).match(new RegExp(`\\b1\\s+${route.from}\\s*=\\s*([\\d,.]+)\\s+${route.to}\\b`));
  if (!shownRate || Number(shownRate[1]?.replaceAll(",", "")) !== rate.data) return null;
  // The site's calculator prices the principal and displays a separate fee.
  // A fee band cannot be used until the website identifies the applied fee.
  const fixedFee = z.number().finite().nonnegative().safeParse(data[fee.data.min]);
  const minAmount = z.number().finite().nonnegative().safeParse(data[fee.data.minTransactionAmount]);
  if (!fixedFee.success || data[fee.data.max] !== fixedFee.data || !minAmount.success || input.amount < minAmount.data) return null;
  const observed = new Date(now.getTime() - age - httpAge);
  return {
    ...publicPrice(observed), providerSlug: "lemfi", providerName: "LemFi", senderCountry: route.origin,
    product: { id: "lemfi:public-calculator", label: "LemFi · website calculator" },
    recipientAmount: Math.round(input.amount * rate.data * 100) / 100, feeAmount: fixedFee.data, feeCurrency: route.from, rate: rate.data,
    paymentMethods: ["transfer_service"], delivery: null,
    source: { label: "LemFi public calculator", url },
    missing: ["Confirm the rate, payment method and transfer limit at checkout."],
    notes: ["The website gives a standard rate and fixed fee for this currency pair. Signup bonuses are excluded."],
  };
}

const careemEntry = z.object({
  destinationCountry: z.string().regex(/^[A-Z]{2}$/), destinationCurrency: z.string().regex(/^[A-Z]{3}$/),
  rate: z.number().finite().positive(), fee: z.number().finite().nonnegative(),
  minAmount: z.number().finite().positive(), maxAmount: z.number().finite().positive(), estimatedTime: z.string().max(120),
});

async function careemRates(fetcher: typeof fetch) {
  const response = await fetcher("https://platform.careemapis.com/pubweb/api/remittance-widget-rates", {
    redirect: "error", signal: AbortSignal.timeout(4_000), headers: { Accept: "application/json" },
  });
  if (!response.ok) return [];
  const result = z.array(z.unknown()).safeParse(await response.json());
  return result.success ? result.data.flatMap(value => { const row = careemEntry.safeParse(value); return row.success ? [row.data] : []; }) : [];
}

export async function careemPublicPrice(input: PriceCheckInput, fetcher: typeof fetch, now: Date, cache: boolean): Promise<PriceRow | null> {
  const context = personalTransfer(input);
  if (!context || input.sourceCurrency !== "AED" || (context.paymentMethod && !["transfer_service", "local_bank"].includes(context.paymentMethod))) return null;
  if (context.direction === "send" && context.country !== "AE") return null;
  const rates = await (cache ? shared("careem:remittance-widget", 60_000, () => careemRates(fetcher)) : careemRates(fetcher));
  const matching = rates.filter(rate => rate.destinationCurrency === input.destinationCurrency && careemCountries.has(rate.destinationCountry));
  const fallback = matching.length === 1 && !["USD", "EUR"].includes(input.destinationCurrency) ? matching[0]?.destinationCountry : undefined;
  const country = recipientCountry(input, "AE", fallback);
  const rate = matching.find(row => row.destinationCountry === country);
  if (!rate || input.amount < rate.minAmount || input.amount > rate.maxAmount) return null;
  return {
    ...publicPrice(now), providerSlug: "careem-pay", providerName: "Careem Pay", senderCountry: "AE",
    product: { id: "careem-pay:widget", label: "Careem Pay · UAE calculator reference" },
    recipientAmount: Math.round(input.amount * rate.rate * 100) / 100, feeAmount: null, feeCurrency: "AED", rate: rate.rate,
    feeBreakdown: `Website calculator shows a fixed fee of AED ${rate.fee}. The fee guide lists conditional fees and waivers. Confirm the charge in the app.`,
    paymentMethods: ["transfer_service", "local_bank"], delivery: rate.estimatedTime.replace(/^Money should arrive /, ""),
    source: { label: "Careem Pay public calculator", url: careemUrl },
    missing: ["Confirm the fee and rate for the selected account and funding method."],
    notes: ["The website calculator shows the recipient amount before any account-specific charge. Careem Plus and first-transfer offers can change fees and rates.", careemFees],
  };
}
