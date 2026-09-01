/**
 * @railor/types — the shared domain vocabulary.
 *
 * Everything Railor publishes about the world flows through these shapes:
 * a structured query goes in, an eligibility verdict with evidence comes out.
 * If a value cannot be evidenced it is `unknown` — never guessed.
 */
import { z } from "zod";

export * from "./country.js";
export * from "./provider-research.js";

/* -------------------------------------------------------------------------- */
/* Primitives                                                                  */
/* -------------------------------------------------------------------------- */

/** ISO 3166-1 alpha-2, uppercase. */
export const CountryCode = z.string().length(2).regex(/^[A-Z]{2}$/);
/** ISO 4217, uppercase. */
export const CurrencyCode = z.string().length(3).regex(/^[A-Z]{3}$/);

export const CustomerType = z.enum(["business", "individual"]);
export type CustomerType = z.infer<typeof CustomerType>;

export const ProductType = z.enum([
  "on_ramp",
  "off_ramp",
  "payout",
  "collection",
  "virtual_account",
  "card_issuing",
  "card_funding",
  "wallet",
  "treasury",
  "kyc_kyb",
]);
export type ProductType = z.infer<typeof ProductType>;

export const PaymentMethod = z.enum([
  "bank_transfer_local",
  "bank_transfer_swift",
  "sepa",
  "faster_payments",
  "ach",
  "wire",
  "card",
  "wallet_transfer",
  "cash_pickup",
]);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

/**
 * How a recipient actually holds the money — deliberately a different axis
 * from `namedRail` below. "mobile_money" + "M_PESA" and "bank_account" +
 * "SEPA_INSTANT" are both real, distinct combinations; collapsing either one
 * into `PaymentMethod`'s generic buckets is exactly the loss of precision
 * that made V4's rail-specific route tests unanswerable (Faster Payments,
 * Bacs and CHAPS all queried identically because nothing let a query ask for
 * one by name). Mirrors receivingEndpointTypeEnum in the database schema.
 */
export const ReceivingEndpointType = z.enum([
  "bank_account",
  "mobile_money",
  "card",
  "stablecoin_wallet",
  "virtual_account",
  "merchant_checkout",
  "payment_link",
  "local_instant_rail",
  "cash_pickup",
]);
export type ReceivingEndpointType = z.infer<typeof ReceivingEndpointType>;

/* -------------------------------------------------------------------------- */
/* Evidence & confidence                                                       */
/* -------------------------------------------------------------------------- */

export const SourceType = z.enum([
  "official_docs",
  "api",
  "pricing",
  "help_center",
  "terms",
  "status_page",
  "github",
  "official_announcement",
  "manual_verified",
  "third_party",
]);
export type SourceType = z.infer<typeof SourceType>;

/**
 * Keep provider assertions, Railor measurements, and independently verified
 * facts visibly separate. A caller can never mistake a provider marketing
 * statement for a Railor-observed execution result.
 */
export const VerificationType = z.enum([
  "provider_reported",
  "railor_observed",
  "provider_verified",
]);
export type VerificationType = z.infer<typeof VerificationType>;

/**
 * Base confidence by source type. Age decay is applied on read — see
 * `decayConfidence`. These numbers are deliberately conservative: an
 * inference is never allowed to reach the confidence of an official source.
 */
export const SOURCE_BASE_CONFIDENCE: Record<SourceType, number> = {
  api: 1.0,
  status_page: 0.98,
  official_docs: 0.95,
  help_center: 0.92,
  official_announcement: 0.9,
  manual_verified: 0.9,
  pricing: 0.9,
  terms: 0.88,
  github: 0.85,
  third_party: 0.6,
};

export const ConfidenceBand = z.enum([
  "verified",
  "high",
  "medium",
  "needs_review",
  "potentially_outdated",
]);
export type ConfidenceBand = z.infer<typeof ConfidenceBand>;

export const Evidence = z.object({
  id: z.string().optional(),
  sourceUrl: z.string().url(),
  sourceTitle: z.string(),
  sourceType: SourceType,
  verificationType: VerificationType.default("provider_reported"),
  retrievedAt: z.coerce.date(),
  lastVerifiedAt: z.coerce.date(),
  confidence: z.number().min(0).max(1),
  rawExcerpt: z.string().optional(),
  rawHash: z.string(),
});
export type Evidence = z.infer<typeof Evidence>;

/** How a value came to exist. Model output is never labelled `verified`. */
export const Derivation = z.enum(["source", "manual", "model"]);
export type Derivation = z.infer<typeof Derivation>;

const DAY_MS = 86_400_000;

/**
 * Confidence decays with staleness so an 18-month-old "supported" never
 * outranks a fresh check. Half-life is source-type dependent: status pages
 * go stale in days, terms of service in months.
 */
