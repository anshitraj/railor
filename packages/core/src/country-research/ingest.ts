/**
 * The ingestion orchestrator — researchCountry() is the single entry point
 * shared by the CLI and the admin refresh route/action, the same way
 * rollupApiUsageDay/pruneApiUsage already serve two callers identically.
 *
 * Pipeline: validate -> freshness/concurrency guard (before any paid call) ->
 * create run row -> generate queries -> Tavily search (bounded concurrency,
 * per-query try/catch) -> dedupe + rank by authority -> Tavily extract top
 * sources (Firecrawl as an optional fallback for URLs Tavily couldn't fetch)
 * -> Gemini structured extraction -> drop uncited/hallucinated source URLs
 * -> one DB transaction (upsert profile, upsert sources, replace
 * fact-sources) -> update run row -> return a report.
 *
 * Idempotent by construction: the profile upsert is keyed on the natural key
 * (iso2), sources upsert on (countryIso2, url), and fact-sources are
 * replaced wholesale each run — re-running never creates duplicates.
 *
 * Never writes to namedRails, receivingEndpoints, or providerCapabilities —
 * this stays a fully separate subsystem from the live routing/eligibility
 * graph (RAILOR_BUILD_PROMPT.md's stage-1 intelligence layer, not stage 7
 * orchestration). country_profiles.localPaymentRails is informational,
 * research-derived data; it does not feed corridor eligibility.
 */
import { desc, eq } from "drizzle-orm";
import {
  countries,
  countryFactSources,
  countryProfiles,
  countryResearchRuns,
  countrySources,
  currencies,
  ensureMigrated,
  getDb,
} from "@railor/database";
import type { CountryProfileExtraction, CountryProfileFactKey, CountryResearchStatus, CountryResearchTrigger } from "@railor/types";
import { COUNTRY_PROFILE_FACT_KEYS } from "@railor/types";
import { COUNTRY_RESEARCH_CONFIG, isResearchableCountry, staticIso3, type ResearchableCountry } from "./config.js";
import { buildResearchQueries, type ResearchQuery } from "./queries.js";
import { tavilyExtract, tavilySearch, type TavilySearchResult } from "./tavily.js";
import { classifySourceAuthority, domainFromUrl, rankByAuthority } from "./source-quality.js";
import { normalizeUrl } from "./dedupe.js";
import { extractCountryProfile, type ExtractionSource } from "./extract.js";
import { firecrawlExtract, isFirecrawlConfigured } from "./firecrawl.js";

export class CountryNotResearchableError extends Error {
  constructor(code: string) {
    super(`"${code}" is not one of Railor's researchable countries — it must be a 2-letter ISO code already in the countries table.`);
  }
}

export class ResearchAlreadyFreshError extends Error {
  constructor(countryIso2: string, hoursOld: number) {
    super(`${countryIso2} was researched ${hoursOld.toFixed(1)}h ago, inside the recheck window — pass forceRefresh to research again anyway.`);
  }
}

export class ResearchInProgressError extends Error {
  constructor(countryIso2: string) {
    super(`A research run for ${countryIso2} is already in progress.`);
  }
}

export interface ResearchCountryOptions {
  triggerType: CountryResearchTrigger;
  forceRefresh?: boolean;
  onPhase?: (event: { phase: CountryResearchStatus; detail?: string }) => void;
}

export interface IngestionReport {
  countryIso2: string;
  runId: string;
  status: CountryResearchStatus;
  queriesCount: number;
  sourcesDiscovered: number;
  sourcesUsed: number;
  errorMessage?: string;
  errorPhase?: string;
}

const IN_FLIGHT_STATUSES: CountryResearchStatus[] = ["pending", "searching", "extracting", "validating"];

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

interface DiscoveredSource {
  url: string;
  title: string;
  content: string;
  category: ResearchQuery["category"];
  factKeys: CountryProfileFactKey[];
  score: number;
}

