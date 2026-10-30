import { wisePublicQuote } from "./payments/adapters/wise.js";
import { revolutPublicReference } from "./public-pricing/revolut.js";
import type { UnifiedQuote } from "./unified.js";
import { remittanceSurvey, type RemittanceSurvey } from "./public-pricing/remittances.js";
import { skydoPublicFx } from "./public-pricing/skydo.js";
import { mulyaPublicFx } from "./public-pricing/mulya.js";
import { comparisonRows, type ComparisonFeed } from "./public-pricing/comparisons.js";
import { publicOfferRows } from "./public-pricing/offers.js";
import { CustomerContext, assessCustomerProfile, type ProviderProfileAssessment } from "./customer-profiles.js";
import { applyWebChecks, priceCheckClaims, type RowWebCheck, type WebCheckClaim, type WebCheckResult, type WebCheckSummary } from "./web-check.js";

/**
 * Price check: "send X of A, how much B arrives, through whom?" Every number
 * carries where it came from, because they are not equally strong:
 *
 *   exact            a live quote from the customer's own connected account
 *   live_public      an anonymous provider quote or FX reference (fee completeness labelled)
 *   published        the provider's published price schedule, applied here
 *                    at a reference rate (read from the source URL on `observedAt`)
 *   market_estimate  prices Wise collects from other providers' public sites
 *                    (its comparison feed) — consumer pricing, dated
 *
 * Rows are ranked by what the recipient gets; a row whose cost is incomplete
 * (e.g. an FX quote without the transfer fee) is never ranked against
 * complete ones. With a web-check dependency, what each row implies is also
 * checked against Google Search (see web-check.ts) before ranking.
 */

export type PriceBasis = "exact" | "live_public" | "published" | "market_estimate";

export interface PriceCheckInput {
  sourceCurrency: string;
  destinationCurrency: string;
  destinationCountry?: string;
  amount: number;
  includeMarket?: boolean;
  context?: CustomerContext;
}

export interface PriceRow {
  providerSlug: string;
  providerName: string;
  /** Logo for providers Railor doesn't have a record of (market feed); otherwise resolved by slug. */
  logoUrl?: string;
  basis: PriceBasis;
  recipientAmount: number | null;
  feeAmount: number | null;
  feeCurrency: string | null;
  rate: number | null;
  rateSource?: { label: string; url: string; observedAt: string };
  /** 1 − recipient ÷ (amount × reference rate): everything the route costs, fee and FX together. */
  totalCostPct: number | null;
  /** Complete rows can be ranked; partial ones are missing a cost component. */
  partial: boolean;
  delivery: string | null;
  /** Source timestamp; empty when a comparison feed supplies no collection time. */
  observedAt: string;
  expiresAt?: string;
  source: { label: string; url?: string };
  notes: string[];
  /**
   * Filled after ranking: how much less arrives than through the best complete
   * price a business can act on (exact, live public or published). Negative
   * for a market estimate that beats it.
   */
  shortfall?: number | null;
  profileAssessment?: ProviderProfileAssessment;
  /** The source's own cost coverage, before any profile rule: false for an FX-only figure. */
  costComplete?: boolean;
  /**
   * When receiving: "payer" rows price a service the sender uses (the
   * recipient only needs a bank account); "recipient" rows are an account the
   * recipient holds. Unset when sending.
   */
  side?: "payer" | "recipient";
  webChecks?: RowWebCheck[];
  /** Amount-checked public observation. Freshness never changes its source into an account quote. */
  publicComparison?: {
    amount: number; sourceCurrency: string; destinationCurrency: string;
    sourceCountry: string | null; destinationCountry: string | null; freshUntil: string;
  };
  /** Conditional calculator capture; the display deadline is not a provider rate guarantee. */
  publicOffer?: { kind: "first_transfer"; fundingMethod: string; payoutMethod: string; displayUntil: string };
}

export interface PriceUnavailable {
  providerSlug: string;
  providerName: string;
  reason: string;
  /** The customer could get an exact price by connecting this provider. */
  connectable?: boolean;
}