export function decayConfidence(
  base: number,
  lastVerifiedAt: Date,
  sourceType: SourceType,
  now: Date = new Date(),
): number {
  const halfLifeDays =
    sourceType === "status_page" ? 7 : sourceType === "api" ? 30 : 120;
  const ageDays = Math.max(0, (now.getTime() - lastVerifiedAt.getTime()) / DAY_MS);
  const decayed = base * Math.pow(0.5, ageDays / halfLifeDays);
  return Math.round(Math.min(base, Math.max(0, decayed)) * 100) / 100;
}

export function confidenceBand(
  confidence: number,
  lastVerifiedAt?: Date,
  now: Date = new Date(),
): ConfidenceBand {
  if (lastVerifiedAt) {
    const ageDays = (now.getTime() - lastVerifiedAt.getTime()) / DAY_MS;
    if (ageDays > 180) return "potentially_outdated";
  }
  if (confidence >= 0.95) return "verified";
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.7) return "medium";
  return "needs_review";
}

export const CONFIDENCE_BAND_LABEL: Record<ConfidenceBand, string> = {
  verified: "Verified",
  high: "High confidence",
  medium: "Medium confidence",
  needs_review: "Needs review",
  potentially_outdated: "Potentially outdated",
};

/* -------------------------------------------------------------------------- */
/* Structured query — the object every surface speaks                          */
/* -------------------------------------------------------------------------- */

export const CorridorQuery = z.object({
  /** Where the *company* asking is incorporated. Drives entity eligibility. */
  entityCountry: CountryCode.optional(),
  customerType: CustomerType.default("business"),
  sourceCountry: CountryCode.optional(),
  /** How the sender funds the provider; deliberately distinct from the receiving endpoint. */
  sourceEndpointType: ReceivingEndpointType.optional(),
  /** A named inbound rail such as SEPA, ACH, UPI, or PIX. */
  sourceNamedRail: z.string().optional(),
  destinationCountry: CountryCode.optional(),
  /** Stablecoin asset being sent, e.g. USDC. Kept separate from source fiat. */
  sourceAsset: z.string().optional(),
  sourceNetwork: z.string().optional(),
  /** Fiat funding currency, e.g. INR or AED. Never stored as a crypto asset. */
  sourceCurrency: CurrencyCode.optional(),
  destinationCurrency: CurrencyCode.optional(),
  paymentMethod: PaymentMethod.optional(),
  /** How the recipient holds the money — bank account vs. mobile money vs. wallet, independent of which named rail moves it there. */
  endpointType: ReceivingEndpointType.optional(),
  /** A specific named rail, e.g. "SEPA_INSTANT" or "MPESA" — see named_rails.code. Independent of `endpointType`: a bank account can be reached via SEPA_INSTANT or plain SWIFT. */
  namedRail: z.string().optional(),
  product: ProductType.optional(),
  amount: z.number().positive().optional(),
  amountCurrency: CurrencyCode.optional(),
});
export type CorridorQuery = z.infer<typeof CorridorQuery>;

/**
 * Ranking presets. A user who configures nothing still gets a good answer.
 * `max_recipient_amount` and `most_reliable` are the decision-engine's
 * customer preference modes (alongside cheapest/fastest/balanced) — real
 * quote routing (`routeQuote`) uses all five; provider-level search
 * (`scoreProvider`) additionally supports easiest_onboarding/widest_coverage,
 * which only make sense pre-connection.
 */
export const RankingPreset = z.enum([
  "balanced",
  "cheapest",
  "fastest",
  "easiest_onboarding",
  "widest_coverage",
  "max_recipient_amount",
  "most_reliable",
]);
export type RankingPreset = z.infer<typeof RankingPreset>;

export const RANKING_PRESET_LABEL: Record<RankingPreset, string> = {
  balanced: "Balanced",
  cheapest: "Cheapest",
  fastest: "Fastest settlement",
  easiest_onboarding: "Easiest onboarding",
  widest_coverage: "Widest coverage",
  max_recipient_amount: "Max recipient amount",
  most_reliable: "Most reliable",
};

/**
 * One interpreted token of a natural-language query. The UI renders these as
 * editable chips — correcting Railor is a click, never a re-type.
 */
export const QueryToken = z.object({
  field: z.enum([
    "entityCountry",
    "customerType",
    "sourceCountry",
    "sourceEndpointType",
    "sourceNamedRail",
    "destinationCountry",
    "sourceAsset",
    "sourceNetwork",
    "destinationCurrency",
    "paymentMethod",
    "product",
    "amount",
  ]),
  value: z.union([z.string(), z.number()]),
  label: z.string(),
  confidence: z.number().min(0).max(1),
  /** Which words in the input produced this token. */
  matchedText: z.string().optional(),
  derivation: Derivation,
});
export type QueryToken = z.infer<typeof QueryToken>;

