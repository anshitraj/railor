import { z } from "zod";
import type { PriceCheckInput, PriceRow } from "../pricing.js";

const asporaSite = "https://www.aspora.com/";
const asporaSources = {
  USD: { senders: ["US"], help: "https://www.aspora.com/help/us/transfers" },
  GBP: { senders: ["GB"], help: "https://www.aspora.com/help/gb/transfers" },
  AED: { senders: ["AE"], help: "https://www.aspora.com/help/ae/transfers" },
  EUR: { senders: ["DE", "IE", "IT"], help: "https://www.aspora.com/help/gb/referrals" },
};
type AsporaCurrency = keyof typeof asporaSources;
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
  XAF: { country: "CM", xoomPath: "cameroon", xoomPayoutIncrement: 1 },
  BRL: { country: "BR", xoomPath: "brazil", xoomPayoutIncrement: 0.01 },
} as const;
type Corridor = keyof typeof corridors;
const remitlyCorridors = {
  INR: { remitlyCountry: "IND", source: "https://www.remitly.com/us/en/currency-converter/usd-to-inr-rate" },
  SGD: { remitlyCountry: "SGP", source: "https://www.remitly.com/us/en/money-transfer/send-money-to-singapore" },
  XAF: { remitlyCountry: "CMR", source: "https://www.remitly.com/us/en/cameroon/pricing" },
  BRL: { remitlyCountry: "BRA", source: "https://www.remitly.com/us/en/currency-converter/usd-to-brl-rate" },
} as const;
const xoomOrigin = "https://www.xoom.com";

const asporaQuote = z.object({
  base_currency: z.enum(["USD", "GBP", "AED", "EUR"]),
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
      target_country: z.string().regex(/^[A-Z]{3}$/),
      source_currency: z.object({ alpha3: z.literal("USD") }),
      target_currency: z.object({ alpha3: z.string().regex(/^[A-Z]{3}$/) }),
    }),
    pay_in_method: z.literal("BANK"),
    pay_out_method: z.string(),
    send_amount: numberString,
    receive_amount: numberString,
    total_charge_amount: numberString,
    exchange_rate: z.object({
      base_rate: numberString.nullish(),
      promotional_exchange_rate: numberString.nullish(),
      capped_promotional_exchange_rate_amount: numberString.nullish(),
    }),
    fee: z.object({ total_fee_amount: numberString }),
    discount: z.object({ fee_discount_amount: numberString, send_discount_amount: numberString }).nullish(),
    tax_details: z.array(z.object({ amount: numberString, type: z.string() })).nullish(),
  }),
});