export interface PriceCheckResult {
  input: PriceCheckInput;
  reference: { rate: number; source: string; observedAt: string } | null;
  rows: PriceRow[];
  unavailable: PriceUnavailable[];
  generatedAt: string;
  /** Railor account observations are separate from customer prices and every price ranking. */
  platformQuotes?: PlatformQuoteCheck[];
  /**
   * The broader provider market tracked by Railor. These are coverage records,
   * not prices: a provider is never promoted into `rows` until there is enough
   * evidence to calculate or fetch a price for this request.
   */
  marketCoverage?: MarketCoverage;
  /** Surveyed fees at their original amounts and dates, never current quotes or ranked prices. */
  historicalPricing?: RemittanceSurvey;
  /** Google-grounded checks of the rows; absent when no web-check dependency was given. */
  webCheck?: WebCheckSummary;
}

export interface MarketCoverageProvider {
  /** Explicit directional product evidence; never inferred from a bag of currencies. */
  routeMatch?: boolean;
  discoverySources?: Array<{ label: string; url: string }>;
  providerSlug: string;
  providerName: string;
  websiteUrl: string | null;
  category: string;
  currencyMatch: "both" | "destination" | "unverified";
  lastVerified: string | null;
  pricingStatus?: { label: string; reason: string };
  feeEvidence?: Array<{ summary: string; product: string; sourceUrl: string | null; observedAt: string | null }>;
}

export interface MarketCoverage {
  /** Full maintained provider directory; some entries are infrastructure without a verified quote. */
  totalTracked: number;
  /** Providers whose catalogued currencies include the selected destination. */
  matched: number;
  providers: MarketCoverageProvider[];
  /** Full catalog for discovery/search, including providers whose route is not confirmed. */
  allProviders?: MarketCoverageProvider[];
}

export interface PlatformQuoteCheck {
  providerSlug: string;
  providerName: string;
  environment: "sandbox" | "production";
  status: "quoted" | "unavailable";
  quote: UnifiedQuote | null;
  error: string | null;
}

export interface PriceCheckDeps {
  platformQuotes?: (input: PriceCheckInput) => Promise<PlatformQuoteCheck[]>;
  /** Live quotes from the organization's connected accounts (credentials stay in the web app). */
  connectedQuotes?: (input: PriceCheckInput) => Promise<Array<{ providerSlug: string; providerName: string; quote?: UnifiedQuote; error?: string }>>;
  /** Providers the customer could connect for an exact price, with whether they're connected already. */
  connectable?: Array<{ slug: string; name: string; connected: boolean }>;
  /** Known web checks for these claims, and which are still running. Must not wait for new checks. */
  webChecks?: (claims: WebCheckClaim[]) => Promise<{ results: WebCheckResult[]; pending: ReadonlySet<string>; configured: boolean; paused?: boolean }>;
  fetcher?: typeof fetch;
  now?: Date;
}

interface PublishedSchedule {
  slug: string;
  name: string;
  sourceUrl: string;
  observedAt: string;
  /** Null when the schedule applies; otherwise why it doesn't. */
  appliesTo(input: PriceCheckInput): string | null;
  /** Fee in USD or in the source currency, as the provider publishes it. */
  fee(input: PriceCheckInput, amountUsd: number | null, referenceRate?: number | null): { amount: number; currency: string; parts: string[] } | null;
  notes: string[];
  /** Some published pages explicitly exclude partner/banking charges. */
  partial?: boolean;
}

const intoIndia = (input: PriceCheckInput) =>
  input.destinationCurrency.toUpperCase() === "INR" && input.sourceCurrency.toUpperCase() !== "INR" && (!input.destinationCountry || input.destinationCountry === "IN")
    ? null
    : "Published pricing covers money arriving in India (INR) only.";

const commercialIntoIndia = (input: PriceCheckInput) => input.context?.country === "IN" && input.context.direction === "receive" && input.context.profile !== "personal" && input.context.purpose === "services" ? intoIndia(input) : "This published model requires an Indian commercial service-export recipient.";