export const Interpretation = z.object({
  input: z.string(),
  query: CorridorQuery,
  tokens: z.array(QueryToken),
  /** Fields Railor could not determine — surfaced as "add this" chips. */
  missing: z.array(z.string()),
  interpreter: z.enum(["rules", "model", "rules+model"]),
});
export type Interpretation = z.infer<typeof Interpretation>;

/* -------------------------------------------------------------------------- */
/* Eligibility                                                                 */
/* -------------------------------------------------------------------------- */

export const EligibilityVerdict = z.enum([
  "supported",
  "additional_requirements",
  "unavailable",
  "unknown",
]);
export type EligibilityVerdict = z.infer<typeof EligibilityVerdict>;

/** Operational readiness is separate from evidence eligibility. */
export const OperationalReadiness = z.enum(["normal", "degraded", "access_required", "not_tested"]);
export type OperationalReadiness = z.infer<typeof OperationalReadiness>;

export const VERDICT_LABEL: Record<EligibilityVerdict, string> = {
  supported: "Supported",
  additional_requirements: "Additional requirements",
  unavailable: "Unavailable",
  unknown: "Unknown",
};

/** Why a verdict landed where it did. Never render a bare "Unsupported". */
export const EligibilityReason = z.object({
  code: z.enum([
    "entity_jurisdiction_unsupported",
    "customer_country_unsupported",
    "asset_unsupported",
    "network_unsupported",
    "currency_unsupported",
    "product_unavailable",
    "payment_method_unsupported",
    "customer_type_unsupported",
    "amount_below_minimum",
    "amount_above_maximum",
    "requirements_outstanding",
    "no_data",
    "all_checks_passed",
  ]),
  /** Plain-language sentence shown to the user. */
  message: z.string(),
  /** What is nonetheless true — prevents a dead end. */
  alsoTrue: z.array(z.string()).default([]),
  /** What the user could change to flip this verdict. */
  wouldChange: z.array(z.string()).default([]),
});
export type EligibilityReason = z.infer<typeof EligibilityReason>;

/** How the money actually lands for the recipient — the Skydo-vs-Xflow distinction. */
export const ReceivingMode = z.object({
  stablecoinMode: z.string(),
  endpointType: z.string().nullable(),
  namedRail: z.string().nullable(),
  settlementEstimate: z.string().nullable(),
  complianceDocs: z.string().nullable(),
});
export type ReceivingMode = z.infer<typeof ReceivingMode>;

/**
 * How far Railor could actually take this specific route today — a
 * different axis from `eligibility` (which says whether the route is
 * *true*) and from `operationalReadiness` (which says whether the provider
 * is currently *healthy*). A route can be fully SUPPORTED and still cap out
 * at "compatible" because nobody has connected credentials for it yet.
 * Never inferred backwards: reaching a later state always requires the
 * earlier ones to hold, but holding an earlier one never implies a later one.
 */
export const RouteConnectivityState = z.enum([
  "discovered",
  "compatible",
  "connected",
  "live_quotable",
  "executable",
]);
export type RouteConnectivityState = z.infer<typeof RouteConnectivityState>;

export const CONNECTIVITY_STATE_LABEL: Record<RouteConnectivityState, string> = {
  discovered: "Discovered",
  compatible: "Compatible",
  connected: "Connected",
  live_quotable: "Live quote available",
  executable: "Executable",
};

export const ProviderResult = z.object({
  provider: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    category: z.string(),
    /** True for Railor's own seeded demo companies — never a real business. Excluded from search by default; see searchCorridors's `includeDemoProviders` option. */
    isDemo: z.boolean().default(false),
  }),
  eligibility: EligibilityVerdict,
  confidence: z.number().min(0).max(1),
  band: ConfidenceBand,
  lastVerifiedAt: z.coerce.date().nullable(),
  reasons: z.array(EligibilityReason),
  /** Requirements the org has not satisfied yet, when known. */
  outstandingRequirements: z.array(z.string()).default([]),
  facts: z
    .object({
      productLabel: z.string().optional(),
      feeSummary: z.string().optional(),
      limitSummary: z.string().optional(),
      settlementSummary: z.string().optional(),
      kybSummary: z.string().optional(),
    })
    .default({}),
  evidence: z.array(Evidence).default([]),
  /** Preset-dependent score, 0–100. Ineligible providers are never ranked up. */
  score: z.number().min(0).max(100).default(0),
  /** What fraction of the preset's weight was backed by real data — see rankingInputsMissing. 1.0 means every factor was real; a low value means the score leans heavily on eligibility/confidence alone. */
  rankingConfidence: z.number().min(0).max(1).default(0),
  /** Which of cost/speed/onboarding/reliability/coverage/confidence actually had real data for this provider. */
  rankingInputsUsed: z.array(z.string()).default([]),
  /** The complement of rankingInputsUsed — named explicitly so "why is this ranked here" never requires reverse-engineering a missing 0.5. */
  rankingInputsMissing: z.array(z.string()).default([]),
  /** How far this specific route can actually be taken today — see RouteConnectivityState's doc comment. Only computed past "compatible" when the caller passes an organizationId to searchCorridors. */
  connectivity: RouteConnectivityState.default("discovered"),
  operationalReadiness: OperationalReadiness.default("not_tested"),
  /** Set only when a receiving_endpoints fact decided the corridor. */
  receivingMode: ReceivingMode.nullable().default(null),
});
export type ProviderResult = z.infer<typeof ProviderResult>;

