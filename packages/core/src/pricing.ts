import { wisePublicQuote } from "./payments/adapters/wise.js";
import { revolutPublicReference } from "./public-pricing/revolut.js";
import { airwallexPublicReference, hasAirwallexPublicReference } from "./public-pricing/airwallex.js";
import { alAnsariPublicReference, hasAlAnsariPublicReference } from "./public-pricing/al-ansari.js";
import type { UnifiedQuote } from "./unified.js";
import { remittanceSurvey, type RemittanceSurvey } from "./public-pricing/remittances.js";
import { shared } from "./public-pricing/shared-cache.js";
import { publicMidMarketRate } from "./public-pricing/mid-market.js";
import { skydoPublicFx } from "./public-pricing/skydo.js";
import { mulyaPublicFx } from "./public-pricing/mulya.js";
import { comparisonRows, type ComparisonFeed } from "./public-pricing/comparisons.js";
import { asporaBankQuote, asporaQuoteCurrency, ofxPublicPrice, remitlyPublicPrice, usBankRemittanceCorridor, usBankRemittanceRows, worldRemitPublicPrice } from "./public-pricing/us-bank-remittances.js";
import { publicOfferRows } from "./public-pricing/offers.js";
import { bitsoPublicPrice, bookMyForexPublicPrice, careemPublicPrice, instaremPublicPrice, lemfiPublicPrice, nalaPublicPrice, rextiePublicPrice, riaPublicPrice, sendwavePublicPrice, taptapSendPublicPrice, transferGoPublicPrice, walutomatPublicPrice, westernUnionPublicPrice } from "./public-pricing/retail-calculators.js";
import { payerFacts, PAYER_FACTS_CHECKED } from "./public-pricing/payer-facts.js";
import { withKycFacts } from "./public-pricing/provider-kyc.js";
import { CustomerContext, assessCustomerProfile, senderCountryAssessment, unconfirmedAssessment, type PaymentMethod, type ProviderProfileAssessment } from "./customer-profiles.js";
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
  feeBreakdown?: string;
  rate: number | null;
  rateSource?: { label: string; url: string; observedAt: string };
  /** 1 − recipient ÷ (amount × reference rate): everything the route costs, fee and FX together. */
  totalCostPct: number | null;
  /** Account eligibility or some costs still need confirmation before ranking. */
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
  /** The specific product this price is for — "Client sends with Wise" is not Wise's receiving account. */
  product?: { id: string; label: string };
  /** Payment methods the price applies to, as published. */
  paymentMethods?: PaymentMethod[];
  /** The funding rail selected by a provider when it priced this quote. */
  fundingLabel?: string;
  /** Exact inputs the source leaves out; shown next to the amount. */
  missing?: string[];
  /** Whether the provider's fee includes tax: true, false, or null when the source doesn't say. */
  taxIncluded?: boolean | null;
  /** Tax wording when a plain yes/no would mislead (e.g. no GST charged, reverse charge may apply). */
  taxNote?: string;
  /** The remittance document the provider states it issues (e.g. FIRA), when the source says so. */
  receipt?: string | null;
  webChecks?: RowWebCheck[];
  /** Amount-checked public observation. Freshness never changes its source into an account quote. */
  publicComparison?: {
    amount: number; sourceCurrency: string; destinationCurrency: string;
    sourceCountry: string | null; destinationCountry: string | null; freshUntil: string;
  };
  /** Conditional calculator capture; the display deadline is not a provider rate guarantee. */
  publicOffer?: { kind: "first_transfer"; fundingMethod: string; payoutMethod: string; displayUntil: string };
  /**
   * The sender country a public price is published for, when the source is
   * country-specific (Revolut's UK converter prices Revolut UK customers). A
   * sender registered elsewhere can't get it: see senderCountryAssessment.
   */
  senderCountry?: string;
}

export interface PriceUnavailable {
  providerSlug: string;
  providerName: string;
  reason: string;
  /** The customer could get an exact price by connecting this provider. */
  connectable?: boolean;
  /** The specific product, when the provider has several (e.g. Wise Business · India receiving). */
  product?: string;
  /** First-party page the known facts come from. */
  sourceUrl?: string;
}

/** Operator-entered promotions shown beside prices; they never change an amount or the ranking. */
export interface PricePromotions {
  offers: Array<{ id: string; providerSlug: string; kind: "fee_free" | "better_rate" | "bonus" | "other"; headline: string; terms: string; sourceUrl: string; newCustomersOnly: boolean; endsAt: string | null }>;
}

export interface PriceCheckResult {
  input: PriceCheckInput;
  promotions?: PricePromotions;
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
  pricingReviewedAt?: string;
  feeHighlight?: string;
  feeEvidence?: Array<{ summary: string; product: string; sourceUrl: string | null; observedAt: string | null }>;
  profileAssessment?: ProviderProfileAssessment;
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
  /** Where the independent mid-market fallback reads from. Defaults to the network, but never when a test injects `fetcher`, so existing call counts stay put. */
  fallbackFetcher?: typeof fetch;
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
  fee(input: PriceCheckInput, amountUsd: number | null, referenceRate?: number | null): { amount: number; currency: string; parts: string[]; plan?: { id: string; label: string } } | null;
  notes: string[];
  /** Some published pages explicitly exclude partner/banking charges. */
  partial?: boolean;
  /** User-facing product name, distinct from other products of the same provider. */
  product: string;
  /** How the payer may fund the payment for this published fee to apply. */
  payMethods: PaymentMethod[];
  /** Whether the published fee includes tax (true/false), or null when the source is unclear. */
  taxIncluded: boolean | null;
  /** The remittance document the source says is issued, or null when it doesn't say. */
  receipt: string | null;
  /** Tax wording when a plain yes/no would mislead. */
  taxNote?: string;
  /** For partial schedules: the exact input the source leaves out. */
  missing?: string[];
}

const intoIndia = (input: PriceCheckInput) =>
  input.destinationCurrency.toUpperCase() === "INR" && input.sourceCurrency.toUpperCase() !== "INR" && (!input.destinationCountry || input.destinationCountry === "IN")
    ? null
    : "Published pricing covers money arriving in India (INR) only.";

const commercialIntoIndia = (input: PriceCheckInput) => input.context?.country === "IN" && input.context.direction === "receive" && input.context.profile !== "personal" && input.context.purpose === "services" ? intoIndia(input) : "This published model requires an Indian commercial service-export recipient.";

/**
 * What Wise's pricing-page calculator for Indian businesses showed for USD to INR
 * paid by ACH on 2026-11-18: a 1.6% conversion fee taken from the amount that is
 * converted, a fixed USD 1.46, and 18% GST on both. Wise's help centre sets the
 * per-receipt limits (at least USD 5, at most INR 2,500,000).
 */
const WISE_INDIA = { variable: 0.016, fixedUsd: 1.46, gstPercent: 18, minUsd: 5, maxInr: 2_500_000 } as const;

/** Wise sets a different conversion fee for each currency; only USD has been read from the calculator. */
const wiseIndiaReceiving = (input: PriceCheckInput) => input.sourceCurrency === "USD" ? commercialIntoIndia(input) : "Wise's India receiving fee has only been read for USD collections.";

