import { z } from "zod";
import type { PriceCheckInput, PriceRow } from "../pricing.js";

const asporaSite = "https://www.aspora.com/";
const asporaHelp = "https://www.aspora.com/help/us/transfers";
const corridors = {
  INR: { country: "IN", xoomPath: "india", xoomPayoutIncrement: 1 },
  SGD: { country: "SG", xoomPath: "singapore", xoomPayoutIncrement: 0.01 },
  PHP: { country: "PH", xoomPath: "philippines", xoomPayoutIncrement: 0.01 },
  MXN: { country: "MX", xoomPath: "mexico", xoomPayoutIncrement: 1 },
  PKR: { country: "PK", xoomPath: "pakistan", xoomPayoutIncrement: 0.01 },
  NPR: { country: "NP", xoomPath: "nepal", xoomPayoutIncrement: 0.01 },
  BDT: { country: "BD", xoomPath: "bangladesh", xoomPayoutIncrement: 0.01 },
  KES: { country: "KE", xoomPath: "kenya", xoomPayoutIncrement: 0.01 },
  VND: { country: "VN", xoomPath: "vietnam", xoomPayoutIncrement: 100 },
  IDR: { country: "ID", xoomPath: "indonesia", xoomPayoutIncrement: 1 },
  DOP: { country: "DO", xoomPath: "dominican-republic", xoomPayoutIncrement: 1 },
  LKR: { country: "LK", xoomPath: "sri-lanka", xoomPayoutIncrement: 1 },
  RWF: { country: "RW", xoomPath: "rwanda", xoomPayoutIncrement: 1 },
} as const;
type Corridor = keyof typeof corridors;
const remitlyCorridors = {
  INR: { remitlyCountry: "IND", source: "https://www.remitly.com/us/en/currency-converter/usd-to-inr-rate" },
  SGD: { remitlyCountry: "SGP", source: "https://www.remitly.com/us/en/money-transfer/send-money-to-singapore" },
} as const;
const xoomOrigin = "https://www.xoom.com";

const asporaQuote = z.object({
  base_currency: z.literal("USD"),
  quote_currency: z.literal("INR"),
  send_amount: z.number().finite().positive(),
  providers: z.array(z.object({
    name: z.string(),
    quote: z.object({
      rate: z.number().finite().positive(),
      fee: z.number().finite().nonnegative(),
      received_amount: z.number().finite().positive(),
    }).optional(),
  })),
});

const numberString = z.string().regex(/^\d+(\.\d+)?$/).transform(Number).pipe(z.number().finite());
const remitlyQuote = z.object({
  estimate: z.object({
    conduit: z.object({
      source_country: z.literal("USA"),
      target_country: z.enum(["IND", "SGP"]),
      source_currency: z.object({ alpha3: z.literal("USD") }),
      target_currency: z.object({ alpha3: z.enum(["INR", "SGD"]) }),
    }),
    pay_in_method: z.literal("BANK"),
    pay_out_method: z.string(),
    send_amount: numberString,
    receive_amount: numberString,
    total_charge_amount: numberString,
    exchange_rate: z.object({
      promotional_exchange_rate: numberString,
      capped_promotional_exchange_rate_amount: numberString,
    }),
    fee: z.object({ total_fee_amount: numberString }),
  }),
});

export function usBankRemittanceCorridor(input: PriceCheckInput): Corridor | null {
  if (!Object.hasOwn(corridors, input.destinationCurrency)) return null;
  const currency = input.destinationCurrency as Corridor;
  const { country } = corridors[currency];
  const context = input.context;
  return input.sourceCurrency === "USD" && (!input.destinationCountry || input.destinationCountry === country)
    && context?.profile === "personal" && context.purpose === "personal"
    && (context.direction === "receive" ? context.country === country || input.destinationCountry === country : context.country === "US")
    && (!context.paymentMethod || context.paymentMethod === "local_bank" || context.paymentMethod === "transfer_service") ? currency : null;
}

function baseRow(): Pick<PriceRow, "basis" | "side" | "senderCountry" | "paymentMethods" | "feeCurrency" | "partial" | "delivery" | "totalCostPct"> {
  return {
    basis: "live_public",
    side: "payer",
    senderCountry: "US",
    paymentMethods: ["local_bank", "transfer_service"],
    feeCurrency: "USD",
    partial: true,
    delivery: null,
    totalCostPct: null,
  };
}

