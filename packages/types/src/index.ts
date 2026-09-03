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
    "endpointType",
    "namedRail",
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

/**
 * A third axis, alongside `eligibility` (is the route true?) and
 * `RouteConnectivityState` (can Railor actually reach it?): how *complete*
 * is the evidence for the specific route asked about — the full requested
 * tuple (entity, asset, network, destination, currency, rail...), not each
 * dimension checked in isolation.
 *
 * The AI/interpreter resolves *intent* into a query with as many dimensions
 * as the user actually named ("USDC on Base to a UAE supplier receiving
 * AED" becomes all four, structured). It never resolves *evidence* — that
 * stays exactly as strict as the underlying facts, computed here, never
 * upgraded by how well the query was understood. Only null/unset dimensions
 * are ever treated as unconfirmed; a well-understood query with thin
 * evidence still reports honestly.
 *
 *   CONFIRMED           one evidence-backed row proves the whole requested tuple at once.
 *   PARTIALLY_CONFIRMED some requested dimensions are independently proven; the joint route is not.
 *   UNCONFIRMED         the route is plausible (the provider serves this product) but nothing requested is independently proven.
 *   UNSUPPORTED         a provider statement explicitly rules out this route or one of its requested dimensions.
 *   UNKNOWN             not even a plausible route can be formed (no matching product at all).
 *
 * Never inferred backwards: reaching CONFIRMED always requires an atomic,
 * single-source proof — a provider passing every dimension check separately
 * (five different rows, five different sources) still caps at
 * PARTIALLY_CONFIRMED, because five independent facts are not proof they
 * hold together. This is deliberately stricter than `eligibility`, which is
 * allowed to say "supported" from independently-combined facts when the
 * query never asked for a full atomic route (see eligibility.ts's
 * `routeDimensionsRequested` gate — this field is only computed when it does).
 */
export const RouteConfirmation = z.enum([
  "confirmed",
  "partially_confirmed",
  "unconfirmed",
  "unsupported",
  "unknown",
]);
export type RouteConfirmation = z.infer<typeof RouteConfirmation>;

