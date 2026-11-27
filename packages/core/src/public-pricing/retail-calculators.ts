import { z } from "zod";
import type { PriceCheckInput, PriceRow } from "../pricing.js";
import { htmlToText } from "../web-check.js";
import { shared } from "./shared-cache.js";

const quoteLifetime = 15 * 60_000;
const sendwaveOrigins: Record<string, string> = { US: "USD", GB: "GBP", CA: "CAD", FR: "EUR", IT: "EUR", ES: "EUR", IE: "EUR", PT: "EUR", BE: "EUR", DE: "EUR", NL: "EUR" };
const sendwaveTargets: Record<string, [currency: string, page: string]> = {
  GH: ["GHS", "ghana"], KE: ["KES", "kenya"], NG: ["NGN", "nigeria"], PH: ["PHP", "philippines"],
  UG: ["UGX", "uganda"], TZ: ["TZS", "tanzania"], BD: ["BDT", "bangladesh"], LK: ["LKR", "sri-lanka"], SN: ["XOF", "senegal"],
  // Expanded destinations verified live HTTP 200 on sendwave.com/api/pricing/public (2026-11-26)
  IN: ["INR", "india"], PK: ["PKR", "pakistan"], MX: ["MXN", "mexico"], BR: ["BRL", "brazil"],
  CO: ["COP", "colombia"], VN: ["VND", "vietnam"], ID: ["IDR", "indonesia"], CI: ["XOF", "ivory-coast"],
  RW: ["RWF", "rwanda"], MA: ["MAD", "morocco"], PE: ["PEN", "peru"], EG: ["EGP", "egypt"],
  TH: ["THB", "thailand"], ET: ["ETB", "ethiopia"], NP: ["NPR", "nepal"], ZA: ["ZAR", "south-africa"],
};
const lemfiTargets: ReadonlyArray<{ country: string; from: string; origin: string; to: string; path: string }> = [
  { country: "KE", from: "USD", origin: "US", to: "KES", path: "/en-us/international-money-transfer/kenya" },
  { country: "GH", from: "USD", origin: "US", to: "GHS", path: "/en-us/international-money-transfer/ghana" },
  { country: "NG", from: "USD", origin: "US", to: "NGN", path: "/en-us/international-money-transfer/nigeria" },
  { country: "NP", from: "GBP", origin: "GB", to: "NPR", path: "/en-gb/international-money-transfer/nepal" },
  // Expanded fixed-fee (0..0) corridors verified live HTTP 200 on lemfi.com (2026-11-26)
  { country: "BD", from: "USD", origin: "US", to: "BDT", path: "/en-us/international-money-transfer/bangladesh" },
  { country: "PH", from: "USD", origin: "US", to: "PHP", path: "/en-us/international-money-transfer/philippines" },
  { country: "BR", from: "USD", origin: "US", to: "BRL", path: "/en-us/international-money-transfer/brazil" },
  { country: "UG", from: "USD", origin: "US", to: "UGX", path: "/en-us/international-money-transfer/uganda" },
  { country: "EG", from: "USD", origin: "US", to: "EGP", path: "/en-us/international-money-transfer/egypt" },
  { country: "SN", from: "USD", origin: "US", to: "XOF", path: "/en-us/international-money-transfer/senegal" },
  { country: "TZ", from: "USD", origin: "US", to: "TZS", path: "/en-us/international-money-transfer/tanzania" },
  { country: "NG", from: "GBP", origin: "GB", to: "NGN", path: "/en-gb/international-money-transfer/nigeria" },
  { country: "GH", from: "GBP", origin: "GB", to: "GHS", path: "/en-gb/international-money-transfer/ghana" },
  { country: "KE", from: "GBP", origin: "GB", to: "KES", path: "/en-gb/international-money-transfer/kenya" },
  { country: "BD", from: "GBP", origin: "GB", to: "BDT", path: "/en-gb/international-money-transfer/bangladesh" },
  { country: "NG", from: "CAD", origin: "CA", to: "NGN", path: "/en-ca/international-money-transfer/nigeria" },
  { country: "GH", from: "CAD", origin: "CA", to: "GHS", path: "/en-ca/international-money-transfer/ghana" },
  { country: "KE", from: "CAD", origin: "CA", to: "KES", path: "/en-ca/international-money-transfer/kenya" },
  { country: "PH", from: "CAD", origin: "CA", to: "PHP", path: "/en-ca/international-money-transfer/philippines" },
];
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
  const route = lemfiTargets.find((item) => item.from === input.sourceCurrency && item.to === input.destinationCurrency
    && recipientCountry(input, item.origin, item.country) === item.country);
  if (!route) return null;
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

/* -------------------------------------------------------------------------- */
/* Taptap Send                                                                 */
/* -------------------------------------------------------------------------- */

const money = z.string().regex(/^\d+(?:\.\d+)?$/).transform(Number);
const taptapFees = z.discriminatedUnion("type", [
  z.object({ type: z.literal("standard"), flatFee: money }),
  z.object({ type: z.literal("tiered"), tiers: z.array(z.object({ fee: money, minValue: money })).min(1) }),
]);
const taptapRates = z.object({
  availableCountries: z.array(z.object({
    isoCountryCode: z.string().length(2),
    currency: z.string().length(3),
    corridors: z.array(z.object({ isoCountryCode: z.string().length(2), currency: z.string().length(3), fxRate: money, feeSchedule: z.unknown().optional() })),
  })),
});
type TaptapRates = z.infer<typeof taptapRates>;

async function taptapRatesLoad(fetcher: typeof fetch): Promise<TaptapRates> {
  // The same public rates file Taptap Send's website reads for its calculator.
  const response = await fetcher("https://api.taptapsend.com/api/fxRates", {
    redirect: "error", signal: AbortSignal.timeout(6_000),
    headers: { Accept: "application/json", "Appian-Version": "web/2022-05-03.0", "X-Device-Id": "web", "X-Device-Model": "web" },
  });
  if (!response.ok) throw new Error(`Taptap Send answered ${response.status}`);
  return taptapRates.parse(await response.json());
}

/** The fee Taptap Send publishes for this amount, or null when the route publishes none. */
export function taptapFee(schedule: unknown, amount: number): number | null {
  const parsed = taptapFees.safeParse(schedule);
  if (!parsed.success) return null;
  if (parsed.data.type === "standard") return parsed.data.flatFee;
  const tier = [...parsed.data.tiers].sort((a, b) => b.minValue - a.minValue).find((item) => amount >= item.minValue);
  return tier ? tier.fee : null;
}

/**
 * Taptap Send's own published rate and fee for a person sending from one of
 * its sending countries. The fee is paid on top, so what arrives is the amount
 * times the rate. Routes without a published fee are shown with the fee left
 * for the app to confirm, never assumed to be free.
 */