/** Read from each provider's own site on `observedAt`. Re-check before relying on them. */
export const PUBLISHED_PRICING: PublishedSchedule[] = [
  {
    slug: "refrens", name: "Refrens · bank transfer", sourceUrl: "https://www.refrens.com/receive-international-payments-india", observedAt: "2026-10-30",
    appliesTo: input => input.sourceCurrency === "USD" ? commercialIntoIndia(input) : "This USD model uses the published USD 60 cap; other currency caps need confirmation.",
    fee: input => ({ amount: round(Math.min(input.amount * .015, 60)), currency: "USD", parts: ["1.5% standard bank/ACH/wire fee capped at USD 60; taxes included"] }),
    partial: true,
    notes: ["Published bank-transfer model only. Card payments have different fees. The provider describes additional FX conversion loss without an amount-specific rate; the displayed receipt is a reference before that unknown FX cost.", "Negotiated lower fees and current payment-product onboarding must be confirmed."],
  },
  {
    slug: "salt", name: "Salt · inward remittance", sourceUrl: "https://www.salt.pe/international-payments", observedAt: "2026-10-30", appliesTo: commercialIntoIndia,
    fee: input => ({ amount: round(input.amount * .0175), currency: input.sourceCurrency, parts: ["1.75% published fee including GST"] }),
    partial: true,
    notes: ["The public product page advertises no FX markup. Its calculator currently exposes no usable rate; current product availability and transaction terms have not been independently confirmed.", "Shown as a conditional published reference at the common FX rate, not a live quote or a complete-price recommendation."],
  },
  {
    slug: "dashx", name: "DashX", sourceUrl: "https://dashx.xyz/tools/currency-converter", observedAt: "2026-10-29", appliesTo: commercialIntoIndia,
    fee: input => ({ amount: round(input.amount * .003), currency: input.sourceCurrency, parts: ["0.30% published platform fee; tax inclusion unconfirmed"] }),
    partial: true,
    notes: ["The provider's public currency converter and official llms.txt publish a flat 0.30% fee and zero FX markup. This reference uses the common FX rate; it is not a locked DashX account quote.", "The homepage calculator's rate is not ingested as a live quote because it supplies no verified rate timestamp or complete tax breakdown.", "Taxes and account/partner conditions must be confirmed; this may be cheaper but cannot be certified as the lowest all-in price."],
  },
  {
    slug: "mulya", name: "Mulya",
    sourceUrl: "https://www.mulya.co/", observedAt: "2026-10-29", appliesTo: commercialIntoIndia,
    fee: input => ({ amount: round(input.amount * .01), currency: input.sourceCurrency, parts: ["1% all-inclusive published fee; provider states no additional GST"] }),
    notes: ["The provider advertises zero FX markup and free remittance documents. Modeled at the common reference rate, not a locked account quote.", "Confirm the supported collection method, payer country, account eligibility and settlement amount before receiving funds."],
  },
  {
    slug: "infinity", name: "Infinity",
    sourceUrl: "https://www.infinityapp.in/", observedAt: "2026-10-29",
    appliesTo: commercialIntoIndia,
    fee: (input, amountUsd) => amountUsd !== null && amountUsd <= 50_000 ? { amount: round(input.amount * .005), currency: input.sourceCurrency, parts: ["0.5% all-inclusive standard fee; GST included as stated by the provider"] } : null,
    notes: ["Published standard bank-collection estimate at Railor's reference FX rate, not a locked Infinity quote.", "Provider states zero FX markup. Above USD 50,000, request custom pricing. Account, payer and transaction eligibility still apply.", "GST inclusion source: https://www.infinityapp.in/blog/international-payments-india-startup-founders"],
  },
  {
    slug: "payglocal", name: "PayGlocal · bank collections",
    sourceUrl: "https://payglocal.in/compare/payglocal-vs-skydo", observedAt: "2026-10-29",
    appliesTo: commercialIntoIndia,
    fee: (_input, amountUsd) => amountUsd === null ? null : { amount: round((amountUsd <= 2000 ? 10 : amountUsd <= 7500 ? 18 : amountUsd * .0025) * 1.18), currency: "USD", parts: [amountUsd <= 2000 ? "USD 10 through USD 2,000" : amountUsd <= 7500 ? "USD 18 through USD 7,500" : "0.25% above USD 7,500", "18% GST on the fee"] },
    notes: ["Bank-transfer collection product, not card checkout. Published zero FX markup; illustrated at the common reference rate, not PayGlocal's executable quote.", "The headline 'from 0.25%' is not applied to small invoices: the published flat-fee slabs apply first."],
  },
  {
    slug: "razorpay", name: "Razorpay · MoneySaver bank transfer",
    sourceUrl: "https://razorpay.com/accept-international-payments/money-saver/", observedAt: "2026-10-29",
    appliesTo: commercialIntoIndia,
    fee: (input, _amountUsd, referenceRate) => referenceRate ? { amount: round((input.amount * referenceRate < 100_000 ? 1000 : input.amount * referenceRate * .01) * 1.18), currency: "INR", parts: ["INR 1,000 flat below INR 100,000; otherwise 1%", "18% GST on the fee"] } : null,
    notes: ["MoneySaver's standard bank-transfer product, not Razorpay card processing or its 2% payment-link product.", "Minimum fee is in INR and is compared to the invoice's INR equivalent. Expired promotional fee waivers are excluded. Zero published FX markup is illustrated at Railor's reference rate."],
  },
  {
    slug: "winvesta", name: "Winvesta · standard collection plan",
    sourceUrl: "https://www.winvesta.in/faqs/global-collections-account/what-are-the-charges-for-the-global-collections-account", observedAt: "2026-10-29",
    appliesTo: input => input.sourceCurrency === "USD" ? commercialIntoIndia(input) : "This modeled standard plan currently covers USD collections only; other currency fixed fees differ.",
    fee: (_input, amountUsd) => amountUsd !== null && amountUsd <= 2000 ? { amount: round((3 + amountUsd * .0099) * 1.18), currency: "USD", parts: ["USD 3 + 0.99%", "Assumes non-JPMC account: 18% GST"] } : null,
    partial: true,
    notes: ["Assumes standard pricing and total monthly USD receipts no higher than USD 2,000. Account type and monthly volume are unknown; higher tiers require custom pricing.", "JPMC accounts have different GST treatment. This is a conditional reference, not a complete account quote."],
  },
  {
    slug: "xflow", name: "Xflow · Starter plan",
    sourceUrl: "https://www.xflowpay.com/pricing", observedAt: "2026-10-29",
    appliesTo: input => input.sourceCurrency === "USD" && input.destinationCurrency === "INR"
      && (!input.destinationCountry || input.destinationCountry === "IN")
      && (!input.context || (input.context.country === "IN" && input.context.direction === "receive" && input.context.profile !== "personal"))
      ? null : "Starter pricing here covers USD collections for Indian business recipients only.",
    fee: input => ({ amount: input.amount <= 2000 ? 12 : round(input.amount * .006), currency: "USD", parts: [input.amount <= 2000 ? "Starter: USD 12 up to USD 2,000" : "Starter: 0.6% above USD 2,000"] }),
    partial: true,
    notes: ["Assumes the Starter plan; Growth and negotiated plans differ. Fixed fees and variable FX markup are modelled as a source-currency deduction for illustration.", "This is a published estimate, not Xflow's locked withdrawal rate. Account eligibility, applicable taxes and banking charges must be confirmed."],
  },
  {
    slug: "atlantic-money", name: "Atlantic Money",
    sourceUrl: "https://atlantic.money/gb/en/business", observedAt: "2026-10-29",
    appliesTo: input => input.sourceCurrency === "GBP" && input.amount <= 1_000_000
      && ["EUR", "USD", "AUD", "CAD", "INR", "NOK", "SEK", "DKK", "PLN"].includes(input.destinationCurrency)
      && input.context?.country === "GB" && input.context.direction === "send" && input.context.profile === "business"
      && (!input.destinationCountry || ({ USD: ["US"], AUD: ["AU"], CAD: ["CA"], INR: ["IN"], NOK: ["NO"], SEK: ["SE"], DKK: ["DK"], PLN: ["PL"], EUR: ["DE", "FR", "ES", "IT", "NL", "BE", "PT", "IE", "AT", "FI", "GR", "LU", "EE", "LT", "LV", "SK", "SI", "MT", "CY", "HR"] } as Record<string, string[]>)[input.destinationCurrency]?.includes(input.destinationCountry))
      ? null : "This schedule is for UK businesses sending GBP, up to GBP 1 million, in the listed payout currencies.",
    fee: () => ({ amount: 3, currency: "GBP", parts: ["GBP 3 standard transfer fee"] }),
    partial: true,
    notes: ["Standard UK business pricing; express delivery, account approval and destination eligibility require confirmation.", "Illustrated with Railor's reference FX rate. Atlantic's executable institutional rate may differ; this is not an Atlantic quote."],
  },
  {
    slug: "payzoll",
    name: "PayZoll",
    sourceUrl: "https://payzoll.finance/",
    observedAt: "2026-10-29",
    appliesTo: intoIndia,
    fee: (input) => ({ amount: round(input.amount * .01), currency: input.sourceCurrency, parts: ["1% public headline fee; minimum, taxes and partner charges unconfirmed"] }),
    partial: true,
    notes: ["Official homepage advertises 1% and zero FX markup. The previously assumed USD 10 floor is not confirmed by the current page and is not applied.", "Tax inclusion, minimums and banking/partner charges are unconfirmed. The reference receive amount is before any additional charges and cannot be certified as the lowest total.", "Published fee reference only — no PayZoll account quote integration is used."],
  },
  {
    slug: "skydo",
    name: "Skydo",
    sourceUrl: "https://www.skydo.com/",
    observedAt: "2026-10-29",
    appliesTo: intoIndia,
    fee: (_input, amountUsd) => {
      if (amountUsd === null) return null;
      const base = amountUsd <= 2_000 ? 19 : amountUsd <= 10_000 ? 29 : round(amountUsd * 0.003);
      const slab = amountUsd <= 2_000 ? "$19 up to USD 2,000" : amountUsd <= 10_000 ? "$29 for USD 2,001–10,000" : "0.3% above USD 10,000";
      return { amount: round(base * 1.18), currency: "USD", parts: [slab, "+18% GST on the fee"] };
    },
    notes: ["For Indian businesses receiving from abroad (exports), with FIRA.", "Publishes zero FX margin; above USD 100K/month pricing is negotiated."],
  },
];