export const ROUTE_CONFIRMATION_LABEL: Record<RouteConfirmation, string> = {
  confirmed: "Confirmed",
  partially_confirmed: "Partially confirmed",
  unconfirmed: "Unconfirmed",
  unsupported: "Unsupported",
  unknown: "Unknown",
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
  /** Set only when the query asked for a full route (destination + at least one source dimension) — see RouteConfirmation's doc comment. Null means the concept doesn't apply to this query. */
  routeConfirmation: RouteConfirmation.nullable().default(null),
  /** Requested dimensions independently proven by real facts, even without a joint atomic route. */
  confirmedDimensions: z.array(z.string()).default([]),
  /** The complement of confirmedDimensions — named explicitly so a thin PARTIALLY_CONFIRMED never requires reverse-engineering what's still missing. */
  unconfirmedDimensions: z.array(z.string()).default([]),
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

/* ============================================================================
 * Control plane: PaymentIntent -> Policy -> Decision
 *
 * Everything below is additive to the vocabulary above, not a replacement.
 * The eligibility/ranking engine (evaluateProvider, scoreProvider,
 * searchCorridors) is reused exactly as-is; PaymentIntent maps onto the
 * existing CorridorQuery rather than duplicating its fields, and
 * RouteConfirmation/EligibilityVerdict are reused verbatim as the Decision
 * Engine's only sources of route truth. Nothing here upgrades evidence
 * quality — a Decision can only be as certain as the RouteConfirmation the
 * existing engine already computed.
 * ========================================================================== */

/* -------------------------------------------------------------------------- */
/* PaymentIntent                                                              */
/* -------------------------------------------------------------------------- */

export const BeneficiaryType = z.enum(["business", "individual"]);
export type BeneficiaryType = z.infer<typeof BeneficiaryType>;

/**
 * The control plane's canonical request. A superset of CorridorQuery in
 * naming clarity only (`sourceEntityCountry` instead of `entityCountry`,
 * `beneficiaryType` alongside the existing `customerType`) — every dimension
 * here already exists in CorridorQuery; see `intentToCorridorQuery` below,
 * which is the only place the two shapes are reconciled. No new dimension is
 * invented: if a field isn't checkable by the existing eligibility engine,
 * it has no business being "required" here, because nothing downstream could
 * ever confirm it. `destinationCountry` and `amount` are the only two fields
 * that must be present for a Decision to mean anything; everything else is
 * optional and stays `undefined` — never guessed — when the caller doesn't
 * supply it.
 */
export const PaymentIntent = z.object({
  /** Where the sending entity is incorporated. Maps to CorridorQuery.entityCountry. */
  sourceEntityCountry: CountryCode,
  /** Maps to CorridorQuery.customerType. */
  sourceEntityType: CustomerType.default("business"),
  sourceAsset: z.string().optional(),
  sourceNetwork: z.string().optional(),
  /** Fiat funding currency, only when the source leg is fiat, not a stablecoin. */
  sourceCurrency: CurrencyCode.optional(),
  destinationCountry: CountryCode,
  destinationCurrency: CurrencyCode.optional(),
  /** Who receives the money. Independent of sourceEntityType — a business can pay an individual. */
  beneficiaryType: BeneficiaryType.default("business"),
  endpointType: ReceivingEndpointType.optional(),
  namedRail: z.string().optional(),
  paymentMethod: PaymentMethod.optional(),
  /** Which product family this intent describes. Left undefined lets the existing engine's candidateProducts() infer it exactly as CorridorQuery already does — never forced to a fabricated default here. */
  product: ProductType.optional(),
  amount: z.number().positive(),
  amountCurrency: CurrencyCode.optional(),
  /** Deterministic ranking preference — reuses RankingPreset verbatim. */
  preference: RankingPreset.default("balanced"),
});
export type PaymentIntent = z.infer<typeof PaymentIntent>;

/**
 * The only place a PaymentIntent becomes a CorridorQuery. Pure field
 * renaming plus one fixed default (`product: "payout"` only when the intent
 * didn't name one) — never infers a value the intent didn't state, never
 * calls the deterministic rule interpreter or the LLM gap-filler. A
 * PaymentIntent is already structured; it has no free text left to parse.
 */
export function intentToCorridorQuery(intent: PaymentIntent): CorridorQuery {
  return {
    entityCountry: intent.sourceEntityCountry,
    customerType: intent.sourceEntityType,
    sourceAsset: intent.sourceAsset,
    sourceNetwork: intent.sourceNetwork,
    sourceCurrency: intent.sourceCurrency,
    destinationCountry: intent.destinationCountry,
    destinationCurrency: intent.destinationCurrency,
    paymentMethod: intent.paymentMethod,
    endpointType: intent.endpointType,
    namedRail: intent.namedRail,
    product: intent.product,
    amount: intent.amount,
    amountCurrency: intent.amountCurrency,
  };
}

/* -------------------------------------------------------------------------- */
/* Policy                                                                      */
/* -------------------------------------------------------------------------- */

export const PolicyStatus = z.enum(["draft", "active", "superseded", "disabled"]);
export type PolicyStatus = z.infer<typeof PolicyStatus>;

/**
 * The launch rule set — typed JSON, not a programming language. Extending
 * Railor's policy model means adding a field here and one branch in the
 * deterministic evaluator, never an expression language a customer could
 * write arbitrary logic in. Every field is independently checkable against
 * data Railor actually has, or is explicitly documented below as not yet
 * checkable against real data (`allowPrefunding`) — a field existing here is
 * not a claim Railor can enforce it today, only that the shape is ready for
 * when it can.
 */
export const PolicyRules = z.object({
  providerAllowlist: z.array(z.string()).optional(),
  providerDenylist: z.array(z.string()).default([]),
  allowedAssets: z.array(z.string()).optional(),
  deniedAssets: z.array(z.string()).default([]),
  allowedNetworks: z.array(z.string()).optional(),
  deniedNetworks: z.array(z.string()).default([]),
  /** A candidate whose RouteConfirmation ranks below this is a hard fail — never silently passed because the tier is merely unknown. */
  minimumRouteCertainty: RouteConfirmation.optional(),
  maximumEvidenceAgeHours: z.number().int().positive().optional(),
  /** Requires RouteConfirmation === "confirmed" exactly — the atomic-evidence tier, never partially_confirmed. */
  requireExactRouteEvidence: z.boolean().default(false),
  requireCustomerConnectedProvider: z.boolean().default(false),
  requireLiveQuote: z.boolean().default(false),
  /**
   * Railor has no real, evidenced "is this provider an aggregator" data
   * field today (providers.category is free text, never a controlled
   * taxonomy) — so this rule can only ever be enforced when a provider's own
   * category text happens to say "aggregator" literally, and reports
   * `unknown` otherwise rather than fabricating a classification. See
   * evaluatePolicy in @railor/core.
   */
  allowAggregators: z.boolean().default(true),
  /** A soft ranking preference, not a hard gate — applied as a ranking nudge in the Decision Engine, never a PASS/FAIL rule (see decision-engine.ts). Same real-data caveat as allowAggregators. */
  preferDirectProvider: z.boolean().default(false),
  /**
   * Not yet enforceable: Railor has no schema field recording whether a
   * provider requires customer prefunding. Kept in the rule set so a policy
   * can express the intent now; evaluatePolicy always reports this rule
   * `not_applicable` until such a data field exists — never fabricated.
   */
  allowPrefunding: z.boolean().default(true),
  maximumKnownCostBps: z.number().nonnegative().optional(),
  maximumEtaMinutes: z.number().positive().optional(),
  denyDuringActiveIncident: z.boolean().default(true),
  minimumObservedReliability: z.number().min(0).max(1).optional(),
  /** Not a candidate-level rule — flags the whole Decision for human review instead of filtering candidates. */
  humanApprovalAboveAmount: z.number().positive().optional(),
});
export type PolicyRules = z.infer<typeof PolicyRules>;

export const DEFAULT_POLICY_RULES: PolicyRules = PolicyRules.parse({});

export const Policy = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  status: PolicyStatus,
  activeVersionId: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Policy = z.infer<typeof Policy>;

export const PolicyVersion = z.object({
  id: z.string(),
  policyId: z.string(),
  versionNumber: z.number().int().positive(),
  status: PolicyStatus,
  rules: PolicyRules,
  createdAt: z.coerce.date(),
  activatedAt: z.coerce.date().nullable(),
  supersededAt: z.coerce.date().nullable(),
});
export type PolicyVersion = z.infer<typeof PolicyVersion>;

/* -------------------------------------------------------------------------- */
/* Policy evaluation                                                           */
/* -------------------------------------------------------------------------- */

export const PolicyEvalResult = z.enum(["pass", "fail", "unknown", "not_applicable"]);
export type PolicyEvalResult = z.infer<typeof PolicyEvalResult>;

/**
 * Not a closed set — new codes can be added as new rules are added. The
 * fixed meaning of each: a `_DENIED` code means an explicit denylist/statement
 * ruled the candidate out; `_NOT_ALLOWED` means an allowlist exists and the
 * candidate isn't on it; `INSUFFICIENT_*_DATA` means Railor has no real data
 * to check the rule at all, never defaulted to a pass.
 */
export const PolicyReasonCode = z.enum([
  "provider_denied",
  "provider_not_allowed",
  "network_denied",
  "asset_denied",
  "route_certainty_too_low",
  "evidence_too_old",
  "exact_route_required",
  "provider_not_connected",
  "live_quote_required",
  "prefunding_forbidden",
  "cost_limit_exceeded",
  "eta_limit_exceeded",
  "active_provider_incident",
  "insufficient_reliability_data",
  "reliability_below_threshold",
  "aggregator_not_allowed",
  "approval_required",
  "policy_pass",
]);
export type PolicyReasonCode = z.infer<typeof PolicyReasonCode>;

export const PolicyRuleEvaluation = z.object({
  rule: z.string(),
  result: PolicyEvalResult,
  code: PolicyReasonCode.optional(),
  message: z.string(),
});
export type PolicyRuleEvaluation = z.infer<typeof PolicyRuleEvaluation>;

/**
 * One candidate's full policy verdict. `result` is the aggregate: `fail` if
 * any rule failed (a hard policy failure can never be outvoted by passing
 * rules), else `unknown` if any evidence-requiring rule couldn't be checked,
 * else `pass`. Never collapses which specific rule produced that aggregate —
 * `ruleResults` is the full, inspectable breakdown.
 */
export const CandidatePolicyEvaluation = z.object({
  result: PolicyEvalResult,
  ruleResults: z.array(PolicyRuleEvaluation),
});
export type CandidatePolicyEvaluation = z.infer<typeof CandidatePolicyEvaluation>;

/* -------------------------------------------------------------------------- */
/* Decision                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Explicit, non-collapsed failure modes — never one generic "denied" bucket.
 *   ALLOW               a candidate passed policy and was recommended.
 *   DENY                every candidate that reached policy evaluation failed it.
 *   NO_VERIFIED_ROUTE   no candidate had a usable route at all (base eligibility, before policy).
 *   INSUFFICIENT_DATA   candidates exist but policy evaluation could not be completed (UNKNOWN, not FAIL) for all of them.
 *   APPROVAL_REQUIRED   a recommendation exists but humanApprovalAboveAmount gates it on a human sign-off.
 */
export const DecisionStatus = z.enum([
  "allow",
  "deny",
  "no_verified_route",
  "insufficient_data",
  "approval_required",
]);
export type DecisionStatus = z.infer<typeof DecisionStatus>;

export const QuoteState = z.enum(["live", "indicative", "historical", "none"]);
export type QuoteState = z.infer<typeof QuoteState>;

export const ConnectionState = z.enum(["connected", "not_connected", "mixed", "unknown"]);
export type ConnectionState = z.infer<typeof ConnectionState>;

export const CostCompleteness = z.enum(["complete", "partial", "unknown"]);
export type CostCompleteness = z.infer<typeof CostCompleteness>;

/** A quote, capped to the fields worth persisting as a Decision snapshot — see UnifiedQuote in @railor/core for the live shape this is derived from. */
export const QuoteSnapshot = z.object({
  providerQuoteId: z.string().optional(),
  amount: z.number(),
  recipientAmount: z.number().optional(),
  feeAmount: z.number().optional(),
  feeCurrency: z.string().optional(),
  costPartial: z.boolean(),
  exchangeRate: z.string().optional(),
  estimatedArrivalMinutes: z.number().optional(),
  quoteType: z.enum(["live", "indicative", "historical"]),
  observedAt: z.string(),
  expiresAt: z.string().optional(),
});
export type QuoteSnapshot = z.infer<typeof QuoteSnapshot>;

export const DecisionCandidateRecord = z.object({
  id: z.string(),
  decisionId: z.string(),
  providerId: z.string(),
  providerSlug: z.string(),
  providerName: z.string(),
  routeId: z.string().nullable(),
  eligibilityStatus: EligibilityVerdict,
  routeCertainty: RouteConfirmation.nullable(),
  policyEvaluation: CandidatePolicyEvaluation,
  quoteSnapshot: QuoteSnapshot.nullable(),
  costCompleteness: CostCompleteness,
  /** Real observed health ratio at decision time — null means Railor had zero observations, never defaulted to perfect. */
  reliabilitySnapshot: z.number().min(0).max(1).nullable(),
  rank: z.number().int().nullable(),
  selected: z.boolean(),
  rejectionReasonCodes: z.array(PolicyReasonCode),
  /** Evidence row ids this candidate's eligibility/route facts depended on — enough to replay why, without trusting today's mutable provider state. */
  evidenceIds: z.array(z.string()),
  createdAt: z.coerce.date(),
});
export type DecisionCandidateRecord = z.infer<typeof DecisionCandidateRecord>;

export const DecisionExplain = z.object({
  whySelected: z.array(z.string()),
  whyAlternativesLost: z.array(
    z.object({ providerSlug: z.string(), providerName: z.string(), reasons: z.array(z.string()) }),
  ),
  whatWouldChange: z.array(z.string()),
  missingInformation: z.array(z.string()),
});
export type DecisionExplain = z.infer<typeof DecisionExplain>;

export const DecisionRecord = z.object({
  id: z.string(),
  organizationId: z.string(),
  intent: PaymentIntent,
  policyId: z.string(),
  policyVersionId: z.string(),
  policyVersionNumber: z.number().int(),
  engineVersion: z.string(),
  status: DecisionStatus,
  recommendedProviderId: z.string().nullable(),
  recommendedProviderSlug: z.string().nullable(),
  recommendedRouteId: z.string().nullable(),
  certainty: RouteConfirmation.nullable(),
  rankingConfidence: z.number().min(0).max(1),
  quoteState: QuoteState,
  connectionState: ConnectionState,
  evaluatedAt: z.coerce.date(),
  validUntil: z.coerce.date().nullable(),
  revalidationRequired: z.boolean(),
  decisionHash: z.string(),
  warnings: z.array(z.string()),
  previousDecisionId: z.string().nullable(),
  explain: DecisionExplain,
  candidates: z.array(DecisionCandidateRecord),
});
export type DecisionRecord = z.infer<typeof DecisionRecord>;

/* -------------------------------------------------------------------------- */
/* Decision events                                                             */
/* -------------------------------------------------------------------------- */

export const DecisionEventKind = z.enum([
  "created",
  "revalidation_requested",
  "quote_expired",
  "evidence_changed",
  "policy_changed",
  "provider_incident",
  "route_changed",
  "connection_state_changed",
  "revalidated",
  "recommendation_changed",
  "approval_required",
]);
export type DecisionEventKind = z.infer<typeof DecisionEventKind>;

export const DecisionEventRecord = z.object({
  id: z.string(),
  decisionId: z.string(),
  organizationId: z.string(),
  kind: DecisionEventKind,
  detail: z.string(),
  data: z.record(z.unknown()).default({}),
  createdAt: z.coerce.date(),
});
export type DecisionEventRecord = z.infer<typeof DecisionEventRecord>;

/** What triggers a revalidation — see revalidateDecision in @railor/core. */
export const RevalidationTrigger = z.enum([
  "quote_expired",
  "evidence_changed",
  "provider_incident",
  "policy_changed",
  "route_changed",
  "connection_state_changed",
  "manual",
]);
export type RevalidationTrigger = z.infer<typeof RevalidationTrigger>;

/* -------------------------------------------------------------------------- */
/* Policy simulator                                                            */
/* -------------------------------------------------------------------------- */

export const PolicySimulationCandidate = z.object({
  providerSlug: z.string(),
  providerName: z.string(),
  resultA: PolicyEvalResult,
  resultB: PolicyEvalResult,
  changed: z.boolean(),
  reasonCodesA: z.array(PolicyReasonCode),
  reasonCodesB: z.array(PolicyReasonCode),
});
export type PolicySimulationCandidate = z.infer<typeof PolicySimulationCandidate>;

export const PolicySimulationResult = z.object({
  allowedUnderA: z.array(z.string()),
  allowedUnderB: z.array(z.string()),
  blockedUnderA: z.array(z.string()),
  blockedUnderB: z.array(z.string()),
  recommendedProviderA: z.string().nullable(),
  recommendedProviderB: z.string().nullable(),
  recommendationChanged: z.boolean(),
  candidates: z.array(PolicySimulationCandidate),
  /** Which specific rules differ between the two versions and produced a changed candidate outcome. */
  rulesResponsibleForChanges: z.array(z.string()),
});
export type PolicySimulationResult = z.infer<typeof PolicySimulationResult>;