export async function taptapSendPublicPrice(input: PriceCheckInput, fetcher: typeof fetch, now: Date, cache: boolean): Promise<PriceRow | null> {
  const context = personalTransfer(input);
  if (!context || (context.paymentMethod && context.paymentMethod !== "transfer_service")) return null;
  const rates = await (cache ? shared("taptap:fx-rates", 10 * 60_000, () => taptapRatesLoad(fetcher)) : taptapRatesLoad(fetcher)).catch(() => null);
  if (!rates) return null;
  const senders = rates.availableCountries.filter((country) => country.currency === input.sourceCurrency);
  const sender = context.direction === "send" ? senders.find((country) => country.isoCountryCode === context.country) : senders.length === 1 ? senders[0] : undefined;
  if (!sender) return null;
  const corridors = sender.corridors.filter((corridor) => corridor.currency === input.destinationCurrency);
  const wanted = input.destinationCountry ?? (context.direction === "receive" ? context.country : undefined);
  const corridor = wanted ? corridors.find((item) => item.isoCountryCode === wanted) : corridors.length === 1 ? corridors[0] : undefined;
  if (!corridor || !(corridor.fxRate > 0) || !(input.amount > 0)) return null;
  const fee = taptapFee(corridor.feeSchedule, input.amount);
  const recipientAmount = Math.round(input.amount * corridor.fxRate * 100) / 100;
  return {
    ...publicPrice(now), providerSlug: "taptap-send", providerName: "Taptap Send", senderCountry: sender.isoCountryCode,
    product: { id: "taptap-send:public-rates", label: "Taptap Send · published rate and fee" },
    recipientAmount, feeAmount: fee, feeCurrency: input.sourceCurrency, rate: corridor.fxRate,
    paymentMethods: ["transfer_service"], delivery: null,
    source: { label: "Taptap Send published rates", url: "https://www.taptapsend.com/" },
    missing: fee === null ? ["Taptap Send doesn’t publish a fee for this route. Check it in the app.", "Confirm the delivery method in Taptap Send."] : ["Confirm the delivery method in Taptap Send."],
    notes: [`Rate and fee as Taptap Send publishes them for sending from ${sender.isoCountryCode}. The fee is paid on top of the amount sent.`],
  };
}

/* -------------------------------------------------------------------------- */
/* Instarem (verified live HTTP 200 public calculator API on 2026-11-26)      */
/* -------------------------------------------------------------------------- */

const instaremOrigins: Record<string, { currency: string; sitePath: string }> = {
  US: { currency: "USD", sitePath: "en-us" },
  GB: { currency: "GBP", sitePath: "en-gb" },
  AU: { currency: "AUD", sitePath: "en-au" },
  SG: { currency: "SGD", sitePath: "en-sg" },
  CA: { currency: "CAD", sitePath: "en-ca" },
  MY: { currency: "MYR", sitePath: "en-my" },
  HK: { currency: "HKD", sitePath: "en-hk" },
  DE: { currency: "EUR", sitePath: "en-eu" },
  FR: { currency: "EUR", sitePath: "en-eu" },
  ES: { currency: "EUR", sitePath: "en-eu" },
  IT: { currency: "EUR", sitePath: "en-eu" },
  NL: { currency: "EUR", sitePath: "en-eu" },
  IE: { currency: "EUR", sitePath: "en-eu" },
  BE: { currency: "EUR", sitePath: "en-eu" },
  PT: { currency: "EUR", sitePath: "en-eu" },
};
const instaremDestinations = new Set([
  "INR", "PHP", "EUR", "GBP", "USD", "AUD", "SGD", "CAD", "MYR", "HKD", "MXN", "BRL",
  "BDT", "PKR", "LKR", "NPR", "VND", "IDR", "THB", "CNY", "JPY", "KRW", "NZD", "CHF", "PLN", "ZAR",
]);
const instaremResponse = z.object({
  success: z.literal(true),
  data: z.object({
    country_code: z.string().length(2).optional(),
    source_currency: z.string().length(3),
    destination_currency: z.string().length(3),
    gross_source_amount: z.number().finite().positive(),
    destination_amount: z.number().finite().positive(),
    instarem_fx_rate: z.number().finite().positive().optional(),
    fx_rate: z.number().finite().positive(),
    fx_rate_last_updated: z.string().optional(),
    transaction_fee_amount: z.number().finite().nonnegative(),
    regular_transaction_fee_amount: z.number().finite().nonnegative().optional(),
    payment_method_fee_amount: z.number().finite().nonnegative().optional(),
    payout_method_fee_amount: z.number().finite().nonnegative().optional(),
    net_tax_amount: z.number().finite().nonnegative().optional(),
    first_instarem_transaction: z.boolean().optional(),
    regular_instarem_fx_rate: z.number().finite().positive().optional(),
    source_validation: z.unknown().optional(),
    destination_validation: z.unknown().optional(),
  }),
});

/**
 * Instarem's own public calculator endpoint. Verified live across US, GB, AU,
 * SG, EU, CA, MY, HK origins on 2026-11-26. Returns the live rate and default
 * transfer fee without requiring an account or browser automation.
 */