/** Read from each provider's own site on `observedAt`. Re-check before relying on them. */
export const PUBLISHED_PRICING: PublishedSchedule[] = [
  {
    slug: "refrens", product: "Refrens · receive by bank transfer", payMethods: ["local_bank", "wire"], taxIncluded: true, receipt: null, name: "Refrens · bank transfer", sourceUrl: "https://www.refrens.com/receive-international-payments-india", observedAt: "2026-10-30",
    appliesTo: input => input.sourceCurrency === "USD" ? commercialIntoIndia(input) : "This USD model uses the published USD 60 cap; other currency caps need confirmation.",
    fee: input => ({ amount: round(Math.min(input.amount * .015, 60)), currency: "USD", parts: ["1.5% standard bank/ACH/wire fee capped at USD 60; taxes included"] }),
    partial: true,
    missing: ["Refrens's FX conversion cost (described, but not published as an amount)."],
    notes: ["Published bank-transfer model only. Card payments have different fees. The provider describes additional FX conversion loss without an amount-specific rate; the displayed receipt is a reference before that unknown FX cost.", "Negotiated lower fees and current payment-product onboarding must be confirmed."],
  },
  {
    slug: "salt", product: "Salt · inward remittance account", payMethods: ["local_bank"], taxIncluded: true, receipt: null, name: "Salt · inward remittance", sourceUrl: "https://www.salt.pe/international-payments", observedAt: "2026-10-30", appliesTo: commercialIntoIndia,
    fee: input => ({ amount: round(input.amount * .0175), currency: input.sourceCurrency, parts: ["1.75% published fee including GST"] }),
    partial: true,
    missing: ["A usable Salt FX rate and confirmation the product is available."],
    notes: ["The public product page advertises no FX markup. Its calculator currently exposes no usable rate; current product availability and transaction terms have not been independently confirmed.", "Shown as a conditional published reference at the common FX rate, not a live quote or a complete-price recommendation."],
  },
  {
    slug: "dashx", product: "DashX · receiving account", payMethods: ["local_bank"], taxIncluded: true,
    receipt: "Free eFIRA for fiat receipts", name: "DashX", sourceUrl: "https://dashx.xyz/pricing",
    observedAt: "2026-11-25", appliesTo: commercialIntoIndia,
    fee: input => ({ amount: round(input.amount * .0035), currency: input.sourceCurrency, parts: ["0.35% flat fee on fiat collections"] }),
    taxNote: "DashX says it adds no GST to its platform fee.",
    notes: ["The current pricing page lists 0.35% for fiat collections. DashX describes standard conversion at mid-market. Railor uses its own reference rate for this estimate.", "Tax and documentation: https://dashx.xyz/compare/dashx-vs-infinity"],
  },
  {
    slug: "briskpe", product: "BRISKPE · export collections", payMethods: ["local_bank"], taxIncluded: null,
    receipt: "Free e-FIRA advertised", name: "BRISKPE", sourceUrl: "https://www.briskpe.com/",
    observedAt: "2026-11-25", appliesTo: input => commercialIntoIndia(input) ?? (input.sourceCurrency === "USD" ? null : "This fee estimate is scoped to USD export collections."),
    fee: input => input.amount <= 50_000 ? {
      amount: round(input.amount <= 2000 ? 16 : input.amount <= 10000 ? 25 : input.amount * .0025),
      currency: "USD", parts: ["Published export-collection fee before unquantified GST"],
    } : null,
    partial: true,
    taxNote: "BRISKPE says GST applies. The reviewed price schedule does not specify the tax amount.",
    missing: ["Applicable GST and the account's final payout."],
    notes: ["Published export-collection pricing and zero FX markup are advertised on the provider site. The figure uses Railor’s reference rate and subtracts the published provider fee only.", "BRISKPE directs enterprises and customers above USD 50,000 in monthly payments to contact sales."],
  },
  {
    slug: "mulya", product: "Mulya · receiving account", payMethods: ["local_bank"], taxIncluded: true, receipt: "Remittance documents (free, as stated)", name: "Mulya",
    sourceUrl: "https://www.mulya.co/", observedAt: "2026-10-29", appliesTo: commercialIntoIndia,
    fee: input => ({ amount: round(input.amount * .01), currency: input.sourceCurrency, parts: ["1% all-inclusive published fee; provider states no additional GST"] }),
    notes: ["The provider advertises zero FX markup and free remittance documents. Modeled at the common reference rate, not a locked account quote.", "Confirm the supported collection method, payer country, account eligibility and settlement amount before receiving funds."],
  },
  {
    slug: "infinity", product: "Infinity · receive by bank transfer", payMethods: ["local_bank"], taxIncluded: true, receipt: "FIRA (free, automatic)", name: "Infinity",
    sourceUrl: "https://www.infinityapp.in/faqs/articles/what-infinity-charges-for-bank-transfer-payments", observedAt: "2026-11-18",
    appliesTo: commercialIntoIndia,
    fee: (input, amountUsd) => amountUsd !== null && amountUsd <= 50_000 ? { amount: round(input.amount * .005), currency: input.sourceCurrency, parts: ["0.5% flat bank-transfer fee, GST included, zero FX markup"] } : null,
    notes: ["Published standard bank-transfer estimate at Railor's reference FX rate, not a locked Infinity quote.", "Card (QuickLinks) payments are priced differently. Sender-bank, platform or intermediary charges are separate from Infinity's fee.", "Above USD 50,000, request custom pricing. Account, payer and transaction eligibility still apply.", "GST included and free automatic FIRA: https://www.infinityapp.in/blog/international-payments-india-startup-founders (2026-09-10)."],
  },
  {
    slug: "payglocal", product: "PayGlocal · bank collections", payMethods: ["local_bank"], taxIncluded: false, receipt: null, name: "PayGlocal · bank collections",
    sourceUrl: "https://payglocal.in/compare/payglocal-vs-skydo", observedAt: "2026-10-29",
    appliesTo: commercialIntoIndia,
    fee: (_input, amountUsd) => amountUsd === null ? null : { amount: round((amountUsd <= 2000 ? 10 : amountUsd <= 7500 ? 18 : amountUsd * .0025) * 1.18), currency: "USD", parts: [amountUsd <= 2000 ? "USD 10 through USD 2,000" : amountUsd <= 7500 ? "USD 18 through USD 7,500" : "0.25% above USD 7,500", "18% GST on the fee"] },
    notes: ["Bank-transfer collection product, not card checkout. Published zero FX markup; illustrated at the common reference rate, not PayGlocal's executable quote.", "The headline 'from 0.25%' is not applied to small invoices: the published flat-fee slabs apply first."],
  },
  {
    slug: "razorpay", product: "Razorpay MoneySaver · bank transfer", payMethods: ["local_bank"], taxIncluded: false, receipt: null, name: "Razorpay · MoneySaver bank transfer",
    sourceUrl: "https://razorpay.com/accept-international-payments/money-saver/", observedAt: "2026-10-29",
    appliesTo: commercialIntoIndia,
    fee: (input, _amountUsd, referenceRate) => referenceRate ? { amount: round((input.amount * referenceRate < 100_000 ? 1000 : input.amount * referenceRate * .01) * 1.18), currency: "INR", parts: ["INR 1,000 flat below INR 100,000; otherwise 1%", "18% GST on the fee"] } : null,
    notes: ["MoneySaver's standard bank-transfer product, not Razorpay card processing or its 2% payment-link product.", "Minimum fee is in INR and is compared to the invoice's INR equivalent. Expired promotional fee waivers are excluded. Zero published FX markup is illustrated at Railor's reference rate."],
  },
  {
    slug: "winvesta", product: "Winvesta · global collections account", payMethods: ["local_bank"], taxIncluded: false, receipt: null, name: "Winvesta · standard collection plan",
    sourceUrl: "https://www.winvesta.in/faqs/global-collections-account/what-are-the-charges-for-the-global-collections-account", observedAt: "2026-10-29",
    appliesTo: input => input.sourceCurrency === "USD" ? commercialIntoIndia(input) : "This modeled standard plan currently covers USD collections only; other currency fixed fees differ.",
    fee: (_input, amountUsd) => amountUsd !== null && amountUsd <= 2000 ? { amount: round((3 + amountUsd * .0099) * 1.18), currency: "USD", parts: ["USD 3 + 0.99%", "Assumes non-JPMC account: 18% GST"] } : null,
    partial: true,
    missing: ["Your Winvesta account type and monthly volume (they set the pricing tier and GST)."],
    notes: ["Assumes standard pricing and total monthly USD receipts no higher than USD 2,000. Account type and monthly volume are unknown; higher tiers require custom pricing.", "JPMC accounts have different GST treatment. This is a conditional reference, not a complete account quote."],
  },
  {
    slug: "xflow", product: "Xflow · receiving account", payMethods: ["local_bank"], taxIncluded: null, receipt: "Bank confirmation letter on inward remittance", name: "Xflow",
    taxNote: "No GST charged by Xflow (US entity). You may owe GST under reverse charge on the flat fee — ask your tax adviser.",
    sourceUrl: "https://www.xflowpay.com/pricing", observedAt: "2026-11-18",
    appliesTo: input => input.sourceCurrency === "USD" && input.destinationCurrency === "INR"
      && (!input.destinationCountry || input.destinationCountry === "IN")
      && (!input.context || (input.context.country === "IN" && input.context.direction === "receive" && input.context.profile !== "personal"))
      ? null : "Starter pricing here covers USD collections for Indian business recipients only.",
    fee: input => {
      // Plans can be switched any time, so the cheaper published plan for this amount is the fair price.
      const starter = input.amount <= 2000 ? 12 : round(input.amount * .006);
      const growth = input.amount <= 5000 ? 20 : round(input.amount * .004);
      return growth < starter
        ? { amount: growth, currency: "USD", parts: [input.amount <= 5000 ? "Growth plan: USD 20 flat up to USD 5,000" : "Growth plan: 0.4% above USD 5,000", `cheaper than Starter (USD ${starter}) at this amount`], plan: { id: "xflow:growth", label: "Xflow · Growth plan account" } }
        : { amount: starter, currency: "USD", parts: [input.amount <= 2000 ? "Starter plan: USD 12 flat up to USD 2,000" : "Starter plan: 0.6% above USD 2,000"], plan: { id: "xflow:starter", label: "Xflow · Starter plan account" } };
    },
    partial: true,
    missing: ["Xflow's conversion rate at withdrawal — it's a live rate, not stated to be mid-market."],
    notes: ["Published Starter (USD 12 up to USD 2,000, then 0.6%) and Growth (USD 20 up to USD 5,000, then 0.4%) plans; the cheaper one for this amount is shown. Plans can be switched any time; Scale (USD 10,000+) is custom.", "The percentage part is charged as an FX markup; modelled here as a deduction at the reference rate. Not Xflow's locked withdrawal rate. Account eligibility and banking charges must be confirmed."],
  },
  {
    slug: "atlantic-money", product: "Atlantic Money · send from the UK", payMethods: ["local_bank"], taxIncluded: null, receipt: null, name: "Atlantic Money",
    sourceUrl: "https://atlantic.money/gb/en/business", observedAt: "2026-10-29",
    appliesTo: input => input.sourceCurrency === "GBP" && input.amount <= 1_000_000
      && ["EUR", "USD", "AUD", "CAD", "INR", "NOK", "SEK", "DKK", "PLN"].includes(input.destinationCurrency)
      && input.context?.country === "GB" && input.context.direction === "send" && input.context.profile === "business"
      && (!input.destinationCountry || ({ USD: ["US"], AUD: ["AU"], CAD: ["CA"], INR: ["IN"], NOK: ["NO"], SEK: ["SE"], DKK: ["DK"], PLN: ["PL"], EUR: ["DE", "FR", "ES", "IT", "NL", "BE", "PT", "IE", "AT", "FI", "GR", "LU", "EE", "LT", "LV", "SK", "SI", "MT", "CY", "HR"] } as Record<string, string[]>)[input.destinationCurrency]?.includes(input.destinationCountry))
      ? null : "This schedule is for UK businesses sending GBP, up to GBP 1 million, in the listed payout currencies.",
    fee: () => ({ amount: 3, currency: "GBP", parts: ["GBP 3 standard transfer fee"] }),
    partial: true,
    missing: ["Atlantic's executable FX rate for your account."],
    notes: ["Standard UK business pricing; express delivery, account approval and destination eligibility require confirmation.", "Illustrated with Railor's reference FX rate. Atlantic's executable institutional rate may differ; this is not an Atlantic quote."],
  },
  {
    slug: "payzoll", product: "PayZoll · receiving account", payMethods: ["local_bank"], taxIncluded: null, receipt: "FIRA/FIRC for eligible international receipts",
    name: "PayZoll",
    sourceUrl: "https://payzoll.finance/payzoll-vs-skydo",
    observedAt: "2026-11-18",
    appliesTo: input => input.sourceCurrency === "USD" ? intoIndia(input) : "The documented minimum applies to USD collections into INR.",
    fee: (input) => ({ amount: round(Math.max(10, input.amount * .01)), currency: "USD", parts: ["USD 10 below USD 1,000; 1% from USD 1,000"] }),
    partial: true,
    missing: ["Applicable tax and banking, partner or corridor charges."],
    notes: ["PayZoll's published USD fee matches its USD-to-INR dashboard calculator. The homepage advertises zero FX markup.", "Railor estimates the payout at its reference exchange rate. The final rate and amount are confirmed in PayZoll at withdrawal."],
  },
  {
    slug: "skydo", product: "Skydo · receive into a local collection account", payMethods: ["local_bank"], taxIncluded: false, receipt: "FIRA (instant, every payment)",
    name: "Skydo",
    sourceUrl: "https://www.skydo.com/send-money-to-india",
    observedAt: "2026-11-18",
    appliesTo: intoIndia,
    fee: (_input, amountUsd) => {
      if (amountUsd === null) return null;
      const base = amountUsd <= 2_000 ? 19 : amountUsd <= 10_000 ? 29 : round(amountUsd * 0.003);
      const slab = amountUsd <= 2_000 ? "$19 up to USD 2,000" : amountUsd <= 10_000 ? "$29 for USD 2,001–10,000" : "0.3% above USD 10,000";
      return { amount: round(base * 1.18), currency: "USD", parts: [slab, "+18% GST on the fee"] };
    },
    notes: ["For Indian businesses receiving from abroad (exports). The recipient pays the flat fee plus 18% GST; Skydo charges the sender nothing, though the sender's bank may charge its usual domestic transfer fee.", "Publishes zero FX margin at the live rate. Senders outside Skydo's local-account countries pay by SWIFT wire, where intermediary deductions may apply."],
  },
  {
    slug: "wise", product: "Wise Business · India receiving account", payMethods: ["local_bank"], taxIncluded: false, receipt: "e-FIRC", name: "Wise Business",
    sourceUrl: "https://wise.com/in/pricing/business/receive", observedAt: "2026-11-18",
    appliesTo: wiseIndiaReceiving,
    fee: (input, amountUsd, referenceRate) => {
      const { variable, fixedUsd, gstPercent, minUsd, maxInr } = WISE_INDIA;
      if (amountUsd === null || amountUsd < minUsd || !referenceRate || input.amount * referenceRate > maxInr) return null;
      // The 1.6% comes off what is converted (the amount after every fee), so the fee solves X = 1.6% × (A − 1.18X) + fixed.
      const feeCents = Math.round(((variable * input.amount + fixedUsd) / (1 + (1 + gstPercent / 100) * variable)) * 100);
      const gstCents = Math.round(feeCents * gstPercent / 100);
      return { amount: (feeCents + gstCents) / 100, currency: "USD", parts: [`${variable * 100}% conversion fee plus a fixed USD ${fixedUsd}, free to receive by ACH`, `${gstPercent}% GST on the fee`] };
    },
    partial: true,
    missing: ["Whether Wise also charges the USD 2 e-FIRC fee its help centre describes; its pricing page calls the e-FIRC free."],
    notes: [
      "Read from the calculator on Wise's pricing page for Indian businesses (USD to INR, paid by ACH). Wise converts at the mid-market rate, so Railor's common reference rate applies. The calculator itself moves by a cent with the FX rate.",
      "Wise's help centre and an August 2026 Wise blog post say an equivalent of USD 2 is also charged to issue the e-FIRC. The pricing page calls the e-FIRC free and its calculator has no such line, so it is not added here. Confirm it in your Wise Business account.",
      "Paying by Swift or wire costs more in the same calculator (USD 39.20 in fees at USD 1,700, against USD 33.19 by ACH) and is not modelled. Wise accepts at least USD 5 and at most INR 2,500,000 per receipt.",
    ],
  },
  {
    slug: "toucan-payments", product: "Toucan Payments · CrossStream export collections", payMethods: ["local_bank"], taxIncluded: null,
    receipt: "Automated e-FIRA", name: "Toucan Payments", sourceUrl: "https://toucanpay.in/",
    observedAt: "2026-11-26", appliesTo: input => commercialIntoIndia(input) ?? (input.sourceCurrency === "USD" ? null : "Published CrossStream flat slabs are stated in USD."),
    fee: input => ({
      amount: round(input.amount <= 3_000 ? 24 : input.amount <= 12_000 ? 25 : input.amount * 0.0025),
      currency: "USD",
      parts: [input.amount <= 3_000 ? "USD 24 flat up to USD 3,000" : input.amount <= 12_000 ? "USD 25 flat for USD 3,001–12,000" : "0.25% above USD 12,000"],
    }),
    partial: true,
    missing: ["Applicable GST and partner-bank settlement rate."],
    notes: ["RBI PA-CB authorised CrossStream export collections. Zero hidden FX markup is advertised; illustrated at Railor's reference rate. Confirm GST and AD-I bank rules before receiving funds."],
  },
  {
    slug: "atlantic-money", product: "Atlantic Money · send from Europe (EUR)", payMethods: ["local_bank"], taxIncluded: null, receipt: null, name: "Atlantic Money",
    sourceUrl: "https://atlantic.money/", observedAt: "2026-11-26",
    appliesTo: input => input.sourceCurrency === "EUR" && input.amount <= 1_000_000
      && ["USD", "GBP", "AUD", "CAD", "NOK", "SEK", "DKK", "PLN"].includes(input.destinationCurrency)
      && input.context?.direction === "send" && ["AT", "BE", "DE", "DK", "ES", "FI", "FR", "IE", "IT", "NL", "NO", "PL", "PT", "SE"].includes(input.context.country)
      ? null : "This schedule is for European senders paying in EUR, up to EUR 1 million, in the listed currencies.",
    fee: () => ({ amount: 3, currency: "EUR", parts: ["EUR 3 flat standard transfer fee, 0% FX markup"] }),
    partial: true,
    missing: ["Atlantic Money's live mid-market execution rate and account verification tier."],
    notes: ["Standard EEA pricing: EUR 3 flat fee at live mid-market FX with 0% markup. Express delivery costs extra; destination currency must go to its native country."],
  },
  {
    slug: "higlobe", product: "Higlobe · USD receiving account", payMethods: ["local_bank"], taxIncluded: null, receipt: null, name: "Higlobe",
    sourceUrl: "https://www.higlobe.com/pricing", observedAt: "2026-11-26",
    appliesTo: input => {
      if (input.sourceCurrency !== "USD" || !input.context || input.context.direction !== "receive" || input.context.profile === "personal") return "Higlobe receiving accounts are for freelancers and businesses receiving USD via ACH.";
      const pairs: Record<string, string> = { MXN: "MX", ARS: "AR", BRL: "BR", PHP: "PH" };
      const expected = pairs[input.destinationCurrency];
      return expected && input.context.country === expected && (!input.destinationCountry || input.destinationCountry === expected)
        ? null : "Published Higlobe receiving spreads here cover USD to MXN, ARS, BRL and PHP.";
    },
    fee: input => {
      const spreadPct = input.destinationCurrency === "BRL" ? 0.002 : input.destinationCurrency === "PHP" ? 0.006 : 0;
      const label = spreadPct === 0 ? "$0 ACH receive, 0.00% published FX spread" : `$0 ACH receive, ${(spreadPct * 100).toFixed(2)}% published FX spread`;
      return { amount: round(input.amount * spreadPct), currency: "USD", parts: [label] };
    },
    partial: true,
    missing: ["Higlobe's live local withdrawal rate and any receiving bank/IOF taxes."],
    notes: ["Higlobe publishes $0 incoming US ACH and $0 local bank withdrawal fees, with published FX spreads of 0% (MX/AR), 0.20% (BR) and 0.60% (PH). Incoming US wires cost USD 20. Per-withdrawal cap is USD 25,000 (USD 15,000 in PH)."],
  },
  {
    slug: "husky", product: "Husky · receive into Brazil (BRL)", payMethods: ["local_bank", "wire"], taxIncluded: null, receipt: null, name: "Husky",
    sourceUrl: "https://help.husky.io/hc/en-us/articles/360053702513-What-are-the-prices-at-Husky", observedAt: "2026-11-26",
    appliesTo: input => ["USD", "EUR", "GBP"].includes(input.sourceCurrency) && input.destinationCurrency === "BRL"
      && input.context?.country === "BR" && input.context.direction === "receive" && input.context.profile !== "personal"
      ? null : "Husky published pricing applies to Brazilian freelancers and PJ businesses receiving USD, EUR or GBP into BRL.",
    fee: (input, amountUsd) => amountUsd !== null
      ? { amount: round(amountUsd <= 1_000 ? 10 : input.amount * 0.01), currency: amountUsd <= 1_000 ? "USD" : input.sourceCurrency, parts: [amountUsd <= 1_000 ? "USD 10 flat fee up to USD 1,000" : "1% fee above USD 1,000 (commercial exchange rate)"] }
      : null,
    partial: true,
    missing: ["Applicable Brazilian IOF (0% for PJ service exports; varies for PF) and intermediary SWIFT fees."],
    notes: ["Husky by Nomad converts incoming international transfers at the commercial FX rate with a max 1% fee (or USD 10 flat up to USD 1,000). Eligible PJ service exports carry 0% IOF."],
  },
  {
    slug: "techfx", product: "TechFX · Brazil PJ export receiving", payMethods: ["local_bank", "wire"], taxIncluded: true, receipt: null, name: "TechFX",
    sourceUrl: "https://www.techfx.com.br/taxas-de-cambio-para-receber-do-exterior/", observedAt: "2026-11-26",
    appliesTo: input => ["USD", "EUR"].includes(input.sourceCurrency) && input.destinationCurrency === "BRL"
      && input.context?.country === "BR" && input.context.direction === "receive" && ["business", "sole_proprietor"].includes(input.context.profile) && input.context.purpose === "services"
      ? null : "TechFX serves Brazilian legal entities (CNPJ/PJ) receiving USD or EUR service-export payments into BRL.",
    fee: input => ({ amount: round(input.amount * 0.005), currency: input.sourceCurrency, parts: ["0.50% flat spread over commercial exchange rate; 0% IOF for PJ service exports"] }),
    partial: true,
    missing: ["TechFX's live commercial execution rate and any originating sender wire fees."],
    notes: ["Published 0.50% flat FX spread for Brazilian PJ service exporters with zero fixed wire reception fees and 0% IOF. Illustrated at Railor's reference rate."],
  },
  {
    slug: "priyo-pay", product: "Priyo Pay · Bangladesh USD receiving", payMethods: ["local_bank"], taxIncluded: null, receipt: null, name: "Priyo Pay",
    sourceUrl: "https://pay.priyo.com/", observedAt: "2026-11-26",
    appliesTo: input => input.sourceCurrency === "USD" && input.destinationCurrency === "BDT"
      && input.context?.country === "BD" && input.context.direction === "receive" && input.context.profile !== "personal"
      ? null : "Priyo Pay published pricing here covers Bangladeshi freelancers and businesses converting USD into BDT.",
    fee: input => ({ amount: round(Math.max(0.99, input.amount * 0.01)), currency: "USD", parts: ["Free incoming US ACH; 1.00% currency conversion fee (min USD 0.99)"] }),
    partial: true,
    missing: ["Priyo Pay's live USD-to-BDT conversion rate and any local bank charges."],
    notes: ["Incoming US ACH is free (domestic wires cost USD 15). Conversion to BDT carries a published 1.00% fee (minimum USD 0.99). Service-export withdrawals are not eligible for Bangladesh's 2.5% Wage Earner remittance cash incentive."],
  },
  {
    slug: "remitbee", product: "RemitBee · send from Canada", payMethods: ["local_bank", "transfer_service"], taxIncluded: null, receipt: null, name: "RemitBee",
    sourceUrl: "https://www.remitbee.com/our-fees", observedAt: "2026-11-26",
    appliesTo: input => input.sourceCurrency === "CAD" && input.destinationCurrency !== "CAD"
      && input.context?.country === "CA" && input.context.direction === "send" && input.context.profile === "personal"
      ? null : "RemitBee published transfer fees here cover personal senders in Canada sending CAD abroad.",
    fee: input => ({ amount: input.amount >= 500 ? 0 : 2.99, currency: "CAD", parts: [input.amount >= 500 ? "CAD 0 transfer fee on transfers of CAD 500 or more (EFT/Interac/Bill Pay)" : "CAD 2.99 transfer fee below CAD 500 (EFT/Interac/Bill Pay)"] }),
    partial: true,
    missing: ["RemitBee's live exchange rate spread (typically 0.30%–0.80%)."],
    notes: ["RemitBee charges CAD 0 on transfers ≥ CAD 500 funded via Balance, Interac e-Transfer, EFT or Bill Payment (CAD 2.99 under CAD 500; card funding costs more). Exchange-rate spread is additional and shown in RemitBee's live quote."],
  },
  {
    slug: "deemoney", product: "DeeMoney · send from Thailand", payMethods: ["local_bank", "transfer_service"], taxIncluded: true, receipt: null, name: "DeeMoney",
    sourceUrl: "https://www.deemoney.com/", observedAt: "2026-11-26",
    appliesTo: input => input.sourceCurrency === "THB" && input.destinationCurrency !== "THB"
      && input.context?.country === "TH" && input.context.direction === "send" && input.context.profile === "personal"
      ? null : "DeeMoney published personal transfer fee covers Thailand outbound THB sends.",
    fee: () => ({ amount: 133.75, currency: "THB", parts: ["THB 125 flat fee + 7% VAT (THB 133.75 total; select corridors up to THB 150)"] }),
    partial: true,
    missing: ["DeeMoney's live exchange rate and destination-specific fee band."],
    notes: ["Bank of Thailand licensed outbound transfer specialist. Personal transfers publish THB 125 + 7% VAT (DeeBusiness is THB 449 + 7% VAT). Confirm the corridor fee and live FX rate in the DeeMoney app."],
  },
  {
    slug: "clearshift", product: "Clearshift · Israel zero-markup FX", payMethods: ["local_bank"], taxIncluded: true, receipt: null, name: "Clearshift",
    sourceUrl: "https://www.clearshiftinc.com/", observedAt: "2026-11-26",
    appliesTo: input => ["ILS", "USD", "EUR", "GBP", "CHF", "CAD", "AUD", "PLN"].includes(input.sourceCurrency)
      && ["ILS", "USD", "EUR", "GBP", "CHF", "CAD", "AUD", "PLN"].includes(input.destinationCurrency)
      && (input.sourceCurrency === "ILS" || input.destinationCurrency === "ILS")
      && input.context?.country === "IL" && input.context.profile === "personal"
      ? null : "Clearshift's published individual tariff covers Israeli personal transfers involving ILS and its 7 supported foreign currencies.",
    fee: (input, _amountUsd, referenceRate) => {
      if (input.sourceCurrency === "ILS") {
        return { amount: round(Math.max(180, input.amount * 0.0059)), currency: "ILS", parts: ["0.59% or ILS 180 minimum, VAT included, 0% FX markup over BOI/ECB benchmark"] };
      }
      if (!referenceRate) return null;
      const inIls = input.amount * referenceRate;
      return { amount: round(Math.max(180, inIls * 0.0059)), currency: "ILS", parts: ["0.59% or ILS 180 minimum, VAT included, 0% FX markup over BOI/ECB benchmark"] };
    },
    partial: true,
    missing: ["Same-owner account eligibility and official Bank of Israel / ECB fixing rate at execution."],
    notes: ["Clearshift converts at the official Bank of Israel / ECB benchmark fixing rate with 0% FX markup and charges 0.59% (minimum ILS 180, VAT included) for individuals. Personal transfers are restricted to same-owner accounts abroad."],
  },
  {
    slug: "eximpe", product: "EximPe · export collections", payMethods: ["local_bank"], taxIncluded: null,
    receipt: "Automated e-FIRA", name: "EximPe", sourceUrl: "https://eximpe.com/",
    observedAt: "2026-11-26", appliesTo: input => commercialIntoIndia(input) ?? (input.sourceCurrency === "USD" ? null : "Published EximPe baseline fee here is stated in USD."),
    fee: input => ({ amount: round(input.amount * 0.0075 + 0.5), currency: "USD", parts: ["0.75% + USD 0.50 published baseline fee"] }),
    partial: true,
    missing: ["Applicable GST, volume tier discount and live settlement rate."],
    notes: ["RBI PA-CB authorised export collections. Published baseline is 0.75% + USD 0.50 with automated e-FIRA; illustrated at Railor's reference rate."],
  },
  {
    slug: "sunway-money", product: "Sunway Money · send from Malaysia", payMethods: ["local_bank", "transfer_service"], taxIncluded: null, receipt: null,
    name: "Sunway Money", sourceUrl: "https://sunwaymoney.com/", observedAt: "2026-11-26",
    appliesTo: input => input.sourceCurrency === "MYR" && input.destinationCurrency !== "MYR"
      && input.context?.country === "MY" && input.context.direction === "send" && input.context.profile === "personal"
      ? null : "Sunway Money's published flat fee covers personal outbound MYR sends from Malaysia.",
    fee: () => ({ amount: 8, currency: "MYR", parts: ["MYR 8 flat standard remittance fee"] }),
    partial: true,
    missing: ["Sunway Money's live exchange rate spread for the selected corridor."],
    notes: ["Licensed Malaysia e-remittance provider publishing a flat MYR 8 transfer fee across 60+ countries (promotional MYR 1 bands may apply on JPY/THB). Illustrated at Railor's reference rate."],
  },
  {
    slug: "eand-money", product: "e& money · send from UAE", payMethods: ["local_bank", "transfer_service"], taxIncluded: true, receipt: null,
    name: "e& money", sourceUrl: "https://www.eandmoney.com/en/send-abroad.html", observedAt: "2026-11-26",
    appliesTo: input => input.sourceCurrency === "AED" && input.destinationCurrency !== "AED" && input.amount <= 25_000
      && input.context?.country === "AE" && input.context.direction === "send" && input.context.profile === "personal"
      ? null : "e& money's published remittance fee covers personal UAE AED sends up to AED 25,000.",
    fee: () => ({ amount: 15.75, currency: "AED", parts: ["AED 15 transfer fee + 5% UAE VAT (AED 15.75 total)"] }),
    partial: true,
    missing: ["e& money's live exchange rate and any in-app promotional fee waiver."],
    notes: ["Standard published UAE international transfer fee is AED 15 + 5% VAT (AED 15.75), capped at AED 25,000 per transfer/day/month. Illustrated at Railor's reference rate."],
  },
  {
    slug: "stc-bank", product: "STC Bank · send from Saudi Arabia", payMethods: ["local_bank", "transfer_service"], taxIncluded: false, receipt: null,
    name: "STC Bank", sourceUrl: "https://stcbank.com.sa/", observedAt: "2026-11-26",
    appliesTo: input => input.sourceCurrency === "SAR" && input.destinationCurrency !== "SAR"
      && input.context?.country === "SA" && input.context.direction === "send" && input.context.profile === "personal"
      ? null : "STC Bank's published Western Union transfer schedule covers personal SAR sends from Saudi Arabia.",
    fee: input => {
      const dest = input.destinationCurrency;
      if (dest === "PKR" && input.amount >= 375) return { amount: 0, currency: "SAR", parts: ["SAR 0 fee to Pakistan at SAR 375 or above"] };
      const base = ["INR", "PKR", "BDT", "PHP", "EGP", "NPR", "LKR", "IDR", "VND"].includes(dest)
        ? 15
        : ["AED", "BHD", "KWD", "OMR", "QAR", "TRY", "CNY", "KES", "ETB", "MAD"].includes(dest) ? 20 : 25;
      return { amount: round(base * 1.15), currency: "SAR", parts: [`SAR ${base} transfer fee`, "+15% Saudi VAT"] };
    },
    partial: true,
    missing: ["STC Bank / Western Union live SAR exchange rate margin."],
    notes: ["Published STC Bank Western Union tariff: Pakistan SAR 0 at SAR 375+ (else SAR 15); SAR 15 South/SE Asia & Egypt; SAR 20 GCC/TR/CN/KE/ET/MA; SAR 25 rest of world, plus 15% VAT. Illustrated at Railor's reference rate."],
  },
  {
    slug: "walletii", product: "walletii · send from Oman", payMethods: ["local_bank", "transfer_service"], taxIncluded: false, receipt: null,
    name: "walletii", sourceUrl: "https://www.walletii.om/", observedAt: "2026-11-26",
    appliesTo: input => input.sourceCurrency === "OMR" && input.destinationCurrency !== "OMR" && input.amount <= 1_000
      && input.context?.country === "OM" && input.context.direction === "send" && input.context.profile === "personal"
      ? null : "walletii's published tariff covers personal Oman OMR sends up to OMR 1,000 per transfer.",
    fee: input => {
      const dest = input.destinationCurrency;
      if (dest === "PKR" && input.amount >= 78) return { amount: 0, currency: "OMR", parts: ["OMR 0 fee to Pakistan at OMR 78+ via PRI Global"] };
      const base = ["AED", "SAR", "TRY", "EGP", "GBP"].includes(dest) ? 1 : 2;
      return { amount: round(base * 1.05), currency: "OMR", parts: [`OMR ${base.toFixed(3)} corridor fee`, "+5% Oman VAT"] };
    },
    partial: true,
    missing: ["walletii's live OMR exchange rate spread."],
    notes: ["Ooredoo Oman walletii published remittance schedule (capped at OMR 1,000/transfer & day, OMR 15,000/month). Illustrated at Railor's reference rate."],
  },
  {
    slug: "currencyfair", product: "CurrencyFair · international transfer", payMethods: ["local_bank"], taxIncluded: null, receipt: null,
    name: "CurrencyFair", sourceUrl: "https://www.currencyfair.com/pricing/", observedAt: "2026-11-26",
    appliesTo: input => ["EUR", "GBP", "USD", "AUD", "CAD", "CHF", "SGD", "HKD", "NZD", "JPY", "PLN", "SEK", "NOK", "DKK", "ZAR", "AED"].includes(input.sourceCurrency)
      && ["EUR", "GBP", "USD", "AUD", "CAD", "CHF", "SGD", "HKD", "NZD", "JPY", "PLN", "SEK", "NOK", "DKK", "ZAR", "AED", "INR", "PHP"].includes(input.destinationCurrency)
      && input.sourceCurrency !== input.destinationCurrency
      && input.context?.direction === "send"
      ? null : "CurrencyFair's published transfer-out fee covers its supported send currencies.",
    fee: (input, amountUsd) => {
      if (input.sourceCurrency === "EUR") return { amount: 3, currency: "EUR", parts: ["EUR 3 flat transfer-out fee (FX margin additional)"] };
      if (input.sourceCurrency === "GBP") return { amount: 2.5, currency: "GBP", parts: ["GBP 2.50 flat transfer-out fee (FX margin additional)"] };
      if (input.sourceCurrency === "USD") return { amount: 5, currency: "USD", parts: ["USD 5 flat transfer-out fee (FX margin additional)"] };
      return amountUsd !== null ? { amount: 4, currency: "USD", parts: ["EUR 3 equivalent flat transfer-out fee (FX margin additional)"] } : null;
    },
    partial: true,
    missing: ["CurrencyFair's live FX margin (averages ~0.53% above interbank)."],
    notes: ["CurrencyFair publishes a flat transfer-out fee of EUR 3 (GBP 2.50 / USD 5 equivalent) plus a variable FX margin averaging ~0.53%. Illustrated at Railor's reference rate before that FX margin."],
  },
  {
    slug: "alpian", product: "Alpian · Swiss weekday FX", payMethods: ["local_bank"], taxIncluded: null, receipt: null,
    name: "Alpian", sourceUrl: "https://www.alpian.com/", observedAt: "2026-11-26",
    appliesTo: input => ["CHF", "EUR", "USD", "GBP"].includes(input.sourceCurrency)
      && ["CHF", "EUR", "USD", "GBP"].includes(input.destinationCurrency)
      && input.sourceCurrency !== input.destinationCurrency
      && input.context?.country === "CH" && input.context.profile === "personal"
      ? null : "Alpian's published 0.20% weekday FX fee covers Swiss personal transfers among CHF, EUR, USD and GBP.",
    fee: input => ({ amount: round(input.amount * 0.002), currency: input.sourceCurrency, parts: ["0.20% weekday FX conversion fee (0.50% on weekends)"] }),
    partial: true,
    missing: ["Alpian's live interbank feed and any non-SEPA wire charges."],
    notes: ["FINMA-licensed Swiss digital bank publishing 0.20% weekday FX fee (0.50% weekend) across CHF, EUR, USD and GBP with free EUR SEPA transfers. Illustrated at Railor's reference rate."],
  },
  {
    slug: "b-sharpe", product: "b-sharpe · Swiss FX exchange", payMethods: ["local_bank"], taxIncluded: null, receipt: null,
    name: "b-sharpe", sourceUrl: "https://www.b-sharpe.com/en/compare-b-sharpe-fees/", observedAt: "2026-11-26",
    appliesTo: input => (input.sourceCurrency === "CHF" || input.destinationCurrency === "CHF")
      && ["CHF", "EUR", "USD", "GBP", "CAD", "AUD", "JPY", "SEK", "NOK", "DKK", "PLN"].includes(input.sourceCurrency)
      && ["CHF", "EUR", "USD", "GBP", "CAD", "AUD", "JPY", "SEK", "NOK", "DKK", "PLN"].includes(input.destinationCurrency)
      && input.sourceCurrency !== input.destinationCurrency
      && (input.context?.country === "CH" || input.context?.country === "FR")
      ? null : "b-sharpe's published starting spread covers Swiss/cross-border CHF currency exchanges.",
    fee: input => ({ amount: round(input.amount * 0.005), currency: input.sourceCurrency, parts: ["CHF 0 fixed transfer fee; ~0.50% standard CHF retail spread (from 0.12% at higher volumes)"] }),
    partial: true,
    missing: ["b-sharpe's exact volume-tiered FX spread at execution."],
    notes: ["Swiss FX specialist with CHF 0 monthly/transfer fee; spread starts from 0.12% for high volumes and ~0.50% standard retail. Illustrated at Railor's reference rate."],
  },
  {
    slug: "raenest", product: "Raenest · USD receiving account", payMethods: ["local_bank"], taxIncluded: null, receipt: null,
    name: "Raenest", sourceUrl: "https://help.raenest.com/", observedAt: "2026-11-26",
    appliesTo: input => input.sourceCurrency === "USD" && ["NGN", "KES", "GHS", "UGX", "RWF"].includes(input.destinationCurrency)
      && input.context?.direction === "receive" && ["NG", "KE", "GH", "UG", "RW"].includes(input.context.country)
      ? null : "Raenest's published USD ACH schedule here covers African freelancers and businesses receiving USD.",
    fee: input => {
      const deposit = input.amount < 500 ? 2 : 4;
      const conversion = round(Math.min(2.7, (input.amount - deposit) * 0.007));
      return { amount: round(deposit + Math.max(0, conversion)), currency: "USD", parts: [`USD ${deposit} ACH deposit fee`, "0.70% conversion fee capped at USD 2.70"] };
    },
    partial: true,
    missing: ["Raenest's live local withdrawal FX rate."],
    notes: ["Published Raenest fees: USD 2 ACH deposit below USD 500 (USD 4 at USD 500+; USD 12 wire), ~0.70% conversion capped at USD 2.70 and free local NGN payout. Illustrated at Railor's reference rate."],
  },
  {
    slug: "grey", product: "Grey · foreign receiving account", payMethods: ["local_bank"], taxIncluded: null, receipt: null,
    name: "Grey", sourceUrl: "https://support.grey.co/", observedAt: "2026-11-26",
    appliesTo: input => ["USD", "GBP", "EUR"].includes(input.sourceCurrency)
      && ["NGN", "KES", "GHS", "TZS", "UGX", "ZAR"].includes(input.destinationCurrency)
      && input.context?.direction === "receive" && ["NG", "KE", "GH", "TZ", "UG", "ZA"].includes(input.context.country)
      ? null : "Grey's published personal local-rail receiving fee covers USD, GBP and EUR receipts into supported African countries.",
    fee: input => {
      if (input.context?.profile === "business" && input.sourceCurrency === "USD") {
        return { amount: 2, currency: "USD", parts: ["Grey Business USD 2 flat ACH deposit fee"] };
      }
      const dep = round(Math.min(10, Math.max(2, input.amount * 0.008)));
      return { amount: dep, currency: input.sourceCurrency, parts: ["0.80% local-rail deposit fee (min 2, max 10 in source currency)"] };
    },
    partial: true,
    missing: ["Grey's live currency conversion spread and local withdrawal fee."],
    notes: ["Published Grey fees: 0.80% (min 2, max 10) for personal ACH/SEPA/FPS deposits (USD 20 wire; Grey Business USD 2 ACH / USD 15 wire). Illustrated at Railor's reference rate before Grey's FX spread."],
  },
  {
    slug: "cleva", product: "Cleva · USD receiving account", payMethods: ["local_bank"], taxIncluded: null, receipt: null,
    name: "Cleva", sourceUrl: "https://www.getcleva.com/pricing", observedAt: "2026-11-26",
    appliesTo: input => input.sourceCurrency === "USD" && input.destinationCurrency === "NGN"
      && input.context?.direction === "receive" && input.context.country === "NG" && input.amount <= 3_000
      ? null : "Cleva's published USD ACH schedule here covers Nigerian recipients up to USD 3,000 per transfer (Kenya is excluded).",
    fee: input => ({ amount: round(Math.min(5, Math.max(2, input.amount * 0.008))), currency: "USD", parts: ["0.80% USD ACH deposit fee (min USD 2, max USD 5; 0% published conversion markup)"] }),
    partial: true,
    missing: ["Cleva's live NGN conversion rate at withdrawal."],
    notes: ["Cleva publishes 0.80% (min USD 2, max USD 5) on USD ACH/FedNow deposits (USD 0 from Upwork, USD 10 wire) and 0% FX conversion markup. Kenya is explicitly excluded."],
  },
  {
    slug: "elevate-pay", product: "Elevate Pay · USD receiving account", payMethods: ["local_bank"], taxIncluded: null, receipt: null,
    name: "Elevate Pay", sourceUrl: "https://www.elevatepay.co/", observedAt: "2026-11-26",
    appliesTo: input => input.sourceCurrency === "USD" && ["PHP", "PKR", "BDT", "EGP"].includes(input.destinationCurrency)
      && input.context?.direction === "receive" && ["PH", "PK", "BD", "EG"].includes(input.context.country)
      ? null : "Elevate Pay's published USD receiving account covers remote workers in PH, PK, BD and EG.",
    fee: () => ({ amount: 1.5, currency: "USD", parts: ["USD 0 incoming US ACH; USD 1.50 standard outbound payout fee"] }),
    partial: true,
    missing: ["Elevate Pay's live spot FX rate for the withdrawal corridor."],
    notes: ["Elevate Pay offers free incoming US ACH from platforms/employers and ~USD 1.50 outbound withdrawal fee plus live spot FX. Illustrated at Railor's reference rate."],
  },
  {
    slug: "paysend", product: "Paysend · flat-fee transfer", payMethods: ["card", "local_bank", "transfer_service"], taxIncluded: null, receipt: null,
    name: "Paysend", sourceUrl: "https://paysend.com/", observedAt: "2026-11-26",
    appliesTo: input => ["USD", "GBP", "EUR"].includes(input.sourceCurrency) && input.sourceCurrency !== input.destinationCurrency
      && input.context?.direction === "send" && input.context.profile === "personal"
      ? null : "Paysend's published flat transfer fee covers personal sends in USD, GBP or EUR.",
    fee: input => {
      if (input.sourceCurrency === "GBP") return { amount: 1, currency: "GBP", parts: ["GBP 1.00 published flat transfer fee (FX spread additional)"] };
      if (input.sourceCurrency === "EUR") return { amount: 1.5, currency: "EUR", parts: ["EUR 1.50 published flat transfer fee (FX spread additional)"] };
      return { amount: 1.99, currency: "USD", parts: ["USD 1.99 published flat transfer fee (FX spread additional)"] };
    },
    partial: true,
    missing: ["Paysend's live exchange rate spread for this corridor."],
    notes: ["Paysend publishes a fixed flat fee of USD 1.99, GBP 1.00 or EUR 1.50 (some bank transfers are free) plus an exchange-rate spread. Illustrated at Railor's reference rate before that spread."],
  },
  {
    slug: "uption", product: "UPTION · Turkey international transfer", payMethods: ["local_bank", "transfer_service"], taxIncluded: null, receipt: null,
    name: "UPTION", sourceUrl: "https://www.uption.com.tr/", observedAt: "2026-11-26",
    appliesTo: input => (input.sourceCurrency === "EUR" || input.sourceCurrency === "GBP") && input.destinationCurrency === "TRY"
      && input.context?.country === "TR" && input.context.direction === "receive"
      ? null : "UPTION's published EUR/GBP transfer tariff covers Turkish accounts receiving EUR SEPA or GBP UK transfers.",
    fee: input => ({ amount: 1, currency: input.sourceCurrency, parts: [`${input.sourceCurrency} 1.00 flat published SEPA/UK transfer fee`] }),
    partial: true,
    missing: ["UPTION's live conversion spread into TRY."],
    notes: ["UPTION publishes a EUR 1 SEPA transfer fee and GBP 1 UK transfer fee with free European IBAN opening. Illustrated at Railor's reference rate."],
  },
];

