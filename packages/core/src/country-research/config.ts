/**
 * Cost-safety knobs and the country scope lock. Every limit here exists so
 * a bug or a bad flag can't accidentally fan out into an unbounded Tavily/
 * Gemini bill — see ingest.ts for where each one is actually enforced.
 */
import { whereAlpha2 } from "iso-3166-1";

/**
 * researchCountry() refuses anything outside this set — not a soft
 * suggestion. Started as the 5 v1 countries; expanded to every country in
 * @railor/database's seeded `countries` table once those 5 were verified
 * (see packages/database/src/seed/data.ts — keep this list in sync with
 * that one). Still bounded, still deliberate: an unseeded country code
 * would fail the countries-table FK anyway, so this can never silently grow
 * to "the whole world."
 */
export const RESEARCHABLE_COUNTRIES = [
  "IN", "AE", "US", "GB", "SG", "NG", "SA", "DE", "FR", "NL",
  "BR", "MX", "KE", "ZA", "PH", "ID", "TR", "CA", "AU", "HK",
  "CH", "ES", "IT", "PT", "IE", "SE", "NO", "DK", "PL", "BE",
  "QA", "KW", "BH", "OM", "IL", "EG", "JP", "KR", "CN", "TW",
  "VN", "TH", "MY", "PK", "BD", "LK", "NZ", "GH", "MA", "TZ",
  "UG", "CI", "SN", "ET", "AR", "CO", "CL", "PE",
] as const;
export type ResearchableCountry = (typeof RESEARCHABLE_COUNTRIES)[number];

export function isResearchableCountry(code: string): code is ResearchableCountry {
  return (RESEARCHABLE_COUNTRIES as readonly string[]).includes(code.toUpperCase());
}

/**
 * ISO3 is a deterministic lookup (iso-3166-1, standard ISO 3166 data), not
 * LLM-researched — a static fact doesn't need a paid call, and hand-typing
 * 58 alpha-3 codes is exactly the kind of transcription risk that library
 * exists to avoid. countryName always comes from @railor/database's own
 * `countries.name` (the seeded name Railor already shows everywhere else),
 * never from this lookup, so wording never diverges from the rest of the app.
 */
export function staticIso3(iso2: ResearchableCountry): string | null {
  return whereAlpha2(iso2)?.alpha3 ?? null;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const COUNTRY_RESEARCH_CONFIG = {
  /** Upper bound on research queries generated per country. */
  maxQueries: envInt("COUNTRY_RESEARCH_MAX_QUERIES", 9),
  /** Tavily `max_results` per individual search query. */
  maxResultsPerQuery: envInt("COUNTRY_RESEARCH_MAX_RESULTS_PER_QUERY", 5),
  /** Upper bound on distinct source documents extracted and sent to the LLM. */
  maxSourceDocs: envInt("COUNTRY_RESEARCH_MAX_SOURCE_DOCS", 20),
  /** Upper bound on total source-content characters included in the extraction prompt. */
  maxCharsToLlm: envInt("COUNTRY_RESEARCH_MAX_CHARS_TO_LLM", 60_000),
  /** A completed/partial run younger than this blocks a new non-forced run for the same country. */
  minRecheckHours: envInt("COUNTRY_RESEARCH_MIN_RECHECK_HOURS", 20),
  tavilyTimeoutMs: envInt("COUNTRY_RESEARCH_TAVILY_TIMEOUT_MS", 15_000),
  /** Extraction model call timeout — Gemini via @google/genai. Generous default: the Pro-tier model is slower than Flash on a large prompt. */
  extractionTimeoutMs: envInt("COUNTRY_RESEARCH_EXTRACTION_TIMEOUT_MS", 120_000),
  /** Optional fallback content fetcher, used only for URLs Tavily's own extract() couldn't retrieve. */
  firecrawlTimeoutMs: envInt("COUNTRY_RESEARCH_FIRECRAWL_TIMEOUT_MS", 30_000),
  /** Bounded retries for transient Tavily failures — never infinite. */
  maxRetries: envInt("COUNTRY_RESEARCH_MAX_RETRIES", 3),
  /** How many Tavily searches run at once. */
  concurrency: envInt("COUNTRY_RESEARCH_CONCURRENCY", 3),
} as const;