export function usBankRemittanceCorridor(input: PriceCheckInput): Corridor | null {
  if (!Object.hasOwn(corridors, input.destinationCurrency)) return null;
  const currency = input.destinationCurrency as Corridor;
  const { country } = corridors[currency];
  const context = input.context;
  if (currency === "XAF" && !input.destinationCountry && (context?.direction !== "receive" || context.country !== "CM")) return null;
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

export function asporaQuoteCurrency(input: PriceCheckInput): AsporaCurrency | null {
  const context = input.context;
  if (input.destinationCurrency !== "INR" || (input.destinationCountry && input.destinationCountry !== "IN")
    || context?.profile !== "personal" || context.purpose !== "personal"
    || (context.paymentMethod && !["local_bank", "transfer_service"].includes(context.paymentMethod))
    || !Object.hasOwn(asporaSources, input.sourceCurrency)) return null;
  const currency = input.sourceCurrency as AsporaCurrency;
  return (context.direction === "send" ? asporaSources[currency].senders.includes(context.country) : context.country === "IN") ? currency : null;
}

export async function asporaBankQuote(currency: AsporaCurrency, amount: number, fetcher: typeof fetch, now: Date): Promise<PriceRow | null> {
  const response = await fetcher("https://api-z1.aspora.com/appserver/public-forex-provider/get-rates", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ base_currency: currency, quote_currency: "INR", amount, payment_method: "" }),
    signal: AbortSignal.timeout(4_000),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) return null;

  const parsed = asporaQuote.safeParse(await response.json());
  if (!parsed.success || parsed.data.base_currency !== currency || parsed.data.send_amount !== amount) return null;
  const quote = parsed.data.providers.find(provider => provider.name === "Aspora")?.quote;
  if (!quote || quote.fee >= amount || Math.abs(quote.received_amount - (amount - quote.fee) * quote.rate) > .011) return null;

  return {
    ...baseRow(),
    senderCountry: asporaSources[currency].senders.length === 1 ? asporaSources[currency].senders[0] : undefined,
    feeCurrency: currency,
    providerSlug: "aspora",
    providerName: "Aspora",
    product: { id: `aspora:${currency.toLowerCase()}-inr-bank`, label: `Aspora · ${currency} to INR calculator` },
    recipientAmount: quote.received_amount,
    feeAmount: quote.fee,
    rate: quote.rate,
    observedAt: now.toISOString(),
    source: { label: "Aspora public calculator", url: asporaSite },
    missing: ["Confirm the sender’s account price"],
    notes: [
      "The public calculator supplies the fee and payout after that fee. Confirm which funding option and rate apply in the sender’s account.",
      "This estimate uses the public comparison calculator. Aspora may show a different fee, first-transfer offer or rate in the sender’s account.",
      asporaSources[currency].help,
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
  const { base_rate: baseRate, promotional_exchange_rate: promoRate, capped_promotional_exchange_rate_amount: cap } = quote.exchange_rate;
  const promoAmount = promoRate && cap ? Math.min(amount, cap) : 0;
  const remaining = amount - promoAmount;
  if (remaining > 0 && !(baseRate && baseRate > 0)) return null;
  const received = promoAmount * (promoRate ?? 0) + remaining * (baseRate ?? 0);
  const grossFee = quote.fee.total_fee_amount;
  const feeDiscount = quote.discount?.fee_discount_amount ?? 0;
  const sendDiscount = quote.discount?.send_discount_amount ?? 0;
  const taxes = quote.tax_details ?? [];
  const tax = taxes.reduce((total, entry) => total + entry.amount, 0);
  const fee = Math.round((quote.total_charge_amount - amount) * 100) / 100;
  if (quote.conduit.target_country !== remitlyCountry || quote.conduit.target_currency.alpha3 !== currency
    || quote.send_amount !== amount || fee < 0 || feeDiscount > grossFee
    || !(quote.receive_amount > 0) || Math.abs(received - quote.receive_amount) > (currency === "XAF" ? .51 : .011)
    || Math.abs(grossFee + tax - feeDiscount - sendDiscount - fee) > .011) return null;

  const payout = ({ BANK_DEPOSIT: "Bank deposit", CASH_PICKUP: "Cash pickup", MOBILE_MONEY: "Mobile money", DEBIT_CARD: "Debit card deposit" } as Record<string, string>)[quote.pay_out_method]
    ?? "Confirm payout method at checkout";
  const expiresAt = new Date(now.getTime() + 15 * 60_000).toISOString();
  return {
    ...baseRow(),
    providerSlug: "remitly",
    providerName: "Remitly",
    product: { id: "remitly:usd-" + currency.toLowerCase() + "-bank", label: promoAmount ? "Remitly · US bank-funded welcome offer" : "Remitly · US bank-funded transfer" },
    recipientAmount: quote.receive_amount,
    feeAmount: fee,
    rate: received / amount,
    observedAt: now.toISOString(),
    expiresAt,
    source: { label: "Remitly public calculator", url: source },
    ...(promoAmount ? { publicOffer: { kind: "first_transfer" as const, fundingMethod: "US bank account", payoutMethod: payout, displayUntil: expiresAt } } : {}),
    ...(tax ? {
      taxIncluded: true,
      taxNote: `Remitly’s total includes ${taxes.map(entry => `USD ${entry.amount.toFixed(2)} ${entry.type}`).join(" + ")}.`,
      feeBreakdown: `USD ${grossFee.toFixed(2)} quoted fee − USD ${feeDiscount.toFixed(2)} fee discount + USD ${tax.toFixed(2)} tax${sendDiscount ? ` − USD ${sendDiscount.toFixed(2)} transfer discount` : ""}`,
    } : {}),
    notes: [
      "The calculator used funding from a US bank account.",
      ...(promoAmount ? ["Welcome rates are for eligible first transfers."] : []),
      ...(promoAmount && remaining > 0 ? [`The calculator applied its welcome rate to the first USD ${cap} and its standard rate to the rest.`] : []),
      `Payout method: ${payout}. Confirm final charges and delivery in the sender’s account.`,
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

export function remitlyCalculatorUrl(currency: Corridor): string | null {
  return Object.hasOwn(remitlyCorridors, currency) ? remitlyCorridors[currency as keyof typeof remitlyCorridors].source : null;
}

export function remitlyBrowserQuoteRow(currency: Corridor, amount: number, quote: {
  received: number; rate: number; fee: number; firstTransfer: boolean | null;
}, now: Date): PriceRow | null {
  const url = remitlyCalculatorUrl(currency);
  if (!url || !(quote.received > 0) || !(quote.rate > 0) || !(quote.fee >= 0)
    || Math.abs(amount * quote.rate - quote.received) > (currency === "XAF" ? .51 : .011)) return null;
  const expiresAt = new Date(now.getTime() + 15 * 60_000).toISOString();
  return {
    ...baseRow(), providerSlug: "remitly", providerName: "Remitly",
    product: { id: `remitly:usd-${currency.toLowerCase()}-bank`, label: "Remitly · US bank-funded deposit" },
    recipientAmount: quote.received, rate: quote.rate, feeAmount: quote.fee,
    observedAt: now.toISOString(), expiresAt,
    source: { label: "Remitly public calculator", url },
    ...(quote.firstTransfer ? { publicOffer: { kind: "first_transfer" as const, fundingMethod: "US bank account", payoutMethod: "Bank deposit", displayUntil: expiresAt } } : {}),
    notes: ["Public US bank funding and bank deposit. Verify the final offer, charges and applicable taxes in the sender’s account."],
  };
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

async function ofxIndiaPublicCalculator(amount: number, fetcher: typeof fetch, now: Date): Promise<PriceRow | null> {
  if (amount < 150) return null;
  const source = "https://www.ofx.com/en-us/send-money/india/";
  const endpoint = `https://api.ofx.com/PublicSite.ApiService/OFX/spotrate/Individual/USD/INR/${amount}`;
  const response = await fetcher(endpoint, { signal: AbortSignal.timeout(6000), redirect: "error", headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  const quote = z.object({
    CustomerRate: z.number().finite().positive(),
    CustomerAmount: z.number().finite().positive(),
    Fee: z.number().finite().nonnegative(),
    DeliveryCountry: z.literal("India"),
  }).safeParse(await response.json());
  if (!quote.success) return null;
  const { CustomerRate: rate, CustomerAmount: received, Fee: fee } = quote.data;
  // The API does not echo the send amount. Independently check the payout
  // against the requested principal and the displayed four-decimal rate.
  if (Math.abs(received - rate * amount) > 0.02 + amount * 0.00005) return null;
  return {
    ...baseRow(), providerSlug: "ofx", providerName: "OFX",
    product: { id: "ofx:us-india-individual", label: "OFX · US personal transfer to India" },
    rate, recipientAmount: received, feeAmount: fee, costComplete: false,
    feeBreakdown: "OFX fee added to the transfer principal",
    observedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
    missing: ["Rate and charges for your chosen funding method and account."],
    notes: ["OFX’s US-to-India calculator returns an amount-specific customer rate and provider fee. Custom account rates and any third-party bank deductions are confirmed separately."],
    source: { label: "OFX US-to-India public calculator", url: source },
  };
}

const worldRemitCalculation = z.object({
  data: z.object({ createCalculation: z.object({
    errors: z.tuple([]),
    calculation: z.object({
      id: z.null(),
      send: z.object({ currency: z.literal("USD"), amount: z.number().finite().positive() }),
      receive: z.object({ currency: z.literal("INR"), amount: z.number().finite().positive() }),
      rounding: z.object({ receiveRoundingSeed: z.number().finite().positive().max(1) }),
      exchangeRate: z.object({ value: z.number().finite().positive(), crossedOutValue: z.null() }),
      informativeSummary: z.object({
        fee: z.object({ value: z.object({ amount: z.number().finite().nonnegative(), currency: z.literal("USD") }) }),
        discount: z.null(),
        appliedPromotions: z.union([z.null(), z.tuple([])]),
        totalToPay: z.object({ amount: z.number().finite().positive() }),
      }),
    }),
  }) }),
});

async function worldRemitIndiaPublicCalculator(amount: number, fetcher: typeof fetch, now: Date): Promise<PriceRow | null> {
  const source = "https://www.worldremit.com/en-us/india";
  // This is the preview calculation used by the public country page.
  // No recipient, customer or payment details are sent.
  const query = `mutation createCalculation($amount: BigDecimal!, $sendCountry: CountryCode!, $sendCurrency: CurrencyCode!, $receiveCountry: CountryCode!, $receiveCurrency: CurrencyCode!) {
    createCalculation(calculationInput: {
      amount: $amount, type: SEND, send: { country: $sendCountry, currency: $sendCurrency },
      receive: { country: $receiveCountry, currency: $receiveCurrency }, payOutMethodCode: "BNK", correspondentId: ""
    }) {
      calculation {
        id send { currency amount } receive { currency amount } rounding { receiveRoundingSeed }
        exchangeRate { value crossedOutValue }
        informativeSummary {
          fee { value { currency amount } } discount { value { currency amount } }
          appliedPromotions totalToPay { amount }
        }
      }
      errors { __typename }
    }
  }`;
  const response = await fetcher("https://api.worldremit.com/graphql", {
    method: "POST", signal: AbortSignal.timeout(6000), redirect: "error",
    headers: { "Content-Type": "application/json", "x-wr-platform": "Web", "x-wr-requestid": crypto.randomUUID() },
    body: JSON.stringify({ operationName: "createCalculation", query, variables: {
      amount, sendCountry: "US", sendCurrency: "USD", receiveCountry: "IN", receiveCurrency: "INR",
    } }),
  });
  if (!response.ok) return null;
  const parsed = worldRemitCalculation.safeParse(await response.json());
  if (!parsed.success) return null;
  const quote = parsed.data.data.createCalculation.calculation;
  const { receive, send, informativeSummary, exchangeRate, rounding } = quote;
  const { fee, totalToPay } = informativeSummary;
  if (send.amount !== amount || Math.abs(totalToPay.amount - amount - fee.value.amount) > 0.011
    || Math.abs(receive.amount - amount * exchangeRate.value) > rounding.receiveRoundingSeed / 2 + 0.01) return null;
  return {
    ...baseRow(), providerSlug: "world-remit", providerName: "WorldRemit",
    product: { id: "world-remit:us-india-deposit", label: "WorldRemit · deposit to an Indian bank" },
    rate: exchangeRate.value, recipientAmount: receive.amount, feeAmount: fee.value.amount,
    feeBreakdown: "Published preview fee added to the transfer principal",
    costComplete: false, observedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
    missing: ["Final price for the payer’s funding method."],
    notes: ["The calculator prices bank deposit to India before the payer chooses how to fund the transfer. Indian bank accounts must be personal accounts. https://www.worldremit.com/en-us/india/banks"],
    source: { label: "WorldRemit US-to-India calculator", url: source },
  };
}

export async function usBankRemittanceRows(currency: Corridor, amount: number, fetcher: typeof fetch, now: Date): Promise<PriceRow[]> {
  const rows = await Promise.allSettled([
    currency === "INR" ? asporaBankQuote("USD", amount, fetcher, now) : Promise.resolve(null),
    Object.hasOwn(remitlyCorridors, currency) ? remitlyBankQuote(currency as keyof typeof remitlyCorridors, amount, fetcher, now) : Promise.resolve(null),
    xoomBankQuote(currency, amount, fetcher, now),
    currency === "INR" ? ofxIndiaPublicCalculator(amount, fetcher, now) : Promise.resolve(null),
    currency === "INR" ? worldRemitIndiaPublicCalculator(amount, fetcher, now) : Promise.resolve(null),
  ]);
  return rows.flatMap(result => result.status === "fulfilled" && result.value ? [result.value] : []);
}