/**
 * Products whose price can't be verified from the provider's own pages. They
 * are listed with what is known and why there's no number — never ranked, and
 * never priced from AI answers, forums or third-party blogs.
 */
export const UNPRICED_PRODUCTS: Array<{ slug: string; name: string; product: string; sourceUrl: string; observedAt: string; appliesTo(input: PriceCheckInput): boolean; reason: string }> = [
  {
    // Priced above for USD service-export receipts; this covers the rest of the same product.
    slug: "wise", name: "Wise Business", product: "Wise Business · India receiving account",
    sourceUrl: "https://wise.com/in/pricing/business/receive", observedAt: "2026-11-18",
    appliesTo: input => input.context?.direction === "receive" && input.context.country === "IN" && input.context.profile !== "personal"
      && input.destinationCurrency === "INR" && input.context.paymentMethod !== "transfer_service" && input.context.paymentMethod !== "card"
      && wiseIndiaReceiving(input) !== null,
    reason: "Wise shows this product's fee only in a calculator, and Railor has read it for USD to INR service-export receipts. Wise sets the conversion fee per currency, so no amount is shown for this one. Check it in your Wise Business account.",
  },
];

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

const wiseEuroGuide = "https://wise.com/help/articles/2932149/guide-to-eur-transfers";
const wiseTransferReceipt = "https://wise.com/help/articles/2977946/how-do-i-download-a-transfer-confirmation";
const wiseRemittanceTax = "https://wise.com/help/articles/3uQHBn8NCiafZqlTWMvfkO/remittance-tax";
const isUsdToEur = (input: PriceCheckInput) => input.sourceCurrency === "USD" && input.destinationCurrency === "EUR";

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
  const usBankCurrency = usBankRemittanceCorridor(input);
  const asporaCurrency = asporaQuoteCurrency(input);
  const indiaBankReference = input.context?.direction === "send" && input.context.country === "IN" && input.sourceCurrency === "INR";
  const preferWiseBank = isUsdToEur(input) || input.context?.paymentMethod === "local_bank" || indiaBankReference;
  const consumerPair = [pair, input.context?.country, input.context?.direction, input.context?.paymentMethod].join(":");
  const personal = input.context?.profile === "personal" && input.context.purpose === "personal";
  const retailCalculators = Promise.allSettled([
    ...(personal ? [
      cache(`sendwave:${consumerPair}`, 60_000, () => sendwavePublicPrice(input, fetcher, now)),
      cache(`lemfi:${consumerPair}`, 60_000, () => lemfiPublicPrice(input, fetcher, now)),
      cache(`instarem:${consumerPair}`, 60_000, () => instaremPublicPrice(input, fetcher, now)),
      cache(`ofx:${consumerPair}`, 60_000, () => ofxPublicPrice(input, fetcher, now)),
      cache(`worldremit:${consumerPair}`, 60_000, () => worldRemitPublicPrice(input, fetcher, now)),
      cache(`remitly-multi:${consumerPair}`, 60_000, () => remitlyPublicPrice(input, fetcher, now)),
      cache(`western-union:${consumerPair}`, 60_000, () => westernUnionPublicPrice(input, fetcher, now)),
      riaPublicPrice(input, fetcher, now, !deps.fetcher),
      careemPublicPrice(input, fetcher, now, !deps.fetcher),
      taptapSendPublicPrice(input, fetcher, now, !deps.fetcher),
      nalaPublicPrice(input, fetcher, now, !deps.fetcher),
      bookMyForexPublicPrice(input, fetcher, now, !deps.fetcher),
    ] : []),
    cache(`transfergo:${consumerPair}`, 60_000, () => transferGoPublicPrice(input, fetcher, now)),
    cache(`rextie:${consumerPair}`, 60_000, () => rextiePublicPrice(input, fetcher, now)),
    walutomatPublicPrice(input, fetcher, now, !deps.fetcher),
    bitsoPublicPrice(input, fetcher, now, !deps.fetcher),
  ]);
  const revolutRegion = input.context?.direction === "send" ? input.context.country : "GB";
  const [connected, wisePublic, market, usdRate, platformQuotes, revolutPublic, skydoFx, mulyaFx, airwallexPublic, alAnsariPublic, usBankRows, asporaPublic, retailReferences] = await Promise.all([
    deps.connectedQuotes ? deps.connectedQuotes(input).catch(() => []) : Promise.resolve([]),
    cache(`wise:${pair}:${preferWiseBank}:${indiaBankReference}`, 15_000, () => wisePublicQuote(quoteRequest, fetcher, preferWiseBank, indiaBankReference)).catch((error: Error) => error),
    input.includeMarket ? cache(`market:${pair}`, 60_000, () => marketEstimates(input, fetcher)).catch(() => []) : Promise.resolve([]),
    input.sourceCurrency === "USD"
      ? Promise.resolve(1)
      : cache(`usd:${input.sourceCurrency}`, 60_000, () => wisePublicQuote({ sourceAsset: input.sourceCurrency, destinationCurrency: "USD", amount: input.amount }, fetcher))
          .then((q) => Number(q.exchangeRate))
          .catch(() => null),
    deps.platformQuotes ? deps.platformQuotes(input).catch(() => []) : Promise.resolve([]),
    cache(`revolut:${revolutRegion}:${pair}`, 60_000, () => revolutPublicReference(input, fetcher, now)).catch(() => null),
    cache(`skydo-fx:${input.sourceCurrency}:${input.destinationCurrency}:${input.destinationCountry ?? ""}`, 20_000, () => skydoPublicFx(input, fetcher, now)).catch(() => null),
    cache(`mulya-fx:${input.sourceCurrency}:${input.destinationCurrency}:${input.destinationCountry ?? ""}`, 20_000, () => mulyaPublicFx(input, fetcher, now)).catch(() => null),
    hasAirwallexPublicReference(input) ? cache(`airwallex-public-fx:${pair}`, 15_000, () => airwallexPublicReference(input, fetcher, now)).catch(() => null) : Promise.resolve(null),
    hasAlAnsariPublicReference(input) ? cache(`al-ansari-public-fx:${pair}`, 30_000, () => alAnsariPublicReference(input, fetcher, now)).catch(() => null) : Promise.resolve(null),
    usBankCurrency ? cache(`us-bank-remittances:${pair}`, 60_000, () => usBankRemittanceRows(usBankCurrency, input.amount, fetcher, now)) : Promise.resolve([]),
    asporaCurrency && !usBankCurrency ? cache(`aspora:${pair}`, 60_000, () => asporaBankQuote(asporaCurrency, input.amount, fetcher, now)).catch(() => null) : Promise.resolve(null),
    retailCalculators,
  ]);

  for (const c of connected) {
    if (c.quote?.expiresAt && (!Number.isFinite(Date.parse(c.quote.expiresAt)) || Date.parse(c.quote.expiresAt) <= now.getTime())) {
      unavailable.push({ providerSlug: c.providerSlug, providerName: c.providerName, reason: "The provider quote expired; refresh to request a new one." });
    } else if (c.quote) rows.push(fromQuote(c.quote, c.providerName, "exact", { source: { label: "Your connected account" } }));
    else unavailable.push({ providerSlug: c.providerSlug, providerName: c.providerName, reason: c.error ?? "The connected account returned no quote." });
  }
  const connectedSlugs = new Set(connected.filter((c) => c.quote && (!c.quote.expiresAt || (Number.isFinite(Date.parse(c.quote.expiresAt)) && Date.parse(c.quote.expiresAt) > now.getTime()))).map((c) => c.providerSlug));
  const seenRetail = new Set<string>();
  const liveRetail = [...usBankRows, ...(asporaPublic ? [asporaPublic] : []),
    ...retailReferences.flatMap(reference => reference.status === "fulfilled" && reference.value ? [reference.value] : [])]
    .filter((row) => {
      if (seenRetail.has(row.providerSlug)) return false;
      seenRetail.add(row.providerSlug);
      return true;
    });
  const liveRetailSlugs = new Set(liveRetail.map(row => row.providerSlug));
  rows.push(...liveRetail.filter(row => !connectedSlugs.has(row.providerSlug)));
  rows.push(...publicOfferRows(input, now).filter(offer => !connectedSlugs.has(offer.providerSlug) && !liveRetailSlugs.has(offer.providerSlug)));
  for (const fx of [airwallexPublic, alAnsariPublic]) {
    if (fx && !connectedSlugs.has(fx.providerSlug)) rows.push({ ...fx, notes: [...fx.notes] });
  }
  if (revolutPublic && !connectedSlugs.has("revolut")) rows.push({ ...revolutPublic, notes: [...revolutPublic.notes] });
  else if (!revolutPublic && !connectedSlugs.has("revolut")) unavailable.push({ providerSlug: "revolut", providerName: "Revolut", reason: "No public UK FX reference for this request. Public pricing does not confirm business eligibility or total transfer cost." });

  let reference: PriceCheckResult["reference"] = null;
  if (!(wisePublic instanceof Error)) {
    const rate = Number(wisePublic.exchangeRate);
    if (Number.isFinite(rate) && rate > 0) reference = { rate, source: "Wise's public rate (Wise quotes the mid-market rate)", observedAt: wisePublic.observedAt };
    if (!connectedSlugs.has("wise")) {
      const wiseRow = fromQuote(input.sourceCurrency === "AED" ? { ...wisePublic, costPartial: true, costNote: "AED funding eligibility and complete transfer costs require confirmation." } : wisePublic, "Wise", "live_public", {
        delivery: wisePublic.deliveryLabel ?? null,
        source: { label: "Wise public quote", url: "https://wise.com/" },
        notes: [`Paying ${wisePublic.payInLabel}. Your own account's price can be lower — connect Wise to see it.`, ...(input.sourceCurrency === "AED" ? ["Wise's AED funding guide limits sending AED to money already held in a Wise balance. This public reference does not confirm a UAE bank-funded transfer or its complete cost. https://wise.com/help/articles/2932360/guide-to-aed-transfers"] : [])],
      });
      if (wisePublic.fundingLabel) wiseRow.fundingLabel = wisePublic.fundingLabel;
      if (wisePublic.payInMethod === "BANK_TRANSFER") wiseRow.paymentMethods = ["local_bank", "transfer_service"];
      if (indiaBankReference && wisePublic.payInMethod === "BANK_TRANSFER") {
        wiseRow.product = { id: "wise:india-bank", label: "Wise · Indian bank-funded transfer" };
        wiseRow.source.url = input.destinationCurrency === "USD"
          ? "https://wise.com/in/send-money/send-money-to-the-usa"
          : "https://wise.com/help/articles/2932151/guide-to-inr-transfers";
      }
      if (isUsdToEur(input)) {
        wiseRow.source.url = "https://wise.com/us/send-money/send-money-to-europe";
        if (wisePublic.payInMethod === "BANK_TRANSFER") {
          wiseRow.product = { id: "wise:usd-eur-bank", label: "Wise · sender-funded bank transfer" };
        }
        wiseRow.receipt = "The sender can download and share a PDF after the transfer completes.";
        wiseRow.taxNote = "Wise says its funding methods are exempt from the U.S. 1% remittance tax. Any other tax depends on the sender’s location.";
        const { platformFeeAmount, payoutFeeAmount } = wisePublic;
        if (wiseRow.feeCurrency === "USD" && wiseRow.feeAmount !== null
          && platformFeeAmount != null && payoutFeeAmount != null
          && round(platformFeeAmount + payoutFeeAmount) === wiseRow.feeAmount) {
          wiseRow.feeBreakdown = `USD ${platformFeeAmount.toFixed(2)} funding + USD ${payoutFeeAmount.toFixed(2)} Wise fee`;
        }
        wiseRow.partial = wiseRow.partial || wiseRow.feeCurrency !== "USD" || wiseRow.feeAmount === null
          || wiseRow.feeAmount < 0 || wiseRow.recipientAmount === null || !reference
          || Math.abs(wiseRow.recipientAmount - (input.amount - wiseRow.feeAmount) * reference.rate) > .03;
      }
      rows.push(wiseRow);
    }
  } else {
    unavailable.push({ providerSlug: "wise", providerName: "Wise", reason: `No public quote: ${wisePublic.message}` });
  }
  // Wise has no public quote for some pairs (USD to SAR). Without a benchmark, nothing can be measured against the fair rate,
  // so read an independent mid-market rate instead. It is labelled as such and never stands in for any provider's price.
  const fallbackFetcher = deps.fallbackFetcher ?? (deps.fetcher ? undefined : fetch);
  if (!reference && fallbackFetcher) {
    const fallback = await cache(`mid-market:${input.sourceCurrency}:${input.destinationCurrency}`, 300_000, () => publicMidMarketRate(input.sourceCurrency, input.destinationCurrency, fallbackFetcher, now)).catch(() => null);
    if (fallback) reference = fallback;
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
      product: fee.plan ?? { id: `${schedule.slug}:published`, label: schedule.product },
      paymentMethods: [...schedule.payMethods],
      taxIncluded: schedule.taxIncluded,
      ...(schedule.taxNote ? { taxNote: schedule.taxNote } : {}),
      ...(schedule.missing?.length ? { missing: [...schedule.missing] } : {}),
      receipt: schedule.receipt,
      notes: [`Fee: ${fee.parts.join(", ")}.`, ownFx ? `Uses ${schedule.slug === "skydo" ? "Skydo's timestamped" : "Mulya's retrieved"} public calculator FX observation from ${ownFx.observedAt}; this is indicative, not a locked account quote.${schedule.slug === "mulya" ? " Mulya's endpoint supplies no rate-publication timestamp; the date shown is when Railor retrieved it." : ""}` : reference ? "Illustrated at the common reference rate; the provider's own conversion rate may differ." : "No usable FX rate, so the amount received can't be computed.", ...schedule.notes],
    });
  }

  for (const product of UNPRICED_PRODUCTS) {
    if (connectedSlugs.has(product.slug) || !product.appliesTo(input)) continue;
    unavailable.push({ providerSlug: product.slug, providerName: product.name, product: product.product, sourceUrl: product.sourceUrl, reason: product.reason });
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
    // Public quotes and market estimates carry no tax or receipt data of their own: fill what each provider's pages state.
    if (row.basis !== "published" && row.basis !== "exact" && row.taxIncluded === undefined && row.receipt === undefined && input.destinationCurrency === "INR" && (!input.destinationCountry || input.destinationCountry === "IN")) {
      const facts = payerFacts(row.providerSlug, input.context);
      if (facts) {
        row.receipt = facts.receipt;
        row.taxIncluded = facts.taxIncluded;
        if (facts.taxNote) row.taxNote = facts.taxNote;
        row.notes.push(`Tax and receipt facts read ${PAYER_FACTS_CHECKED}: ${facts.sources.map((source) => `${source.label} (${source.url})`).join("; ")}.`);
      }
    }
    if (receiving) row.side = row.basis === "published" || row.basis === "exact" ? "recipient" : "payer";
    // Name the product, so a sender's service is never mistaken for the recipient's account.
    if (!row.product) {
      const name = row.providerName.split(" · ")[0]!;
      row.product = row.basis === "exact"
        ? { id: `${row.providerSlug}:account`, label: `${name} · your connected account` }
        : receiving
          ? { id: `${row.providerSlug.replace(/^market:/, "")}:send`, label: `Client sends with ${name}` }
          : { id: `${row.providerSlug.replace(/^market:/, "")}:send`, label: `Send with ${name}` };
    }
    if (receiving && row.side === "payer" && !row.paymentMethods) row.paymentMethods = ["transfer_service"];
    if (input.context) {
      row.profileAssessment = row.providerSlug === "wise" && row.basis === "live_public" && isUsdToEur(input)
        ? {
          ...unconfirmedAssessment(),
          reasons: ["This public estimate prices the sender’s Wise transfer. Confirm the sender’s account and the recipient’s EUR bank details."],
          verification: ["The sender needs an eligible Wise account and must complete Wise’s verification."],
          fees: row.taxNote ?? "The sender should verify final fees with Wise.",
          corridors: "Pay EUR into a SEPA account or an eligible EUR-denominated IBAN outside SEPA. Country and receiving bank restrictions apply.",
          settlement: ["Wise pays the selected EUR bank account. Confirm the supported rail and delivery date in the sender’s quote."],
          documents: [row.receipt ?? "Check which confirmation the sender can share."],
          sources: [
            { label: "Wise guide to EUR transfers", url: wiseEuroGuide },
            { label: "Wise transfer confirmation", url: wiseTransferReceipt },
            { label: "Wise guidance on U.S. remittance tax", url: wiseRemittanceTax },
          ],
          reviewedAt: "2026-11-18",
        }
        : senderCountryAssessment(row, input.context)
          ?? assessCustomerProfile(row.providerSlug, input.context, { ...input, amountUsd, referenceRate: reference?.rate ?? null, product: row.product?.id });
      // Every row's requirements also carry what the provider publishes about its identity checks.
      row.profileAssessment = withKycFacts(row.profileAssessment, row.providerSlug, input.context);
      if (!row.profileAssessment.priceApplicable) row.partial = true;
      // Receiving-account evidence does not describe the sender's public Wise quote.
      if (row.side === "payer" && row.profileAssessment.payment) {
        row.profileAssessment = { ...row.profileAssessment, payment: undefined };
      }
      const payment = row.profileAssessment.payment;
      row.delivery ??= payment?.delivery?.label ?? null;
      if (payment?.receipt) row.receipt ??= payment.receipt.detail;
      row.taxNote ??= payment?.feeTax?.detail;
    }
  }
  let webCheck: WebCheckSummary | undefined;
  if (deps.webChecks) {
    const claims = priceCheckClaims(input, rows);
    const known = claims.length ? await deps.webChecks(claims).catch(() => null) : { results: [], pending: new Set<string>(), configured: true, paused: false };
    if (known) webCheck = { ...applyWebChecks(rows, claims, known.results, known.pending), configured: known.configured, paused: known.paused ?? false };
  }
  applyPaymentMethod(input, rows, unavailable);
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

