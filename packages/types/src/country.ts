/**
 * Country intelligence — the extraction schema OpenAI's structured-output
 * call validates against, plus zod mirrors of the country-research enums in
 * @railor/database's schema.ts.
 *
 * Every researched field is wrapped in a `{ value, sourceUrls }` shape so the
 * model self-attributes citations per fact, and every `value` is `.nullable()`
 * rather than `.optional()` — OpenAI's strict JSON-schema mode requires every
 * property present in `required`, so "unknown" has to be an explicit null.
 * That constraint happens to match this system's own epistemics exactly:
 * null/empty means the sources didn't establish an answer, never a guess.
 *
 * This schema's shape (wrapper objects, one row) is a prompt-engineering
 * concern only — the database stays normalized (see country_profiles /
 * country_fact_sources in schema.ts). Ingestion flattens one into the other.
 */
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Enums — mirror the pgEnums in schema.ts                                    */
/* -------------------------------------------------------------------------- */

export const CountrySourceCategory = z.enum([
  "central_bank",
  "banking",
  "payment_rails",
  "cross_border",
  "stablecoin",
  "crypto",
  "aml",
  "kyc",
  "kyb",
  "payout",
  "government",
  "provider",
  "other",
]);
export type CountrySourceCategory = z.infer<typeof CountrySourceCategory>;

export const CountrySourceType = z.enum([
  "regulation",
  "official_guidance",
  "news_press",
  "help_faq",
  "report",
  "wiki_reference",
  "other",
]);
export type CountrySourceType = z.infer<typeof CountrySourceType>;

export const CountrySourceAuthority = z.enum([
  "official_regulator",
  "government",
  "official_network",
  "official_provider",
  "international_organization",
  "reputable_secondary",
  "unknown",
]);
export type CountrySourceAuthority = z.infer<typeof CountrySourceAuthority>;

/** Trust ranking, highest first — used to resolve conflicting facts and to cap which sources survive. */
export const COUNTRY_SOURCE_AUTHORITY_RANK: Record<CountrySourceAuthority, number> = {
  official_regulator: 6,
  government: 5,
  official_network: 4,
  official_provider: 3,
  international_organization: 2,
  reputable_secondary: 1,
  unknown: 0,
};

export const CountryResearchStatus = z.enum([
  "pending",
  "searching",
  "extracting",
  "validating",
  "completed",
  "failed",
  "partial",
]);
export type CountryResearchStatus = z.infer<typeof CountryResearchStatus>;

export const CountryResearchTrigger = z.enum(["cli", "admin_refresh", "scheduled"]);
export type CountryResearchTrigger = z.infer<typeof CountryResearchTrigger>;

/* -------------------------------------------------------------------------- */
/* LLM extraction schema                                                      */
/* -------------------------------------------------------------------------- */

const SourcedText = z.object({
  value: z.string().nullable(),
  sourceUrls: z.array(z.string()).default([]),
});

const SourcedBoolean = z.object({
  value: z.boolean().nullable(),
  sourceUrls: z.array(z.string()).default([]),
});

const SourcedStringArray = z.object({
  value: z.array(z.string()).default([]),
  sourceUrls: z.array(z.string()).default([]),
});

/**
 * One field per research category from the ingestion pipeline's query
 * generator. Field names match `country_profiles` columns 1:1 so flattening
 * at ingestion time is a mechanical rename, not a remapping.
 */
export const CountryProfileExtraction = z.object({
  centralBankName: SourcedText,
  regulatorNames: SourcedStringArray,
  pspLicensingSummary: SourcedText,

  ibanSupported: SourcedBoolean,
  ibanNote: SourcedText,
  swiftSupported: SourcedBoolean,
  swiftNote: SourcedText,

  instantPaymentAvailable: SourcedBoolean,
  instantPaymentSystem: SourcedText,
  localPaymentRails: SourcedStringArray,
  bankAccountRequirements: SourcedStringArray,
  routingCodeType: SourcedText,
  routingCodeDescription: SourcedText,

  cryptoStatus: SourcedText,
  stablecoinStatus: SourcedText,

  kycRequirements: SourcedStringArray,
  kybRequirements: SourcedStringArray,
  amlRequirements: SourcedStringArray,
  crossBorderRestrictions: SourcedStringArray,
  supportedPayoutCurrencies: SourcedStringArray,
});
export type CountryProfileExtraction = z.infer<typeof CountryProfileExtraction>;

/** The keys of CountryProfileExtraction — doubles as the set of valid `country_fact_sources.fact_key` values. */
export const COUNTRY_PROFILE_FACT_KEYS = CountryProfileExtraction.keyof().options;
export type CountryProfileFactKey = (typeof COUNTRY_PROFILE_FACT_KEYS)[number];

/* -------------------------------------------------------------------------- */
/* Read-API shape — GET /api/countries/:code                                  */
/* -------------------------------------------------------------------------- */

export const CountrySourceSummary = z.object({
  id: z.string(),
  url: z.string(),
  domain: z.string(),
  title: z.string().nullable(),
  category: CountrySourceCategory,
  sourceType: CountrySourceType,
  authorityLevel: CountrySourceAuthority,
  publishedAt: z.coerce.date().nullable(),
  accessedAt: z.coerce.date(),
});
export type CountrySourceSummary = z.infer<typeof CountrySourceSummary>;
