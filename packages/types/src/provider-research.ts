/**
 * Provider intelligence — the extraction schema Gemini's structured-output
 * call validates against when reading a provider's own documentation.
 *
 * Same epistemics as country.ts: every fact carries its own `sourceUrls`, and
 * every scalar is `.nullable()` rather than `.optional()` so "the sources
 * didn't say" is an explicit null instead of an absent key the model could
 * quietly omit. Ingestion drops any citation that wasn't among the URLs
 * actually fed to the model, so a hallucinated source removes the fact rather
 * than decorating it.
 *
 * Shape note: this is deliberately a *list of rows*, not one wide object like
 * CountryProfileExtraction. A provider's coverage is inherently many-to-many
 * (this currency in that country on this rail), which is exactly what
 * `provider_capabilities` and `receiving_endpoints` already model — asking for
 * one flat object would force the model to collapse that and lose the pairing.
 */
import { z } from "zod";

/** ISO 3166-1 alpha-2, uppercased. Rejects prose so a country name never lands in a code column. */
const CountryCode2 = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "must be an ISO 3166-1 alpha-2 code");

/** ISO 4217, uppercased. */
const CurrencyCode3 = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "must be an ISO 4217 code");

export const ExtractedProduct = z.enum([
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
export type ExtractedProduct = z.infer<typeof ExtractedProduct>;

export const ExtractedCustomerType = z.enum(["business", "individual"]);

/**
 * How a receiving endpoint relates to stablecoins — mirrors
 * `stablecoin_mode` in schema.ts. "unknown" is the honest default: a page that
 * never mentions stablecoins does not thereby prove `fiat_only`.
 */
export const ExtractedStablecoinMode = z.enum([
  "direct_stablecoin",
  "stablecoin_funded_fiat",
  "fiat_only",
  "stablecoin_only",
  "hybrid",
  "unknown",
]);

/**
 * A verbatim span from the supplied source that establishes the row.
 * Ingestion stores it as evidence. The ceiling is generous because a coverage
 * *table* is often the only thing that establishes a corridor, and a truncated
 * table row stops being evidence — a rejected extraction is worse than a long
 * quote.
 */
const quote = z.string().min(1).max(4000);

/**
 * One payout/collection corridor: money reaching a recipient in `country`,
 * denominated in `currency`. `entityCountry` is only set when the source
 * actually ties the corridor to where the *sending business* is incorporated
 * — most provider pages don't, and inventing it would fabricate eligibility.
 */
export const ExtractedCorridor = z.object({
  country: CountryCode2,
  currency: CurrencyCode3.nullable(),
  entityCountry: CountryCode2.nullable(),
  product: ExtractedProduct,
  customerType: ExtractedCustomerType.nullable(),
  stablecoinMode: ExtractedStablecoinMode,
  /** Free text on purpose — "T+2", "instant", "1-3 business days". */
  settlementEstimate: z.string().max(200).nullable(),
  quote,
  sourceUrls: z.array(z.string()),
});
export type ExtractedCorridor = z.infer<typeof ExtractedCorridor>;

/**
 * "A business incorporated in this country can open an account" — an
 * entity-eligibility fact, which is NOT a corridor. It has no destination,
 * because who may sign up is independent of where money can land, and the
 * eligibility engine stores the two as separate facets for exactly that
 * reason. Forcing this into ExtractedCorridor (which requires a destination
 * `country`) would have made it unrepresentable.
 */
export const ExtractedEntityEligibility = z.object({
  entityCountry: CountryCode2,
  customerType: ExtractedCustomerType.nullable(),
  /** The product the eligibility is stated for; `null` when it applies to the account generally. */
  product: ExtractedProduct.nullable(),
  quote,
  sourceUrls: z.array(z.string()),
});
export type ExtractedEntityEligibility = z.infer<typeof ExtractedEntityEligibility>;

/** An asset the provider supports, optionally pinned to a chain when the source pairs them. */
export const ExtractedAsset = z.object({
  /** Ticker as written, e.g. USDC. Reconciled against the asset catalog at ingest. */
  symbol: z.string().trim().min(2).max(12),
  /** Chain name as written, e.g. "Base". Only set when the source pairs asset to chain. */
  network: z.string().trim().max(40).nullable(),
  product: ExtractedProduct,
  quote,
  sourceUrls: z.array(z.string()),
});
export type ExtractedAsset = z.infer<typeof ExtractedAsset>;

/**
 * Published pricing. `percentBps` and `fixedAmount` are separate because
 * providers quote them separately; a source giving only prose keeps both null
 * and survives as `summary` alone rather than being dropped.
 */
export const ExtractedFee = z.object({
  product: ExtractedProduct,
  destinationCurrency: CurrencyCode3.nullable(),
  percentBps: z.number().int().min(0).max(10_000).nullable(),
  fixedAmount: z.number().min(0).nullable(),
  fixedCurrency: CurrencyCode3.nullable(),
  fxSpreadBps: z.number().int().min(0).max(10_000).nullable(),
  summary: z.string().min(1).max(300),
  quote,
  sourceUrls: z.array(z.string()),
});
export type ExtractedFee = z.infer<typeof ExtractedFee>;

/** Mirrors `requirement_kind` in schema.ts — a requirement is about a person, a company, or an integration. */
export const ExtractedRequirementKind = z.enum(["kyc", "kyb", "technical"]);

/** An onboarding requirement the provider states it asks for. */
export const ExtractedRequirement = z.object({
  label: z.string().min(1).max(160),
  kind: ExtractedRequirementKind,
  mandatory: z.boolean(),
  appliesToCountry: CountryCode2.nullable(),
  quote,
  sourceUrls: z.array(z.string()),
});
export type ExtractedRequirement = z.infer<typeof ExtractedRequirement>;

export const ProviderExtraction = z.object({
  corridors: z.array(ExtractedCorridor),
  entityEligibility: z.array(ExtractedEntityEligibility),
  assets: z.array(ExtractedAsset),
  fees: z.array(ExtractedFee),
  requirements: z.array(ExtractedRequirement),
  /** Products the provider offers at all, independent of any one corridor. */
  products: z.array(ExtractedProduct),
  /** Set only when the sources state it outright. */
  hasPublicApi: z.boolean().nullable(),
  hasSandbox: z.boolean().nullable(),
  /** Anything materially true that none of the structured fields can hold. */
  notes: z.array(z.string().max(400)),
});
export type ProviderExtraction = z.infer<typeof ProviderExtraction>;