/** Country-level regulatory context for the destination — never gates a verdict, only informs it. */
export const CountryContext = z.object({
  iso2: z.string(),
  countryName: z.string().nullable(),
  cryptoStatus: z.string().nullable(),
  stablecoinStatus: z.string().nullable(),
  instantPaymentSystem: z.string().nullable(),
  localPaymentRails: z.array(z.string()).default([]),
  kycRequirements: z.array(z.string()).default([]),
  kybRequirements: z.array(z.string()).default([]),
  amlRequirements: z.array(z.string()).default([]),
  crossBorderRestrictions: z.array(z.string()).default([]),
  lastResearchedAt: z.coerce.date().nullable(),
});
export type CountryContext = z.infer<typeof CountryContext>;

export const CorridorSearchResult = z.object({
  query: CorridorQuery,
  preset: RankingPreset,
  providersChecked: z.number().int(),
  counts: z.object({
    supported: z.number().int(),
    additional_requirements: z.number().int(),
    unavailable: z.number().int(),
    unknown: z.number().int(),
  }),
  results: z.array(ProviderResult),
  generatedAt: z.coerce.date(),
  /** Regulatory context for the destination country, when Railor has researched it. */
  countryContext: CountryContext.nullable().default(null),
});
export type CorridorSearchResult = z.infer<typeof CorridorSearchResult>;

/* -------------------------------------------------------------------------- */
/* Change events                                                               */
/* -------------------------------------------------------------------------- */

export const ChangeKind = z.enum([
  "coverage_changed",
  "requirement_changed",
  "pricing_changed",
  "limit_changed",
  "api_changed",
  "documentation_changed",
  "service_degraded",
  "product_launched",
  "product_removed",
]);
export type ChangeKind = z.infer<typeof ChangeKind>;

export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = {
  coverage_changed: "Coverage changed",
  requirement_changed: "Requirement changed",
  pricing_changed: "Pricing changed",
  limit_changed: "Limit changed",
  api_changed: "API changed",
  documentation_changed: "Documentation changed",
  service_degraded: "Service degraded",
  product_launched: "Product launched",
  product_removed: "Product removed",
};

export const ReviewStatus = z.enum(["pending", "approved", "rejected", "auto_published"]);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

/* -------------------------------------------------------------------------- */
/* Onboarding + org profile                                                    */
/* -------------------------------------------------------------------------- */

export const BuildingType = z.enum([
  "payments",
  "wallet",
  "neobank",
  "marketplace",
  "card_program",
  "treasury",
  "stablecoin_infrastructure",
  "remittances",
  "other",
]);
export type BuildingType = z.infer<typeof BuildingType>;

export const InfrastructureInterest = z.enum([
  "stablecoin_to_fiat",
  "fiat_to_stablecoin",
  "cards",
  "bank_payouts",
  "collections",
  "virtual_accounts",
  "kyc_kyb",
  "treasury",
  "wallet_infrastructure",
]);
export type InfrastructureInterest = z.infer<typeof InfrastructureInterest>;

export const OnboardingAnswers = z.object({
  building: BuildingType.optional(),
  entityCountry: CountryCode.optional(),
  targetCountries: z.array(CountryCode).default([]),
  settlementCurrencies: z.array(CurrencyCode).default([]),
  interests: z.array(InfrastructureInterest).default([]),
  /** Steps the user skipped, recorded as explicit assumptions, never silent. */
  assumptions: z.array(z.string()).default([]),
});
export type OnboardingAnswers = z.infer<typeof OnboardingAnswers>;

/* -------------------------------------------------------------------------- */
/* API envelope                                                                */
/* -------------------------------------------------------------------------- */

/** Every /v1 payload carries provenance. No claim ships without it. */
export interface RailorEnvelope<T> {
  object: string;
  data: T;
  evidence?: Evidence[];
  confidence?: number;
  last_verified_at?: string | null;
  request_id: string;
}

export const OrgRole = z.enum(["owner", "admin", "member", "viewer"]);
export type OrgRole = z.infer<typeof OrgRole>;