const METHOD_LABEL: Record<PaymentMethod, string> = {
  local_bank: "a local bank transfer", wire: "an international wire", card: "a card", transfer_service: "a transfer service",
};

/**
 * Compare like with like: when the payer's method is known, keep only prices
 * for that method. A transfer app the client uses is a different product from
 * the recipient's receiving account; a wire keeps a bank-transfer fee only as a
 * partial reference (the wire fee isn't published); a card price that isn't
 * published is not invented.
 */
export function applyPaymentMethod(input: PriceCheckInput, rows: PriceRow[], unavailable: PriceUnavailable[]) {
  const method = input.context?.paymentMethod;
  if (!method || input.context?.direction !== "receive") return;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i]!;
    const payerService = row.side === "payer";
    // Keep sender prices when the quote explicitly identifies local bank funding.
    if (method === "local_bank" && payerService && (row.paymentMethods?.includes("local_bank") || row.product?.id === "wise:usd-eur-bank")) continue;
    if (method === "transfer_service" ? !payerService : payerService) {
      rows.splice(i, 1);
      continue;
    }
    const methods = row.paymentMethods ?? (row.basis === "exact" ? ["local_bank", "wire"] : ["local_bank"]);
    if (methods.includes(method)) continue;
    if (method === "wire") {
      row.partial = true;
      row.costComplete = false;
      row.receipt = null;
      if (row.basis === "published") row.delivery = null;
      row.missing = [...(row.missing ?? []), "Wire (SWIFT) fee not published — bank-transfer fee shown; intermediary banks may deduct more."];
      continue;
    }
    unavailable.push({ providerSlug: row.providerSlug, providerName: row.providerName, reason: `Pricing for ${METHOD_LABEL[method]} isn't published for ${row.product?.label ?? row.providerName}. Ask the provider for that fee.` });
    rows.splice(i, 1);
  }
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