// Public quotes are the same for everyone for a few seconds: share them, so a
// page polling every 20s (or many viewers of the same pair) costs Wise one call.
const publicCache = new Map<string, { at: number; value: Promise<unknown> }>();
function shared<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = publicCache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  publicCache.set(key, { at: Date.now(), value });
  value.catch(() => publicCache.delete(key));
  if (publicCache.size > 500) publicCache.delete(publicCache.keys().next().value!);
  return value;
}

function round(n: number, dp = 2) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

async function marketEstimates(input: PriceCheckInput, fetcher: typeof fetch): Promise<PriceRow[]> {
  const params = new URLSearchParams({ sourceCurrency: input.sourceCurrency.toUpperCase(), targetCurrency: input.destinationCurrency.toUpperCase(), sendAmount: String(input.amount) });
  const response = await fetcher(`https://api.wise.com/v4/comparisons/?${params}`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return [];
  return comparisonRows(input, await response.json() as ComparisonFeed);
}

function fromQuote(q: UnifiedQuote, name: string, basis: PriceBasis, extra: { delivery?: string | null; notes?: string[]; source: PriceRow["source"] }): PriceRow {
  return {
    providerSlug: q.providerSlug,
    providerName: name,
    basis,
    recipientAmount: q.recipientAmount ?? null,
    feeAmount: q.feeAmount ?? null,
    feeCurrency: q.feeCurrency ?? null,
    rate: q.exchangeRate ? Number(q.exchangeRate) : null,
    totalCostPct: null,
    partial: q.costPartial,
    delivery: extra.delivery ?? (q.estimatedArrivalMinutes !== undefined ? arrival(q.estimatedArrivalMinutes) : null),
    observedAt: q.observedAt,
    expiresAt: q.expiresAt,
    source: extra.source,
    notes: [...(q.costPartial ? [q.costNote ?? "Excludes the transfer fee — the provider's quote covers FX only."] : []), ...(extra.notes ?? [])],
  };
}

function arrival(minutes: number) {
  if (minutes < 5) return "in seconds";
  if (minutes < 120) return `in ~${Math.round(minutes)} min`;
  if (minutes < 48 * 60) return `in ~${Math.round(minutes / 60)} h`;
  return `in ~${Math.round(minutes / 1440)} days`;
}

export async function comparePrices(rawInput: PriceCheckInput, deps: PriceCheckDeps = {}): Promise<PriceCheckResult> {
  const input: PriceCheckInput = {
    ...rawInput,
    sourceCurrency: rawInput.sourceCurrency.trim().toUpperCase(),
    destinationCurrency: rawInput.destinationCurrency.trim().toUpperCase(),
    destinationCountry: rawInput.destinationCountry?.trim().toUpperCase() || undefined,
  };
  if (!Number.isFinite(input.amount) || !(input.amount > 0) || input.amount > 10_000_000 || !/^[A-Z]{3}$/.test(input.sourceCurrency) || !/^[A-Z]{3}$/.test(input.destinationCurrency)) {
    throw new Error("Pick two currencies and an amount above zero.");
  }
  const fetcher = deps.fetcher ?? fetch;
  if (input.context) input.context = CustomerContext.parse(input.context);
  const now = deps.now ?? new Date();
  const rows: PriceRow[] = [];
  const unavailable: PriceUnavailable[] = [];
  const quoteRequest = { sourceAsset: input.sourceCurrency, destinationCurrency: input.destinationCurrency, destinationCountry: input.destinationCountry, amount: input.amount };

  // Injected fetchers (tests) bypass the shared cache.
  const cache = <T>(key: string, ttlMs: number, load: () => Promise<T>) => (deps.fetcher ? load() : shared(key, ttlMs, load));
  const pair = `${input.sourceCurrency}:${input.destinationCurrency}:${input.amount}:${input.destinationCountry ?? ""}`;
  const [connected, wisePublic, market, usdRate, platformQuotes, revolutPublic, skydoFx, mulyaFx] = await Promise.all([
    deps.connectedQuotes ? deps.connectedQuotes(input).catch(() => []) : Promise.resolve([]),
    cache(`wise:${pair}`, 15_000, () => wisePublicQuote(quoteRequest, fetcher)).catch((error: Error) => error),
    input.includeMarket ? cache(`market:${pair}`, 60_000, () => marketEstimates(input, fetcher)).catch(() => []) : Promise.resolve([]),
    input.sourceCurrency === "USD"
      ? Promise.resolve(1)
      : cache(`usd:${input.sourceCurrency}`, 60_000, () => wisePublicQuote({ sourceAsset: input.sourceCurrency, destinationCurrency: "USD", amount: input.amount }, fetcher))
          .then((q) => Number(q.exchangeRate))
          .catch(() => null),
    deps.platformQuotes ? deps.platformQuotes(input).catch(() => []) : Promise.resolve([]),
    cache(`revolut:GB:${pair}`, 60_000, () => revolutPublicReference(input, fetcher, now)).catch(() => null),
    cache(`skydo-fx:${input.sourceCurrency}:${input.destinationCurrency}:${input.destinationCountry ?? ""}`, 20_000, () => skydoPublicFx(input, fetcher, now)).catch(() => null),
    cache(`mulya-fx:${input.sourceCurrency}:${input.destinationCurrency}:${input.destinationCountry ?? ""}`, 20_000, () => mulyaPublicFx(input, fetcher, now)).catch(() => null),
  ]);

  for (const c of connected) {
    if (c.quote?.expiresAt && (!Number.isFinite(Date.parse(c.quote.expiresAt)) || Date.parse(c.quote.expiresAt) <= now.getTime())) {
      unavailable.push({ providerSlug: c.providerSlug, providerName: c.providerName, reason: "The provider quote expired; refresh to request a new one." });
    } else if (c.quote) rows.push(fromQuote(c.quote, c.providerName, "exact", { source: { label: "Your connected account" } }));
    else unavailable.push({ providerSlug: c.providerSlug, providerName: c.providerName, reason: c.error ?? "The connected account returned no quote." });
  }
  const connectedSlugs = new Set(connected.filter((c) => c.quote && (!c.quote.expiresAt || (Number.isFinite(Date.parse(c.quote.expiresAt)) && Date.parse(c.quote.expiresAt) > now.getTime()))).map((c) => c.providerSlug));
  rows.push(...publicOfferRows(input, now).filter(offer => !connectedSlugs.has(offer.providerSlug)));
  if (revolutPublic && !connectedSlugs.has("revolut")) rows.push({ ...revolutPublic, notes: [...revolutPublic.notes] });
  else if (!revolutPublic && !connectedSlugs.has("revolut")) unavailable.push({ providerSlug: "revolut", providerName: "Revolut", reason: "No public UK FX reference for this request. Public pricing does not confirm business eligibility or total transfer cost." });

  let reference: PriceCheckResult["reference"] = null;
  if (!(wisePublic instanceof Error)) {
    const rate = Number(wisePublic.exchangeRate);
    if (Number.isFinite(rate) && rate > 0) reference = { rate, source: "Wise's public rate (Wise quotes the mid-market rate)", observedAt: wisePublic.observedAt };
    if (!connectedSlugs.has("wise")) {
      rows.push(
        fromQuote(input.sourceCurrency.toUpperCase() === "AED" ? { ...wisePublic, costPartial: true, costNote: "AED funding eligibility and complete transfer costs require confirmation." } : wisePublic, "Wise", "live_public", {
          delivery: wisePublic.deliveryLabel ?? null,
          source: { label: "Wise public quote", url: "https://wise.com/" },
          notes: [`Paying ${wisePublic.payInLabel}. Your own account's price can be lower — connect Wise to see it.`, ...(input.sourceCurrency.toUpperCase() === "AED" ? ["Wise's AED funding guide limits sending AED to money already held in a Wise balance. This public reference does not confirm a UAE bank-funded transfer or its complete cost. https://wise.com/help/articles/2932360/guide-to-aed-transfers"] : [])],
        }),
      );
    }
  } else {
    unavailable.push({ providerSlug: "wise", providerName: "Wise", reason: `No public quote: ${wisePublic.message}` });
  }

  const amountUsd = usdRate ? input.amount * usdRate : null;
  for (const schedule of PUBLISHED_PRICING) {
    if (connectedSlugs.has(schedule.slug)) continue;
    const reason = schedule.appliesTo(input);
    if (reason) continue;
    const rawFx = schedule.slug === "skydo" ? skydoFx : schedule.slug === "mulya" ? mulyaFx ? { ...mulyaFx, usdRate: usdRate ?? null } : null : null;
    // A wildly inconsistent public widget must not manufacture a winning price.
    const ownFx = rawFx && (!reference || Math.abs(rawFx.rate / reference.rate - 1) <= .05) ? rawFx : null;
    const scheduleRate = ownFx?.rate ?? reference?.rate ?? null;
    const scheduleUsdRate = ownFx?.usdRate ?? usdRate;
    const fee = schedule.fee(input, scheduleUsdRate ? input.amount * scheduleUsdRate : null, scheduleRate);
    if (!fee) {
      unavailable.push({ providerSlug: schedule.slug, providerName: schedule.name, reason: "This amount requires a custom plan or a reference rate is missing. Check the provider's published plan and account terms." });
      continue;
    }
    const feeInSource = fee.currency === input.sourceCurrency ? fee.amount : fee.currency === input.destinationCurrency && scheduleRate ? fee.amount / scheduleRate : fee.currency === "USD" && scheduleUsdRate ? fee.amount / scheduleUsdRate : null;
    if (feeInSource !== null && feeInSource >= input.amount) {
      unavailable.push({ providerSlug: schedule.slug, providerName: schedule.name, reason: "The published fee meets or exceeds this amount. Confirm the provider's minimum transaction size." });
      continue;
    }
    const recipient = scheduleRate && feeInSource !== null ? round((input.amount - feeInSource) * scheduleRate) : null;
    rows.push({
      providerSlug: schedule.slug,
      providerName: schedule.name,
      basis: "published",
      recipientAmount: recipient,
      feeAmount: fee.amount,
      feeCurrency: fee.currency,
      rate: scheduleRate,
      ...(ownFx ? { rateSource: { label: `${schedule.slug === "skydo" ? "Skydo" : "Mulya"} public calculator FX feed`, url: ownFx.source, observedAt: ownFx.observedAt } } : {}),
      totalCostPct: null,
      partial: schedule.partial ?? false,
      delivery: null,
      observedAt: new Date(`${schedule.observedAt}T00:00:00Z`).toISOString(),
      source: { label: `${schedule.name} pricing page`, url: schedule.sourceUrl },
      notes: [`Fee: ${fee.parts.join(", ")}.`, ownFx ? `Uses ${schedule.slug === "skydo" ? "Skydo's timestamped" : "Mulya's retrieved"} public calculator FX observation from ${ownFx.observedAt}; this is indicative, not a locked account quote.${schedule.slug === "mulya" ? " Mulya's endpoint supplies no rate-publication timestamp; the date shown is when Railor retrieved it." : ""}` : reference ? "Illustrated at the common reference rate; the provider's own conversion rate may differ." : "No usable FX rate, so the amount received can't be computed.", ...schedule.notes],
    });
  }

  // Cached public observations must not acquire another customer's profile or ranking.
  rows.push(...market.map((row) => ({ ...row, notes: [...row.notes] })));

  for (const provider of deps.connectable ?? []) {
    if (provider.connected || rows.some((r) => r.providerSlug === provider.slug)) continue;
    // Already listed (e.g. Wise's public quote failed for this pair): one entry, now also connectable.
    const listed = unavailable.find((u) => u.providerSlug === provider.slug);
    if (listed) {
      listed.connectable = true;
      continue;
    }
    unavailable.push({ providerSlug: provider.slug, providerName: provider.name, reason: "Pricing is account-specific — connect to check the quote and its fee coverage for this route.", connectable: true });
  }

  // Rank: prices a business can act on before market estimates; within each,
  // complete rows by what arrives, then rows whose cost is complete but whose
  // product is unconfirmed for this profile, then FX-only figures (their
  // amount leaves a fee out, so it must not outrank a full price), then rows
  // with no amount.
  const expected = reference ? input.amount * reference.rate : null;
  const receiving = input.context?.direction === "receive";
  for (const row of rows) {
    row.costComplete = !row.partial && row.recipientAmount !== null;
    if (receiving) row.side = row.basis === "published" || row.basis === "exact" ? "recipient" : "payer";
    if (input.context) {
      row.profileAssessment = assessCustomerProfile(row.providerSlug, input.context, { ...input, amountUsd, referenceRate: reference?.rate ?? null });
      if (!row.profileAssessment.priceApplicable) row.partial = true;
    }
  }
  let webCheck: WebCheckSummary | undefined;
  if (deps.webChecks) {
    const claims = priceCheckClaims(input, rows);
    const known = claims.length ? await deps.webChecks(claims).catch(() => null) : { results: [], pending: new Set<string>(), configured: true, paused: false };
    if (known) webCheck = { ...applyWebChecks(rows, claims, known.results, known.pending), configured: known.configured, paused: known.paused ?? false };
  }
  for (const row of rows) {
    row.totalCostPct = !row.partial && row.recipientAmount !== null && expected ? round((1 - row.recipientAmount / expected) * 100, 2) : null;
  }
  const tier = (r: PriceRow) => (r.recipientAmount === null ? 3 : !r.costComplete ? 2 : r.partial ? 1 : 0);
  const group = (r: PriceRow) => (r.basis === "market_estimate" ? 1 : 0);
  rows.sort((a, b) => group(a) - group(b) || tier(a) - tier(b) || (b.recipientAmount ?? 0) - (a.recipientAmount ?? 0) || basisOrder(a.basis) - basisOrder(b.basis));
  // Dated consumer estimates are context, never "the best price".
  const fits = (r: PriceRow) => !input.context || r.profileAssessment?.status === "documented";
  const best = rows.find((r) => tier(r) === 0 && group(r) === 0 && fits(r));
  for (const row of rows) row.shortfall = best && tier(row) === 0 && fits(row) ? round(best.recipientAmount! - row.recipientAmount!) : null;

  return { input, reference, rows, unavailable, generatedAt: now.toISOString(), platformQuotes, historicalPricing: remittanceSurvey(input), ...(webCheck ? { webCheck } : {}) };
}

function basisOrder(b: PriceBasis) {
  return { exact: 0, live_public: 1, published: 2, market_estimate: 3 }[b];
}

/** Pairs shown on the live FX ticker. */
export const TICKER_PAIRS: Array<[string, string]> = [
  ["USD", "INR"], ["USD", "EUR"], ["GBP", "INR"], ["USD", "AED"], ["EUR", "INR"], ["USD", "GBP"],
  ["USD", "SGD"], ["AED", "INR"], ["USD", "MXN"], ["USD", "BRL"], ["USD", "PHP"], ["EUR", "GBP"],
];

export interface TickerRate {
  from: string;
  to: string;
  rate: number;
  observedAt: string;
}

/** Mid-market rates for the ticker (Wise's public rate), shared for 60s across every viewer. */
export async function fxTicker(pairs: Array<[string, string]> = TICKER_PAIRS): Promise<TickerRate[]> {
  const settled = await Promise.allSettled(
    pairs.map(([from, to]) =>
      shared(`ticker:${from}:${to}`, 60_000, async () => {
        const q = await wisePublicQuote({ sourceAsset: from, destinationCurrency: to, amount: 1000 });
        return { from, to, rate: Number(q.exchangeRate), observedAt: q.observedAt };
      }),
    ),
  );
  return settled.flatMap((r) => (r.status === "fulfilled" && Number.isFinite(r.value.rate) && r.value.rate > 0 ? [r.value] : []));
}