async function asporaBankQuote(amount: number, fetcher: typeof fetch, now: Date): Promise<PriceRow | null> {
  const response = await fetcher("https://api-z1.aspora.com/appserver/public-forex-provider/get-rates", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ base_currency: "USD", quote_currency: "INR", amount, payment_method: "" }),
    signal: AbortSignal.timeout(4_000),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) return null;

  const parsed = asporaQuote.safeParse(await response.json());
  if (!parsed.success || parsed.data.send_amount !== amount) return null;
  const quote = parsed.data.providers.find(provider => provider.name === "Aspora")?.quote;
  if (!quote || quote.fee >= amount || Math.abs(quote.received_amount - (amount - quote.fee) * quote.rate) > .011) return null;

  return {
    ...baseRow(),
    providerSlug: "aspora",
    providerName: "Aspora",
    product: { id: "aspora:usd-inr-bank", label: "Aspora · US bank-funded transfer" },
    recipientAmount: quote.received_amount,
    feeAmount: quote.fee,
    rate: quote.rate,
    observedAt: now.toISOString(),
    source: { label: "Aspora public calculator", url: asporaSite },
    missing: ["Confirm the sender’s account price"],
    notes: [
      "Aspora’s public calculator supplies the quoted fee and INR net of that fee. The US help centre describes funding from the sender’s own bank account.",
      "This estimate uses the public comparison calculator. Aspora may show a different fee, first-transfer offer or rate in the sender’s account.",
      asporaHelp,
    ],
  };
}