async function tickerRate(from: string, to: string, fetcher?: typeof fetch): Promise<TickerRate> {
  const q = await wisePublicQuote({ sourceAsset: from, destinationCurrency: to, amount: 1000 }, fetcher);
  return { from, to, rate: Number(q.exchangeRate), observedAt: q.observedAt };
}

/** Mid-market rates for the ticker (Wise's public rate), shared for 60s across every viewer. */
export async function fxTicker(pairs: Array<[string, string]> = TICKER_PAIRS): Promise<TickerRate[]> {
  const settled = await Promise.allSettled(pairs.map(([from, to]) => shared(`ticker:${from}:${to}`, 60_000, () => tickerRate(from, to))));
  return settled.flatMap((r) => (r.status === "fulfilled" && Number.isFinite(r.value.rate) && r.value.rate > 0 ? [r.value] : []));
}

/**
 * Wise's public mid-market rate for one pair, read from the same 60s cache the
 * ticker fills (so the exchange price route costs Wise no extra call). Null
 * when the rate did not load. An injected fetcher (tests) bypasses the cache.
 */
export async function midMarketRate(from: string, to: string, fetcher?: typeof fetch): Promise<TickerRate | null> {
  try {
    const rate = await (fetcher ? tickerRate(from, to, fetcher) : shared(`ticker:${from}:${to}`, 60_000, () => tickerRate(from, to)));
    return Number.isFinite(rate.rate) && rate.rate > 0 ? rate : null;
  } catch {
    return null;
  }
}