export async function researchCountry(countryCodeRaw: string, options: ResearchCountryOptions): Promise<IngestionReport> {
  const countryIso2 = countryCodeRaw.trim().toUpperCase();
  if (!isResearchableCountry(countryIso2)) throw new CountryNotResearchableError(countryIso2);
  const code = countryIso2 as ResearchableCountry;
  const forceRefresh = options.forceRefresh ?? false;

  await ensureMigrated();
  const db = await getDb();

  const [country] = await db.select().from(countries).where(eq(countries.code, code)).limit(1);
  if (!country) {
    throw new Error(`Country ${code} is not in the countries reference table — cannot research an unknown country.`);
  }

  // Freshness/concurrency guard — runs BEFORE any run row is created and
  // before any paid Tavily/Gemini call, so a refusal never shows up in cost.
  const [latestRun] = await db
    .select()
    .from(countryResearchRuns)
    .where(eq(countryResearchRuns.countryIso2, code))
    .orderBy(desc(countryResearchRuns.startedAt))
    .limit(1);

  if (latestRun && IN_FLIGHT_STATUSES.includes(latestRun.status)) {
    throw new ResearchInProgressError(code);
  }
  if (!forceRefresh && latestRun && (latestRun.status === "completed" || latestRun.status === "partial")) {
    const hoursOld = (Date.now() - latestRun.startedAt.getTime()) / 3_600_000;
    if (hoursOld < COUNTRY_RESEARCH_CONFIG.minRecheckHours) throw new ResearchAlreadyFreshError(code, hoursOld);
  }

  const [run] = await db
    .insert(countryResearchRuns)
    .values({ countryIso2: code, status: "pending", triggerType: options.triggerType })
    .returning();
  if (!run) throw new Error("Failed to create a country_research_runs row.");

  let phase: CountryResearchStatus = "pending";
  const setPhase = async (next: CountryResearchStatus, detail?: string) => {
    phase = next;
    options.onPhase?.({ phase: next, detail });
    await db.update(countryResearchRuns).set({ status: next }).where(eq(countryResearchRuns.id, run.id));
  };

  const fail = async (error: unknown): Promise<IngestionReport> => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await db
      .update(countryResearchRuns)
      .set({ status: "failed", completedAt: new Date(), errorMessage, errorPhase: phase })
      .where(eq(countryResearchRuns.id, run.id));
    return {
      countryIso2: code,
      runId: run.id,
      status: "failed",
      queriesCount: 0,
      sourcesDiscovered: 0,
      sourcesUsed: 0,
      errorMessage,
      errorPhase: phase,
    };
  };

  try {
    const iso3 = staticIso3(code);
    const countryName = country.name;
    const queries = buildResearchQueries(code, countryName).slice(0, COUNTRY_RESEARCH_CONFIG.maxQueries);

    await setPhase("searching");
    let queryFailures = 0;
    const searchOutcomes = await mapWithConcurrency(queries, COUNTRY_RESEARCH_CONFIG.concurrency, async (query) => {
      try {
        const response = await tavilySearch(query.text, { maxResults: COUNTRY_RESEARCH_CONFIG.maxResultsPerQuery });
        return { query, results: response.results };
      } catch (error) {
        queryFailures++;
        console.error(`[country-research] query failed for ${code}: "${query.text}"`, error);
        return { query, results: [] as TavilySearchResult[] };
      }
    });

    // Keyed on a normalized URL (trailing slash / http-vs-https collapsed) so
    // the same page discovered via two different queries counts once.
    const discovered = new Map<string, DiscoveredSource>();
    for (const { query, results } of searchOutcomes) {
      for (const result of results) {
        const key = normalizeUrl(result.url);
        const existing = discovered.get(key);
        if (existing) {
          existing.factKeys = [...new Set([...existing.factKeys, ...query.factKeys])];
          continue;
        }
        discovered.set(key, {
          url: result.url,
          title: result.title,
          content: result.content,
          category: query.category,
          factKeys: query.factKeys,
          score: result.score,
        });
      }
    }

    if (discovered.size === 0) {
      throw new Error(
        queryFailures === queries.length
          ? "All research queries failed — Tavily was unreachable or misconfigured."
          : "Research queries ran but discovered zero sources.",
      );
    }

    await db
      .update(countryResearchRuns)
      .set({ queriesCount: queries.length, sourcesDiscovered: discovered.size })
      .where(eq(countryResearchRuns.id, run.id));

    const ranked = rankByAuthority([...discovered.values()], (s) => classifySourceAuthority(s.url, code));
    const chosen = ranked.slice(0, COUNTRY_RESEARCH_CONFIG.maxSourceDocs);

    await setPhase("extracting");
    const extractResult = await tavilyExtract(chosen.map((s) => s.url));
    const contentByUrl = new Map(extractResult.results.map((r) => [r.url, r.rawContent]));

    // Firecrawl is an optional fallback content fetcher — only invoked for
    // URLs Tavily's own extract() couldn't retrieve, and only if configured.
    // Skipping it (no key) just means those URLs fall back to their search
    // snippet below, same as before Firecrawl existed.
    let firecrawlRecovered = 0;
    const stillMissingUrls = extractResult.failedResults.map((f) => f.url);
    if (stillMissingUrls.length > 0 && isFirecrawlConfigured()) {
      const fc = await firecrawlExtract(stillMissingUrls);
      for (const r of fc.results) {
        contentByUrl.set(r.url, r.rawContent);
        firecrawlRecovered++;
      }
    }
    const extractFailures = stillMissingUrls.length - firecrawlRecovered;

    const sources: (ExtractionSource & { authority: ReturnType<typeof classifySourceAuthority> })[] = chosen
      .map((s) => ({
        url: s.url,
        title: s.title || null,
        category: s.category,
        // Prefer the fuller extracted page content (Tavily, then Firecrawl);
        // fall back to the search snippet rather than dropping the source.
        content: contentByUrl.get(s.url) ?? s.content,
        authority: classifySourceAuthority(s.url, code),
      }))
      .filter((s) => s.content.trim().length > 0);

    if (sources.length === 0) {
      throw new Error("No source content could be retrieved for any discovered URL.");
    }

    const extraction = await extractCountryProfile(countryName, sources);

    await setPhase("validating");
    const validUrls = new Set(sources.map((s) => s.url));
    const { profileFields, factLinks } = flattenExtraction(extraction, validUrls);

    const urlToSourceRow = new Map(chosen.map((s) => [s.url, s]));
    const [primaryCurrency] = await db.select().from(currencies).where(eq(currencies.countryCode, code)).limit(1);

    await db.transaction(async (tx) => {
      await tx
        .insert(countryProfiles)
        .values({
          iso2: code,
          iso3,
          countryName,
          currencyCode: primaryCurrency?.code ?? null,
          currencyName: primaryCurrency?.name ?? null,
          ...profileFields,
          lastResearchedAt: new Date(),
          lastVerifiedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: countryProfiles.iso2,
          set: {
            iso3,
            countryName,
            currencyCode: primaryCurrency?.code ?? null,
            currencyName: primaryCurrency?.name ?? null,
            ...profileFields,
            lastResearchedAt: new Date(),
            lastVerifiedAt: new Date(),
            updatedAt: new Date(),
          },
        });

      const sourceIdByUrl = new Map<string, string>();
      for (const source of chosen) {
        const row = urlToSourceRow.get(source.url);
        if (!row) continue;
        const [inserted] = await tx
          .insert(countrySources)
          .values({
            countryIso2: code,
            url: source.url,
            domain: domainFromUrl(source.url),
            title: source.title || null,
            category: row.category,
            sourceType: "other",
            authorityLevel: classifySourceAuthority(source.url, code),
            accessedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [countrySources.countryIso2, countrySources.url],
            set: { accessedAt: new Date(), isActive: true },
          })
          .returning({ id: countrySources.id });
        if (inserted) sourceIdByUrl.set(source.url, inserted.id);
      }

      await tx.delete(countryFactSources).where(eq(countryFactSources.countryIso2, code));
      const factRows = factLinks
        .map((link) => {
          const sourceId = sourceIdByUrl.get(link.url);
          return sourceId ? { countryIso2: code, factKey: link.factKey, sourceId } : null;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      if (factRows.length > 0) await tx.insert(countryFactSources).values(factRows);
    });

    const status: CountryResearchStatus = queryFailures > 0 || extractFailures > 0 ? "partial" : "completed";
    await db
      .update(countryResearchRuns)
      .set({
        status,
        completedAt: new Date(),
        sourcesUsed: sources.length,
        modelUsed: process.env.COUNTRY_RESEARCH_LLM_MODEL?.trim() || "gemini-3.1-pro-preview",
        usageMetadata: { queryFailures, extractFailures, firecrawlRecovered },
      })
      .where(eq(countryResearchRuns.id, run.id));
    options.onPhase?.({ phase: status });

    return {
      countryIso2: code,
      runId: run.id,
      status,
      queriesCount: queries.length,
      sourcesDiscovered: discovered.size,
      sourcesUsed: sources.length,
    };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Flattens the LLM's {value, sourceUrls}-wrapped extraction into flat
 * country_profiles columns plus a fact->source link list, dropping any
 * self-cited URL that wasn't actually among the sources fed to the model —
 * a citation-level hallucination check distinct from the fact-level one
 * (missing info is null, not invented; see extract.ts's system prompt).
 */
function flattenExtraction(
  extraction: CountryProfileExtraction,
  validUrls: Set<string>,
): { profileFields: Record<string, unknown>; factLinks: Array<{ factKey: CountryProfileFactKey; url: string }> } {
  const profileFields: Record<string, unknown> = {};
  const factLinks: Array<{ factKey: CountryProfileFactKey; url: string }> = [];

  for (const key of COUNTRY_PROFILE_FACT_KEYS) {
    const field = extraction[key];
    profileFields[key] = field.value;
    for (const url of field.sourceUrls) {
      if (validUrls.has(url)) factLinks.push({ factKey: key, url });
    }
  }

  return { profileFields, factLinks };
}