async function remitlyBankQuote(currency: keyof typeof remitlyCorridors, amount: number, fetcher: typeof fetch, now: Date): Promise<PriceRow | null> {
  const { remitlyCountry, source } = remitlyCorridors[currency];
  const params = new URLSearchParams({
    conduit: "USA:USD-" + remitlyCountry + ":" + currency, anchor: "SEND", amount: String(amount), purpose: "OTHER",
    customer_segment: "STANDARD", customer_recognition: "UNRECOGNIZED", strict_promo: "false",
  });
  const response = await fetcher("https://api.remitly.com/v3/calculator/estimate?" + params, {
    headers: { Accept: "application/json", "Accept-Language": "en-US" },
    signal: AbortSignal.timeout(4_000),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) return null;

  const parsed = remitlyQuote.safeParse(await response.json());
  if (!parsed.success) return null;
  const quote = parsed.data.estimate;
  const rate = quote.exchange_rate.promotional_exchange_rate;
  const fee = quote.fee.total_fee_amount;
  if (quote.conduit.target_country !== remitlyCountry || quote.conduit.target_currency.alpha3 !== currency
    || quote.send_amount !== amount || amount > quote.exchange_rate.capped_promotional_exchange_rate_amount
    || !(rate > 0) || !(quote.receive_amount > 0) || Math.abs(amount * rate - quote.receive_amount) > .011
    || Math.abs(amount + fee - quote.total_charge_amount) > .011) return null;

  const payout = quote.pay_out_method === "BANK_DEPOSIT" ? "Bank deposit" : "Confirm bank deposit at checkout";
  return {
    ...baseRow(),
    providerSlug: "remitly",
    providerName: "Remitly",
    product: { id: "remitly:usd-" + currency.toLowerCase() + "-bank", label: "Remitly · US bank-funded welcome offer" },
    recipientAmount: quote.receive_amount,
    feeAmount: fee,
    rate,
    observedAt: now.toISOString(),
    source: { label: "Remitly public calculator", url: source },
    publicOffer: { kind: "first_transfer", fundingMethod: "US bank account", payoutMethod: payout, displayUntil: new Date(now.getTime() + 86_400_000).toISOString() },
    notes: [
      "For eligible first-time Remitly customers. The amount is funded from a US bank account.",
      "Confirm bank deposit, the final rate, charges and delivery in the sender’s account.",
    ],
  };
}

const xoomMoney = z.object({ rawValue: numberString, currencyCode: z.string() });
const xoomResponse = z.object({
  sourceCurrency: z.literal("USD"),
  destinationCurrency: z.string().regex(/^[A-Z]{3}$/),
  destinationCountry: z.string().regex(/^[A-Z]{2}$/),
  validations: z.array(z.unknown()).optional(),
  quote: z.object({ pricing: z.array(z.object({
    paymentType: z.object({ type: z.string() }),
    disbursementType: z.string(),
    validations: z.array(z.unknown()).optional(),
    sendAmount: xoomMoney,
    receiveAmount: xoomMoney,
    feeAmount: xoomMoney,
    fxRate: z.object({ rate: numberString }),
    tags: z.array(z.object({ type: z.string() })).nullish(),
  })) }),
});

export function xoomCalculatorUrl(currency: Corridor): string {
  return xoomOrigin + "/" + corridors[currency].xoomPath + "/send-money?locale=en-us";
}

export function xoomBankQuoteRow(currency: Corridor, amount: number, quote: {
  received: number; rate: number; fee: number; firstTransfer: boolean | null;
}, now: Date): PriceRow | null {
  // The calculator rounds the recipient amount differently on each corridor.
  const tolerance = corridors[currency].xoomPayoutIncrement / 2 + .01;
  if (!(quote.received > 0) || !(quote.rate > 0) || !(quote.fee >= 0)
    || Math.abs(amount * quote.rate - quote.received) > tolerance) return null;
  const expiresAt = new Date(now.getTime() + 15 * 60_000).toISOString();
  return {
    ...baseRow(),
    providerSlug: "xoom",
    providerName: "Xoom",
    product: { id: "xoom:usd-" + currency.toLowerCase() + "-bank", label: "Xoom · US bank-funded deposit" },
    recipientAmount: quote.received,
    feeAmount: quote.fee,
    rate: quote.rate,
    observedAt: now.toISOString(),
    expiresAt,
    source: { label: "Xoom public calculator", url: xoomCalculatorUrl(currency) },
    ...(quote.firstTransfer ? { publicOffer: { kind: "first_transfer" as const, fundingMethod: "US bank account (ACH)", payoutMethod: "Bank deposit", displayUntil: expiresAt } } : {}),
    notes: [
      "US bank funding (ACH) and bank deposit. The funding fee is charged separately from the amount sent.",
      quote.firstTransfer ? "The FX rate is for an eligible first transfer." : "Confirm the applicable rate and any offer at checkout.",
    ],
  };
}

async function xoomBankQuote(currency: Corridor, amount: number, fetcher: typeof fetch, now: Date): Promise<PriceRow | null> {
  const source = xoomCalculatorUrl(currency);
  const signal = AbortSignal.timeout(6_000);
  // Xoom issues its guest calculator cookies on the public page. Use only that new session for this quote.
  const page = await fetcher(source, { signal, redirect: "error", cache: "no-store", headers: { "Accept-Language": "en-US" } });
  if (!page.ok) return null;
  const cookies = page.headers.getSetCookie().map(header => header.split(";", 1)[0]);
  await page.body?.cancel().catch(() => {});
  if (!cookies.some(cookie => cookie?.startsWith("CSRF="))) return null;

  const country = corridors[currency].country;
  const response = await fetcher(xoomOrigin + "/wapi/guest-app/remittance", {
    method: "POST",
    headers: { Cookie: cookies.join("; "), Origin: xoomOrigin, Referer: source, Accept: "application/json", "Content-Type": "application/json", "Accept-Language": "en-US" },
    body: JSON.stringify({ variables: { sourceCurrency: "USD", destinationCountry: country, destinationCurrency: currency, amount: String(amount), target: "SEND_AMOUNT" } }),
    signal,
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) return null;
  const parsed = xoomResponse.safeParse(await response.json());
  if (!parsed.success || parsed.data.destinationCountry !== country || parsed.data.destinationCurrency !== currency || parsed.data.validations?.length) return null;
  const quote = parsed.data.quote.pricing.find(item => item.disbursementType === "DEPOSIT" && item.paymentType.type === "ACH");
  if (!quote || quote.validations?.length || quote.sendAmount.rawValue !== amount || quote.sendAmount.currencyCode !== "USD"
    || quote.receiveAmount.currencyCode !== currency || quote.feeAmount.currencyCode !== "USD") return null;

  return xoomBankQuoteRow(currency, amount, {
    received: quote.receiveAmount.rawValue, rate: quote.fxRate.rate, fee: quote.feeAmount.rawValue,
    firstTransfer: quote.tags?.some(tag => tag.type === "FIRST_TIME_RATE") ?? null,
  }, now);
}

export async function usBankRemittanceRows(currency: Corridor, amount: number, fetcher: typeof fetch, now: Date): Promise<PriceRow[]> {
  const rows = await Promise.allSettled([
    currency === "INR" ? asporaBankQuote(amount, fetcher, now) : Promise.resolve(null),
    currency === "INR" || currency === "SGD" ? remitlyBankQuote(currency, amount, fetcher, now) : Promise.resolve(null),
    xoomBankQuote(currency, amount, fetcher, now),
  ]);
  return rows.flatMap(result => result.status === "fulfilled" && result.value ? [result.value] : []);
}