export async function instaremPublicPrice(input: PriceCheckInput, fetcher: typeof fetch, now: Date): Promise<PriceRow | null> {
  const context = personalTransfer(input);
  if (!context || (context.paymentMethod && !["local_bank", "transfer_service"].includes(context.paymentMethod))) return null;
  if (!instaremDestinations.has(input.destinationCurrency) || input.sourceCurrency === input.destinationCurrency) return null;
  const origins = Object.entries(instaremOrigins).filter(([, cfg]) => cfg.currency === input.sourceCurrency);
  const originEntry = context.direction === "send"
    ? origins.find(([code]) => code === context.country)
    : origins.length === 1 ? origins[0] : undefined;
  if (!originEntry) return null;
  const [origin, cfg] = originEntry;

  const url = new URL("https://www.instarem.com/api/v1/public/transaction/computed-value");
  url.search = new URLSearchParams({
    source_currency: input.sourceCurrency,
    destination_currency: input.destinationCurrency,
    source_amount: String(input.amount),
  }).toString();
  const response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(4_500), headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) return null;
  const parsed = instaremResponse.safeParse(await response.json());
  if (!parsed.success) return null;
  const d = parsed.data.data;
  if (d.source_currency !== input.sourceCurrency || d.destination_currency !== input.destinationCurrency
    || Math.abs(d.gross_source_amount - input.amount) > 0.011) return null;
  const rate = d.instarem_fx_rate ?? d.fx_rate;
  const totalFee = Math.round(((d.transaction_fee_amount ?? 0) + (d.payment_method_fee_amount ?? 0) + (d.payout_method_fee_amount ?? 0) + (d.net_tax_amount ?? 0)) * 100) / 100;
  const feeOnTop = input.amount * rate;
  const feeInside = (input.amount - totalFee) * rate;
  const tol = Math.max(d.destination_amount * 0.01, 1);
  if (Math.abs(d.destination_amount - feeOnTop) > tol && Math.abs(d.destination_amount - feeInside) > tol) return null;
  const promo = Boolean(d.first_instarem_transaction)
    || (d.regular_transaction_fee_amount != null && d.regular_transaction_fee_amount > d.transaction_fee_amount)
    || (d.regular_instarem_fx_rate != null && d.regular_instarem_fx_rate > 0 && Math.abs(d.regular_instarem_fx_rate - rate) / rate > 0.002);
  const updatedMs = d.fx_rate_last_updated ? Date.parse(d.fx_rate_last_updated) : NaN;
  const observed = Number.isFinite(updatedMs) && updatedMs <= now.getTime() + 60_000 && now.getTime() - updatedMs < 3_600_000 ? new Date(updatedMs) : now;
  const expiresAt = new Date(now.getTime() + quoteLifetime).toISOString();
  return {
    ...publicPrice(observed),
    expiresAt,
    providerSlug: "instarem",
    providerName: "Instarem",
    senderCountry: origin,
    product: { id: `instarem:${origin.toLowerCase()}-public`, label: "Instarem · public transfer calculator" },
    recipientAmount: Math.round(d.destination_amount * 100) / 100,
    feeAmount: totalFee,
    feeCurrency: input.sourceCurrency,
    rate,
    paymentMethods: ["local_bank", "transfer_service"],
    delivery: null,
    source: { label: "Instarem public calculator", url: `https://www.instarem.com/${cfg.sitePath}/` },
    ...(promo ? { publicOffer: { kind: "first_transfer" as const, fundingMethod: "Bank transfer", payoutMethod: "Bank deposit", displayUntil: expiresAt } } : {}),
    missing: ["Confirm the exact funding method and final fee in your Instarem account."],
    notes: [
      `Read directly from Instarem’s public calculator for ${input.amount} ${input.sourceCurrency} → ${input.destinationCurrency}.`,
      ...(promo && d.regular_transaction_fee_amount != null ? [`Default public calculator includes a new-customer discount; regular transfer fee is ${d.regular_transaction_fee_amount} ${input.sourceCurrency}.`] : []),
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Ria Money Transfer (verified live HTTP 200 public calculator API 2026-11-26)*/
/* -------------------------------------------------------------------------- */

const riaOrigins: Record<string, string> = {
  US: "USD", GB: "GBP", AU: "AUD", CA: "CAD", NZ: "NZD", CH: "CHF", MY: "MYR",
  DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", IE: "EUR", PT: "EUR",
  SE: "SEK", NO: "NOK", DK: "DKK",
};
const riaDestinations: Record<string, string> = {
  IN: "INR", MX: "MXN", PH: "PHP", CO: "COP", NG: "NGN", PK: "PKR", BD: "BDT", NP: "NPR", LK: "LKR",
  BR: "BRL", PE: "PEN", CL: "CLP", AR: "ARS", VN: "VND", ID: "IDR", TH: "THB", MY: "MYR", CN: "CNY",
  KE: "KES", GH: "GHS", UG: "UGX", TZ: "TZS", RW: "RWF", SN: "XOF", CI: "XOF", ET: "ETB", ZA: "ZAR",
  EG: "EGP", MA: "MAD", TR: "TRY", GB: "GBP", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", PL: "PLN",
  AU: "AUD", CA: "CAD", US: "USD", SG: "SGD", JP: "JPY", KR: "KRW",
};
const RIA_APP_ID = "399AB2A7-F002-4069-BD24-960255517896";
const riaSessionShape = z.object({ authToken: z.object({ jwtToken: z.string().min(20) }) });
const riaCalcShape = z.object({
  model: z.object({
    transferDetails: z.object({
      selections: z.object({
        countryTo: z.string().length(2),
        currencyFrom: z.string().length(3),
        currencyTo: z.string().length(3),
        amountFrom: z.number().finite().positive(),
        paymentMethod: z.string().optional(),
        deliveryMethod: z.string().optional(),
      }),
      calculations: z.object({
        amountTo: z.number().finite().positive(),
        amountFrom: z.number().finite().positive(),
        exchangeRate: z.number().finite().positive(),
        exchangeRatePromo: z.number().finite().positive().nullish(),
        transferFee: z.number().finite().nonnegative(),
        totalFeesAndTaxes: z.number().finite().nonnegative(),
        taxAmount: z.number().finite().nonnegative().optional(),
        sendAmountLimit: z.object({
          minimumSendFromAmount: z.number().finite().nonnegative().optional(),
          maximumSendFromAmount: z.number().finite().positive().optional(),
        }).nullish(),
      }),
    }),
  }),
});

async function riaSessionToken(fetcher: typeof fetch, cache: boolean): Promise<string | null> {
  const load = async () => {
    const res = await fetcher("https://public.riamoneytransfer.com/Authorization/session", {
      redirect: "error", signal: AbortSignal.timeout(4_500), headers: { Accept: "application/json" }, cache: "no-store",
    });
    if (!res.ok) return null;
    const parsed = riaSessionShape.safeParse(await res.json());
    return parsed.success ? parsed.data.authToken.jwtToken : null;
  };
  return cache ? shared("ria:public-session", 10 * 60_000, load) : load();
}

/**
 * Ria Money Transfer's public calculator API. Verified live across US, GB, AU,
 * CA, and EU origins on 2026-11-26. Uses anonymous session JWT + BankAccount ->
 * BankDeposit calculation and flags first-transfer promotional rates honestly.
 */
export async function riaPublicPrice(input: PriceCheckInput, fetcher: typeof fetch, now: Date, cache = true): Promise<PriceRow | null> {
  const context = personalTransfer(input);
  if (!context || (context.paymentMethod && !["local_bank", "transfer_service"].includes(context.paymentMethod))) return null;
  const origins = Object.entries(riaOrigins).filter(([, ccy]) => ccy === input.sourceCurrency);
  const originEntry = context.direction === "send"
    ? origins.find(([code]) => code === context.country)
    : origins.length === 1 ? origins[0] : undefined;
  if (!originEntry) return null;
  const [origin] = originEntry;
  const wantedDest = input.destinationCountry ?? (context.direction === "receive" ? context.country : undefined);
  const destMatches = Object.entries(riaDestinations).filter(([, ccy]) => ccy === input.destinationCurrency);
  const destEntry = wantedDest
    ? destMatches.find(([code]) => code === wantedDest)
    : destMatches.length === 1 ? destMatches[0] : undefined;
  if (!destEntry || destEntry[0] === origin) return null;
  const [destCountry] = destEntry;

  const jwt = await riaSessionToken(fetcher, cache).catch(() => null);
  if (!jwt) return null;
  const response = await fetcher("https://public.riamoneytransfer.com/MoneyTransferCalculator/Calculate", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(4_500),
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      IsoCode: origin,
      CultureCode: "en-US",
      AppId: RIA_APP_ID,
    },
    body: JSON.stringify({
      selections: {
        amountFrom: input.amount,
        amountTo: null,
        countryTo: destCountry,
        currencyFrom: input.sourceCurrency,
        currencyTo: input.destinationCurrency,
        deliveryMethod: "BankDeposit",
        paymentMethod: "BankAccount",
        promoCode: "",
        shouldCalcVariableRates: true,
      },
    }),
  });
  if (!response.ok) return null;
  const parsed = riaCalcShape.safeParse(await response.json());
  if (!parsed.success) return null;
  const { selections, calculations: calc } = parsed.data.model.transferDetails;
  if (selections.countryTo !== destCountry || selections.currencyFrom !== input.sourceCurrency
    || selections.currencyTo !== input.destinationCurrency || Math.abs(calc.amountFrom - input.amount) > 0.011) return null;
  const minAmt = calc.sendAmountLimit?.minimumSendFromAmount;
  const maxAmt = calc.sendAmountLimit?.maximumSendFromAmount;
  if ((minAmt != null && input.amount < minAmt) || (maxAmt != null && input.amount > maxAmt)) return null;

  const promoRate = calc.exchangeRatePromo && calc.exchangeRatePromo > calc.exchangeRate * 1.0005 ? calc.exchangeRatePromo : null;
  const effectiveRate = calc.amountTo / input.amount;
  const isPromo = Boolean(promoRate && Math.abs(effectiveRate - promoRate) / promoRate < 0.005);
  const expectedStandard = input.amount * calc.exchangeRate;
  const tol = Math.max(calc.amountTo * 0.01, 1);
  if (!isPromo && Math.abs(calc.amountTo - expectedStandard) > tol) return null;

  const expiresAt = new Date(now.getTime() + quoteLifetime).toISOString();
  const localePath = origin === "US" ? "en-us" : origin === "GB" ? "en-gb" : origin === "AU" ? "en-au" : origin === "CA" ? "en-ca" : "en-us";
  return {
    ...publicPrice(now),
    expiresAt,
    providerSlug: "ria",
    providerName: "Ria Money Transfer",
    senderCountry: origin,
    product: { id: `ria:${origin.toLowerCase()}-bank`, label: isPromo ? "Ria · bank-funded welcome offer" : "Ria · bank transfer to bank deposit" },
    recipientAmount: Math.round(calc.amountTo * 100) / 100,
    feeAmount: Math.round(calc.totalFeesAndTaxes * 100) / 100,
    feeCurrency: input.sourceCurrency,
    rate: Math.round(effectiveRate * 1_000_000) / 1_000_000,
    paymentMethods: ["local_bank", "transfer_service"],
    delivery: null,
    source: { label: "Ria public calculator", url: `https://www.riamoneytransfer.com/${localePath}/` },
    ...(isPromo ? { publicOffer: { kind: "first_transfer" as const, fundingMethod: "Bank account", payoutMethod: "Bank deposit", displayUntil: expiresAt } } : {}),
    missing: ["Confirm the funding method, delivery time and final fee at checkout."],
    notes: [
      `Read directly from Ria’s public calculator for ${origin} → ${destCountry} (bank account to bank deposit).`,
      ...(isPromo ? [`Includes Ria’s new-customer promotional rate (${promoRate!.toFixed(4)}); standard bank-deposit rate shown is ${calc.exchangeRate}.`] : []),
      ...(maxAmt ? [`Ria’s calculator reports a ${minAmt ?? 1}–${maxAmt.toLocaleString("en-US")} ${input.sourceCurrency} online band for this route.`] : []),
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Western Union (verified live HTTP 200 public price catalog on 2026-11-26)   */
/* -------------------------------------------------------------------------- */

const wuOrigins: Record<string, string> = {
  US: "USD", GB: "GBP", CA: "CAD", AU: "AUD", NZ: "NZD", SG: "SGD", AE: "AED", CH: "CHF",
  DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", IE: "EUR", PT: "EUR", AT: "EUR",
  SE: "SEK", NO: "NOK", DK: "DKK",
};
const wuDestinations: Record<string, string> = {
  IN: "INR", MX: "MXN", PH: "PHP", CO: "COP", NG: "NGN", PK: "PKR", BD: "BDT", NP: "NPR", LK: "LKR",
  BR: "BRL", PE: "PEN", CL: "CLP", AR: "ARS", VN: "VND", ID: "IDR", TH: "THB", MY: "MYR", CN: "CNY",
  KE: "KES", GH: "GHS", UG: "UGX", TZ: "TZS", RW: "RWF", SN: "XOF", CI: "XOF", ET: "ETB", ZA: "ZAR",
  EG: "EGP", MA: "MAD", TR: "TRY", GB: "GBP", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR",
  PL: "PLN", AU: "AUD", CA: "CAD", US: "USD", SG: "SGD", JP: "JPY", KR: "KRW", AE: "AED", SA: "SAR",
};
const WU_BANK_FUND_IN = new Set(["AC", "EB", "PB", "IR", "BB", "IB", "BT", "GP", "PA"]);
const wuPayGroup = z.object({
  fund_in: z.string(),
  fx_rate: z.number().finite().positive(),
  send_amount: z.number().finite().positive(),
  receive_amount: z.number().finite().positive(),
  gross_fee: z.number().finite().nonnegative(),
  base_fee: z.number().finite().nonnegative().optional(),
  min_amount: z.number().finite().nonnegative().optional(),
  max_amount: z.number().finite().positive().optional(),
});
const wuCatalogShape = z.object({
  services_groups: z.array(z.object({
    service: z.string(),
    service_name: z.string().optional(),
    fund_out: z.string().optional(),
    speed_days: z.union([z.string(), z.number()]).optional(),
    pay_groups: z.array(wuPayGroup).optional(),
  })),
});

/**
 * Western Union's public WUConnect price catalog API. Verified live HTTP 200
 * across US, GB, CA, AU origins on 2026-11-26. Prefers Direct to Bank payouts
 * funded via bank transfer (or lowest-fee online rail) over cash/credit card.
 */
export async function westernUnionPublicPrice(input: PriceCheckInput, fetcher: typeof fetch, now: Date): Promise<PriceRow | null> {
  const context = personalTransfer(input);
  if (!context || (context.paymentMethod && !["local_bank", "transfer_service"].includes(context.paymentMethod))) return null;
  const origins = Object.entries(wuOrigins).filter(([, ccy]) => ccy === input.sourceCurrency);
  const originEntry = context.direction === "send"
    ? origins.find(([code]) => code === context.country)
    : origins.length === 1 ? origins[0] : undefined;
  if (!originEntry) return null;
  const [origin] = originEntry;
  const wantedDest = input.destinationCountry ?? (context.direction === "receive" ? context.country : undefined);
  const destMatches = Object.entries(wuDestinations).filter(([, ccy]) => ccy === input.destinationCurrency);
  const destEntry = wantedDest
    ? destMatches.find(([code]) => code === wantedDest)
    : destMatches.length === 1 ? destMatches[0] : undefined;
  if (!destEntry || destEntry[0] === origin) return null;
  const [destCountry] = destEntry;

  const response = await fetcher("https://www.westernunion.com/wuconnect/prices/catalog", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(4_500),
    cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify({
      header_request: { version: "0.5", request_type: "PRICECATALOG", correlation_id: `railor-${origin}-${destCountry}` },
      sender: { client: "WUCOM", channel: "WWEB", funds_in: "*", curr_iso3: input.sourceCurrency, cty_iso2_ext: origin, send_amount: input.amount },
      receiver: { curr_iso3: input.destinationCurrency, cty_iso2_ext: destCountry, cty_iso2: destCountry },
      visit: { country: origin, language: "en" },
    }),
  });
  if (!response.ok) return null;
  const parsed = wuCatalogShape.safeParse(await response.json());
  if (!parsed.success || !parsed.data.services_groups.length) return null;

  const rankedGroups = [...parsed.data.services_groups]
    .filter((g) => (g.pay_groups?.length ?? 0) > 0)
    .sort((a, b) => {
      const score = (g: typeof a) => (g.service === "500" || g.fund_out === "500" ? 0 : g.service === "50A" ? 1 : 2);
      return score(a) - score(b);
    });
  for (const group of rankedGroups) {
    const valid = (group.pay_groups ?? []).filter((p) => {
      if (Math.abs(p.send_amount - input.amount) > 0.011) return false;
      if (p.min_amount != null && input.amount < p.min_amount) return false;
      if (p.max_amount != null && input.amount > p.max_amount) return false;
      const expected = input.amount * p.fx_rate;
      return Math.abs(p.receive_amount - expected) <= Math.max(p.receive_amount * 0.015, 2);
    });
    if (!valid.length) continue;
    const bankFirst = valid.sort((a, b) => {
      const rank = (p: typeof a) => (WU_BANK_FUND_IN.has(p.fund_in) ? 0 : p.fund_in === "DC" ? 1 : 2);
      return rank(a) - rank(b) || a.gross_fee - b.gross_fee || b.receive_amount - a.receive_amount;
    });
    const best = bankFirst[0]!;
    const isBankPayout = group.service === "500" || group.fund_out === "500";
    const payoutName = group.service_name || (isBankPayout ? "Direct to Bank" : "Money transfer");
    const expiresAt = new Date(now.getTime() + quoteLifetime).toISOString();
    return {
      ...publicPrice(now),
      expiresAt,
      providerSlug: "western-union",
      providerName: "Western Union",
      senderCountry: origin,
      product: { id: `western-union:${origin.toLowerCase()}-${group.service.toLowerCase()}`, label: `Western Union · ${payoutName}` },
      recipientAmount: Math.round(best.receive_amount * 100) / 100,
      feeAmount: Math.round(best.gross_fee * 100) / 100,
      feeCurrency: input.sourceCurrency,
      rate: best.fx_rate,
      paymentMethods: WU_BANK_FUND_IN.has(best.fund_in) ? ["local_bank", "transfer_service"] : ["transfer_service"],
      delivery: group.service === "000" ? "Minutes (cash pickup)" : group.speed_days ? `${group.speed_days}–3 business days` : null,
      source: { label: "Western Union price catalog", url: `https://www.westernunion.com/${origin.toLowerCase()}/en/web/send-money/start` },
      missing: ["Confirm your chosen funding method, taxes and delivery speed at checkout."],
      notes: [
        `Read directly from Western Union’s public price catalog for ${origin} → ${destCountry} (${payoutName}, pay-in code ${best.fund_in}).`,
        "Transfer fee is added on top of the amount sent. Promotional first-transfer waivers may differ in your Western Union account.",
      ],
    };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* TransferGo (verified live HTTP 200 public booking quotes on 2026-11-26)     */
/* -------------------------------------------------------------------------- */

const tgOrigins: Record<string, string> = {
  GB: "GBP", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", IE: "EUR",
  PT: "EUR", AT: "EUR", FI: "EUR", PL: "PLN", NO: "NOK", SE: "SEK", DK: "DKK", CH: "CHF",
};
const tgDestinations: Record<string, string> = {
  DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", IE: "EUR", PT: "EUR", AT: "EUR",
  GB: "GBP", PL: "PLN", RO: "RON", TR: "TRY", UA: "UAH", IN: "INR", PK: "PKR", BD: "BDT", PH: "PHP",
  NP: "NPR", LK: "LKR", NG: "NGN", GH: "GHS", KE: "KES", UG: "UGX", ZA: "ZAR", MA: "MAD", MX: "MXN",
  BR: "BRL", CO: "COP", PE: "PEN", AU: "AUD", CA: "CAD", US: "USD", SG: "SGD", TH: "THB", VN: "VND",
  ID: "IDR", CN: "CNY", CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK",
};
const tgNumber = z.union([z.number(), z.string().regex(/^\d+(\.\d+)?$/)]).transform(Number).pipe(z.number().finite());
const tgQuoteShape = z.object({
  options: z.array(z.object({
    code: z.string(),
    isDefault: z.boolean().optional(),
    availability: z.object({
      isAvailable: z.boolean(),
      maxAmount: z.object({ value: tgNumber }).nullish(),
    }),
    promotion: z.object({ isApplied: z.boolean().optional() }).nullish(),
    visibility: z.object({ estimateLabel: z.string().nullish() }).nullish(),
    rate: z.object({ value: tgNumber }),
    fee: z.object({ value: tgNumber }),
    sendingAmount: z.object({ value: tgNumber }),
    receivingAmount: z.object({ value: tgNumber }),
  })),
});
const TG_DELIVERY_LABELS: Record<string, string> = {
  in_minutes: "Within 30 minutes",
  today: "Same day",
  in_one_business_day: "1 business day",
  standard: "1–2 business days",
};

/**
 * TransferGo's live public booking quotes API. Verified HTTP 200 across GB/EU
 * origins -> EU, PL, IN, NG, TR on 2026-11-26. Supports personal and business.
 */
export async function transferGoPublicPrice(input: PriceCheckInput, fetcher: typeof fetch, now: Date): Promise<PriceRow | null> {
  const context = input.context;
  if (!context || (context.paymentMethod && !["local_bank", "transfer_service"].includes(context.paymentMethod))) return null;
  const origins = Object.entries(tgOrigins).filter(([, ccy]) => ccy === input.sourceCurrency);
  const originEntry = context.direction === "send"
    ? origins.find(([code]) => code === context.country)
    : origins.length === 1 ? origins[0] : undefined;
  if (!originEntry) return null;
  const [origin] = originEntry;
  const wantedDest = input.destinationCountry ?? (context.direction === "receive" ? context.country : undefined);
  const destMatches = Object.entries(tgDestinations).filter(([, ccy]) => ccy === input.destinationCurrency);
  const destEntry = wantedDest
    ? destMatches.find(([code]) => code === wantedDest)
    : destMatches.length === 1 ? destMatches[0] : undefined;
  if (!destEntry || destEntry[0] === origin) return null;
  const [destCountry] = destEntry;

  const url = new URL("https://my.transfergo.com/api/booking/quotes");
  url.search = new URLSearchParams({
    fromCurrencyCode: input.sourceCurrency,
    toCurrencyCode: input.destinationCurrency,
    fromCountryCode: origin,
    toCountryCode: destCountry,
    amount: String(input.amount),
    calculationBase: "sendAmount",
  }).toString();
  const response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(4_500), headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) return null;
  const parsed = tgQuoteShape.safeParse(await response.json());
  if (!parsed.success) return null;

  const available = parsed.data.options.filter((o) => {
    if (!o.availability.isAvailable) return false;
    if (o.availability.maxAmount && input.amount > o.availability.maxAmount.value) return false;
    if (Math.abs(o.sendingAmount.value - input.amount) > 0.011 || !(o.rate.value > 0) || !(o.receivingAmount.value > 0)) return false;
    const feeInside = (input.amount - o.fee.value) * o.rate.value;
    const feeOnTop = input.amount * o.rate.value;
    const tol = Math.max(o.receivingAmount.value * 0.01, 1);
    return Math.abs(o.receivingAmount.value - feeInside) <= tol || Math.abs(o.receivingAmount.value - feeOnTop) <= tol;
  });
  if (!available.length) return null;
  const option = available.find((o) => o.code.startsWith("bank-") || o.code.startsWith("tink-"))
    ?? available.find((o) => o.isDefault)
    ?? available[0]!;
  const expiresAt = new Date(now.getTime() + quoteLifetime).toISOString();
  const estimateKey = option.visibility?.estimateLabel ?? "";
  return {
    ...publicPrice(now),
    expiresAt,
    providerSlug: "transfergo",
    providerName: "TransferGo",
    senderCountry: origin,
    product: { id: `transfergo:${origin.toLowerCase()}-${destCountry.toLowerCase()}`, label: "TransferGo · bank transfer" },
    recipientAmount: Math.round(option.receivingAmount.value * 100) / 100,
    feeAmount: Math.round(option.fee.value * 100) / 100,
    feeCurrency: input.sourceCurrency,
    rate: option.rate.value,
    paymentMethods: ["local_bank", "transfer_service"],
    delivery: TG_DELIVERY_LABELS[estimateKey] ?? null,
    source: { label: "TransferGo public calculator", url: "https://www.transfergo.com/en/pricing" },
    ...(option.promotion?.isApplied ? { publicOffer: { kind: "first_transfer" as const, fundingMethod: "Bank transfer", payoutMethod: "Bank deposit", displayUntil: expiresAt } } : {}),
    missing: ["Confirm your chosen delivery speed and account eligibility in TransferGo."],
    notes: [
      `Read directly from TransferGo’s public quote engine for ${origin} → ${destCountry} (${option.code}).`,
      ...(option.promotion?.isApplied ? ["Includes a promotional discount applied by TransferGo’s public calculator."] : []),
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* NALA (verified live HTTP 200 public FX feed on 2026-11-26)                 */
/* -------------------------------------------------------------------------- */

const nalaOrigins: Record<string, string> = {
  US: "USD", GB: "GBP", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", IE: "EUR", PT: "EUR", AT: "EUR", FI: "EUR",
};
const nalaFeedShape = z.object({
  data: z.array(z.object({
    source_currency: z.string().length(3),
    destination_currency: z.string().length(3),
    rate: tgNumber,
    provider_name: z.string(),
    created_at: z.string(),
  })),
});

async function loadNalaRates(fetcher: typeof fetch) {
  const res = await fetcher("https://partners-api.prod.nala-api.com/v1/fx/rates", {
    redirect: "error", signal: AbortSignal.timeout(4_500), headers: { Accept: "application/json" }, cache: "no-store",
  });
  if (!res.ok) return null;
  const parsed = nalaFeedShape.safeParse(await res.json());
  return parsed.success ? parsed.data.data.filter((item) => item.provider_name === "NALA" && item.rate > 0) : null;
}

/**
 * NALA's live public FX rates feed (42 first-party NALA corridors across US, UK,
 * and EU -> Africa & South Asia). Verified live HTTP 200 on 2026-11-26.
 */
export async function nalaPublicPrice(input: PriceCheckInput, fetcher: typeof fetch, now: Date, cache = true): Promise<PriceRow | null> {
  const context = personalTransfer(input);
  if (!context || (context.paymentMethod && !["local_bank", "transfer_service"].includes(context.paymentMethod))) return null;
  const origins = Object.entries(nalaOrigins).filter(([, ccy]) => ccy === input.sourceCurrency);
  const originEntry = context.direction === "send"
    ? origins.find(([code]) => code === context.country)
    : origins.length === 1 ? origins[0] : undefined;
  if (!originEntry) return null;
  const [origin] = originEntry;

  const rates = await (cache ? shared("nala:fx-rates", 60_000, () => loadNalaRates(fetcher)) : loadNalaRates(fetcher)).catch(() => null);
  if (!rates) return null;
  const entry = rates.find((item) => item.source_currency === input.sourceCurrency && item.destination_currency === input.destinationCurrency);
  if (!entry) return null;
  const ts = Date.parse(entry.created_at);
  if (!Number.isFinite(ts) || now.getTime() - ts > 6 * 3_600_000 || ts > now.getTime() + 300_000) return null;

  return {
    ...publicPrice(new Date(ts)),
    expiresAt: new Date(now.getTime() + quoteLifetime).toISOString(),
    providerSlug: "nala",
    providerName: "NALA",
    senderCountry: origin,
    product: { id: `nala:${origin.toLowerCase()}-fx`, label: "NALA · live FX rate" },
    recipientAmount: Math.round(input.amount * entry.rate * 100) / 100,
    feeAmount: null,
    feeCurrency: input.sourceCurrency,
    rate: entry.rate,
    paymentMethods: ["transfer_service"],
    delivery: "Seconds to minutes",
    source: { label: "NALA live rates feed", url: "https://www.nala.com/" },
    missing: ["Any corridor-specific NALA transfer fee (shown in the NALA app before sending)."],
    notes: [
      `Read directly from NALA’s live public FX feed (${input.sourceCurrency} → ${input.destinationCurrency}).`,
      "NALA frequently waives fees above minimum thresholds; confirm any transfer fee and daily cap in the NALA app.",
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* BookMyForex (verified live HTTP 200 India outward TT wire card 2026-11-26) */
/* -------------------------------------------------------------------------- */

const bmfCardShape = z.object({
  type: z.literal("success"),
  result: z.array(z.object({
    currency_code: z.string().length(3),
    btt: z.union([z.string(), z.number()]).nullish(),
  })),
});

async function loadBookMyForexCard(fetcher: typeof fetch) {
  const res = await fetcher("https://www.bookmyforex.com/api/secure/v1/get-full-rate-card?city_code=DEL", {
    redirect: "error", signal: AbortSignal.timeout(4_500), headers: { Accept: "application/json" }, cache: "no-store",
  });
  if (!res.ok) return null;
  const parsed = bmfCardShape.safeParse(await res.json());
  if (!parsed.success) return null;
  const map = new Map<string, number>();
  for (const row of parsed.data.result) {
    const btt = Number(row.btt);
    if (Number.isFinite(btt) && btt > 0) map.set(row.currency_code.toUpperCase(), btt);
  }
  return map;
}

/**
 * BookMyForex live India outward wire transfer (Buy TT) rate card. Covers 35+
 * destination currencies for INR outbound LRS transfers. Verified HTTP 200 2026-11-26.
 */
export async function bookMyForexPublicPrice(input: PriceCheckInput, fetcher: typeof fetch, now: Date, cache = true): Promise<PriceRow | null> {
  const context = input.context;
  if (!context || context.profile !== "personal" || context.direction !== "send" || context.country !== "IN") return null;
  if (input.sourceCurrency !== "INR" || input.destinationCurrency === "INR") return null;
  if (context.paymentMethod && !["local_bank", "wire", "transfer_service"].includes(context.paymentMethod)) return null;

  const rates = await (cache ? shared("bookmyforex:rate-card", 60_000, () => loadBookMyForexCard(fetcher)) : loadBookMyForexCard(fetcher)).catch(() => null);
  const inrPerUnit = rates?.get(input.destinationCurrency);
  if (!inrPerUnit || !(inrPerUnit > 0)) return null;
  const rate = Math.round((1 / inrPerUnit) * 1_000_000) / 1_000_000;
  const recipientAmount = Math.round((input.amount / inrPerUnit) * 100) / 100;
  if (!(recipientAmount > 0)) return null;

  return {
    ...publicPrice(now),
    expiresAt: new Date(now.getTime() + quoteLifetime).toISOString(),
    providerSlug: "bookmyforex",
    providerName: "BookMyForex",
    senderCountry: "IN",
    product: { id: "bookmyforex:in-wire-tt", label: "BookMyForex · outward wire (TT rate)" },
    recipientAmount,
    feeAmount: null,
    feeCurrency: "INR",
    rate,
    paymentMethods: ["local_bank", "wire"],
    delivery: "1–2 business days",
    source: { label: "BookMyForex live TT rate card", url: "https://www.bookmyforex.com/money-transfer/" },
    missing: ["Partner bank wire fee (~₹320 + GST), Nostro charges and statutory Indian LRS TCS."],
    notes: [
      `Uses BookMyForex’s live Buy TT (outward wire) rate of ₹${inrPerUnit.toFixed(4)} per 1 ${input.destinationCurrency}.`,
      "Excludes partner bank wire charges, Nostro charges, FX slab GST and applicable LRS TCS. Confirm total payable before booking.",
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Rextie (verified live HTTP 201 Peru USD<->PEN quote API on 2026-11-26)     */
/* -------------------------------------------------------------------------- */

const rextieQuoteShape = z.object({
  source_currency: z.enum(["USD", "PEN"]),
  target_currency: z.enum(["USD", "PEN"]),
  source_amount: tgNumber,
  target_amount: tgNumber,
  fx_rate_buy: tgNumber,
  fx_rate_sell: tgNumber,
  valid_until: z.string(),
  min_amount: tgNumber.optional(),
  max_amount: tgNumber.optional(),
});

/**
 * Rextie live Peru USD <-> PEN currency exchange quote API. Verified live
 * HTTP 201 on 2026-11-26 for both directions. Zero fixed service commission.
 */
export async function rextiePublicPrice(input: PriceCheckInput, fetcher: typeof fetch, now: Date): Promise<PriceRow | null> {
  const pairOk = (input.sourceCurrency === "USD" && input.destinationCurrency === "PEN")
    || (input.sourceCurrency === "PEN" && input.destinationCurrency === "USD");
  if (!pairOk) return null;
  const context = input.context;
  if (context && context.country !== "PE" && input.destinationCountry !== "PE") return null;
  if (context?.paymentMethod && !["local_bank", "transfer_service"].includes(context.paymentMethod)) return null;

  const response = await fetcher("https://app.rextie.com/api/v1/fxrates/rate/", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(4_500),
    cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ source_currency: input.sourceCurrency, target_currency: input.destinationCurrency, source_amount: input.amount }),
  });
  if (!response.ok) return null;
  const parsed = rextieQuoteShape.safeParse(await response.json());
  if (!parsed.success) return null;
  const q = parsed.data;
  if (q.source_currency !== input.sourceCurrency || q.target_currency !== input.destinationCurrency
    || Math.abs(q.source_amount - input.amount) > 0.011 || !(q.target_amount > 0)) return null;
  if (q.min_amount != null && input.amount < q.min_amount) return null;
  if (q.max_amount != null && input.amount > q.max_amount) return null;
  const rate = input.sourceCurrency === "USD" ? q.fx_rate_buy : Math.round((1 / q.fx_rate_sell) * 1_000_000) / 1_000_000;
  const expected = input.sourceCurrency === "USD" ? input.amount * q.fx_rate_buy : input.amount / q.fx_rate_sell;
  if (Math.abs(q.target_amount - expected) > Math.max(q.target_amount * 0.005, 0.5)) return null;
  const validMs = Date.parse(q.valid_until);

  return {
    ...publicPrice(now),
    expiresAt: Number.isFinite(validMs) ? new Date(validMs).toISOString() : new Date(now.getTime() + 5 * 60_000).toISOString(),
    providerSlug: "rextie",
    providerName: "Rextie",
    senderCountry: "PE",
    product: { id: `rextie:${input.sourceCurrency.toLowerCase()}-${input.destinationCurrency.toLowerCase()}`, label: "Rextie · Peru online FX" },
    recipientAmount: Math.round(q.target_amount * 100) / 100,
    feeAmount: 0,
    feeCurrency: input.sourceCurrency,
    rate,
    paymentMethods: ["local_bank"],
    delivery: "10–15 minutes (same bank) to 24h",
    source: { label: "Rextie live FX calculator", url: "https://www.rextie.com/" },
    missing: ["Confirm Peruvian bank compatibility and any interbank transfer fee."],
    notes: [
      `Read directly from Rextie’s live Peru FX API ($0 fixed commission; buy ${q.fx_rate_buy} / sell ${q.fx_rate_sell} PEN per USD).`,
      "Requires a Peruvian USD and PEN bank account (BCP, Interbank, BBVA, BanBif or Scotiabank).",
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Walutomat (verified live HTTP 200 Poland/EU 46-pair FX brief 2026-11-27)   */
/* -------------------------------------------------------------------------- */

const WALUTOMAT_COUNTRIES = new Set([
  "PL", "DE", "FR", "ES", "IT", "NL", "BE", "IE", "PT", "AT", "FI", "SE", "DK", "NO",
  "CZ", "HU", "RO", "BG", "HR", "SK", "SI", "LT", "LV", "EE", "LU", "GR", "CY", "MT", "CH", "GB",
]);
const walutomatBriefShape = z.array(z.object({
  pair: z.string().regex(/^[A-Z]{3}_[A-Z]{3}$/),
  bestOffers: z.object({
    bid_now: z.number().finite().positive(),
    ask_now: z.number().finite().positive(),
  }),
}));

async function loadWalutomatBrief(fetcher: typeof fetch) {
  const res = await fetcher("https://user.walutomat.pl/api/public/marketBrief", {
    redirect: "error", signal: AbortSignal.timeout(4_500), headers: { Accept: "application/json" }, cache: "no-store",
  });
  if (!res.ok) return null;
  const parsed = walutomatBriefShape.safeParse(await res.json());
  return parsed.success ? parsed.data : null;
}

/**
 * Walutomat's live public 46-pair FX orderbook brief (Poland & EU personal and
 * business currency exchange). Verified live HTTP 200 on 2026-11-27.
 */
export async function walutomatPublicPrice(input: PriceCheckInput, fetcher: typeof fetch, now: Date, cache = true): Promise<PriceRow | null> {
  const context = input.context;
  if (!context || (context.paymentMethod && !["local_bank", "transfer_service"].includes(context.paymentMethod))) return null;
  if (!WALUTOMAT_COUNTRIES.has(context.country) && input.sourceCurrency !== "PLN" && input.destinationCurrency !== "PLN") return null;

  const brief = await (cache ? shared("walutomat:market-brief", 60_000, () => loadWalutomatBrief(fetcher)) : loadWalutomatBrief(fetcher)).catch(() => null);
  if (!brief) return null;
  const directKey = `${input.sourceCurrency}_${input.destinationCurrency}`;
  const inverseKey = `${input.destinationCurrency}_${input.sourceCurrency}`;
  const direct = brief.find((item) => item.pair === directKey);
  const inverse = direct ? undefined : brief.find((item) => item.pair === inverseKey);
  if (!direct && !inverse) return null;

  const rate = direct ? direct.bestOffers.bid_now : Math.round((1 / inverse!.bestOffers.ask_now) * 1_000_000) / 1_000_000;
  // Standard Walutomat exchange commission is 0.20% (lower for high volume).
  const feeAmount = Math.round(input.amount * 0.002 * 100) / 100;
  const recipientAmount = Math.round((input.amount - feeAmount) * rate * 100) / 100;
  if (!(recipientAmount > 0)) return null;

  return {
    ...publicPrice(now),
    expiresAt: new Date(now.getTime() + quoteLifetime).toISOString(),
    providerSlug: "walutomat",
    providerName: "Walutomat",
    senderCountry: context.country,
    product: { id: `walutomat:${input.sourceCurrency.toLowerCase()}-${input.destinationCurrency.toLowerCase()}`, label: "Walutomat · live FX orderbook" },
    recipientAmount,
    feeAmount,
    feeCurrency: input.sourceCurrency,
    rate,
    paymentMethods: ["local_bank"],
    delivery: "Immediate to 2 business days",
    source: { label: "Walutomat live orderbook", url: "https://www.walutomat.pl/" },
    missing: ["Confirm bank payout rail fee (up to 5 free PLN/EUR SEPA transfers/mo, then 1 PLN; non-SEPA 9 PLN)."],
    notes: [
      `Uses Walutomat’s live public best-${direct ? "bid" : "ask"} rate (${direct ? direct.bestOffers.bid_now : inverse!.bestOffers.ask_now}) minus Walutomat’s standard 0.20% exchange commission.`,
      "Bank withdrawal charges (0–9 PLN depending on SEPA vs non-SEPA) are separate.",
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Bitso (verified live HTTP 200 LatAm USD<->MXN/BRL/ARS/COP books 2026-11-27)*/
/* -------------------------------------------------------------------------- */

const BITSO_BOOKS: Record<string, string> = {
  MXN: "usd_mxn",
  BRL: "usd_brl",
  ARS: "usd_ars",
  COP: "usd_cop",
};
const bitsoSingleTickerShape = z.object({
  book: z.string(),
  bid: tgNumber,
  ask: tgNumber,
  created_at: z.string(),
});
const bitsoTickerEnvelopeShape = z.object({
  success: z.literal(true),
  payload: z.array(z.unknown()),
});

async function loadBitsoTickers(fetcher: typeof fetch) {
  const res = await fetcher("https://api.bitso.com/v3/ticker/", {
    redirect: "error", signal: AbortSignal.timeout(4_500), headers: { Accept: "application/json" }, cache: "no-store",
  });
  if (!res.ok) return null;
  const envelope = bitsoTickerEnvelopeShape.safeParse(await res.json());
  if (!envelope.success) return null;
  const parsed: Array<z.infer<typeof bitsoSingleTickerShape>> = [];
  for (const item of envelope.data.payload) {
    const row = bitsoSingleTickerShape.safeParse(item);
    if (row.success) parsed.push(row.data);
  }
  return parsed.length ? parsed : null;
}

/**
 * Bitso live public orderbook rates for LatAm USD <-> MXN, BRL, ARS and COP
 * (Digital Dollars / USDC rails). Verified live HTTP 200 on 2026-11-27.
 */
export async function bitsoPublicPrice(input: PriceCheckInput, fetcher: typeof fetch, now: Date, cache = true): Promise<PriceRow | null> {
  const isUsdToLatam = input.sourceCurrency === "USD" && Object.hasOwn(BITSO_BOOKS, input.destinationCurrency);
  const isLatamToUsd = input.destinationCurrency === "USD" && Object.hasOwn(BITSO_BOOKS, input.sourceCurrency);
  if (!isUsdToLatam && !isLatamToUsd) return null;
  const context = input.context;
  if (context?.paymentMethod && !["local_bank", "transfer_service"].includes(context.paymentMethod)) return null;

  const latamCcy = isUsdToLatam ? input.destinationCurrency : input.sourceCurrency;
  const bookName = BITSO_BOOKS[latamCcy]!;
  const tickers = await (cache ? shared("bitso:tickers", 60_000, () => loadBitsoTickers(fetcher)) : loadBitsoTickers(fetcher)).catch(() => null);
  const ticker = tickers?.find((t) => t.book === bookName);
  if (!ticker || !(ticker.bid > 0) || !(ticker.ask > 0)) return null;
  const ts = Date.parse(ticker.created_at);
  if (!Number.isFinite(ts) || now.getTime() - ts > 6 * 3_600_000 || ts > now.getTime() + 300_000) return null;

  const rate = isUsdToLatam ? ticker.bid : Math.round((1 / ticker.ask) * 1_000_000) / 1_000_000;
  const recipientAmount = Math.round(input.amount * rate * 100) / 100;
  if (!(recipientAmount > 0)) return null;

  return {
    ...publicPrice(new Date(ts)),
    expiresAt: new Date(now.getTime() + quoteLifetime).toISOString(),
    providerSlug: "bitso",
    providerName: "Bitso",
    product: { id: `bitso:${bookName}`, label: "Bitso · live orderbook FX" },
    recipientAmount,
    feeAmount: null,
    feeCurrency: input.sourceCurrency,
    rate,
    paymentMethods: ["local_bank"],
    delivery: "Instant (SPEI/Pix) to 1 business day",
    source: { label: "Bitso live orderbook", url: "https://bitso.com/fees" },
    missing: ["Volume-tiered Bitso trading fee and any USD wire/rail deposit charge."],
    notes: [
      `Uses Bitso’s live ${bookName.toUpperCase()} best-${isUsdToLatam ? "bid" : "ask"} orderbook price (${isUsdToLatam ? ticker.bid : ticker.ask}).`,
      "MXN SPEI deposits and withdrawals are free; confirm volume-tiered trading fee and business/personal eligibility in Bitso.",
    ],
  };
}
