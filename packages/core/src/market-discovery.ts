/**
 * Bounded, request-time market discovery for corridors the durable catalog
 * cannot yet confirm. Tavily/Parallel find current pages; Gemini structures
 * only claims carrying a verbatim excerpt from those pages. The output stays
 * visibly `research_required` and never enters eligibility, policy decisions,
 * or execution until the normal reviewed ingestion path publishes it.
 */
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { CorridorQuery, MarketDiscoveryCandidate, MarketDiscoveryResult } from "@railor/types";
import { COUNTRY_TERMS } from "./vocab.js";
import { tavilyExtract, tavilySearch } from "./country-research/tavily.js";
import { isParallelConfigured } from "./country-research/parallel.js";
import { PersistentParallelBudget } from "./country-research/parallel-ledger.js";

const CACHE_TTL_MS = 60 * 60 * 1_000;
const MAX_SOURCES = 8;
const MAX_SOURCE_CHARS = 4_000;

export interface DiscoverySourceInput {
  title: string;
  url: string;
  publishedAt: string | null;
  content: string;
}

const ExtractedCandidate = z.object({
  name: z.string().min(1).max(120),
  category: z.enum(["provider", "payment_rail", "bank", "network", "platform"]),
  routeSummary: z.string().min(1).max(500),
  pricingSummary: z.string().max(500).nullable().default(null),
  feePercent: z.number().nonnegative().max(100).nullable().default(null),
  speedSummary: z.string().max(300).nullable().default(null),
  whyConsider: z.array(z.string().max(300)).max(4).default([]),
  limitations: z.array(z.string().max(300)).max(4).default([]),
  evidence: z.array(z.object({ sourceId: z.number().int().nonnegative(), quote: z.string().min(8).max(700) })).min(1).max(4),
});

const ExtractedPayload = z.object({ candidates: z.array(ExtractedCandidate).max(8).default([]) });

export interface MarketDiscoveryDependencies {
  search?: (query: string) => Promise<DiscoverySourceInput[]>;
  parallelSearch?: (queries: string[]) => Promise<DiscoverySourceInput[]>;
  generate?: (prompt: string) => Promise<unknown>;
  now?: () => Date;
}

function countryName(code: string | undefined): string | undefined {
  return code ? COUNTRY_TERMS.find((country) => country.code === code)?.name ?? code : undefined;
}

function currencyCountry(currency: string | undefined): string | undefined {
  return currency ? COUNTRY_TERMS.find((country) => country.defaultCurrency === currency)?.name : undefined;
}

export function buildMarketDiscoveryQueries(query: CorridorQuery): string[] {
  const year = new Date().getUTCFullYear();
  const source = query.sourceCurrency ?? query.sourceAsset ?? countryName(query.sourceCountry) ?? "cross-border";
  const destination = query.destinationCurrency ?? countryName(query.destinationCountry) ?? "payout";
  const destinationCountry = countryName(query.destinationCountry);
  const sourceCountry = query.sourceCountry ? countryName(query.sourceCountry) : currencyCountry(query.sourceCurrency);
  const localRailHints = sourceCountry === "India" && destinationCountry === "United Arab Emirates"
    ? "UPI Aani NPCI JPMorgan"
    : "local instant payment rail";
  const amount = query.amount ? ` ${query.amount} ${query.amountCurrency ?? source}` : "";
  return [
    `${source} to ${destination} ${destinationCountry ?? ""} business payment provider fees settlement${amount}`.trim(),
    `${source} ${destination} cross-border payment rail pricing FX markup API`,
    `new ${sourceCountry ?? ""} ${destinationCountry ?? ""} ${source} to ${destination} ${localRailHints} launch partnership ${year}`.trim(),
  ];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9%₹$€£.]+/g, " ").replace(/\s+/g, " ").trim();
}

function quoteAppearsInSource(quote: string, source: DiscoverySourceInput): boolean {
  const needle = normalize(quote);
  const haystack = normalize(source.content);
  return needle.length >= 8 && haystack.includes(needle);
}

function explicitPercentageInQuote(percent: number, quotes: string[]): boolean {
  const variants = [String(percent), percent.toFixed(1), percent.toFixed(2)].map((value) => value.replace(/\.0+$/, ""));
  return quotes.some((quote) => {
    const lower = quote.toLowerCase();
    const hasFeeContext = /(fee|cost|charge|markup|margin|spread|commission)/.test(lower);
    return hasFeeContext && variants.some((value) => new RegExp(`${value.replace(".", "\\.")}\\s*(?:%|percent)`, "i").test(lower));
  });
}

function structuredClaimSupported(summary: string | null, quotes: string[], contextWords: RegExp): string | null {
  if (!summary) return null;
  const combined = normalize(quotes.join(" "));
  if (!contextWords.test(combined)) return null;
  const numbers = normalize(summary).match(/\d+(?:\.\d+)?/g) ?? [];
  return numbers.every((number) => combined.includes(number)) ? summary : null;
}

function groundedReasons(reasons: string[], quotes: string[]): string[] {
  const stop = new Set(["that", "this", "with", "from", "into", "their", "through", "supports", "enables", "offers", "provides"]);
  const sourceWords = new Set(normalize(quotes.join(" ")).split(" ").filter((word) => word.length >= 4));
  return reasons.filter((reason) => {
    const words = normalize(reason).split(" ").filter((word) => word.length >= 4 && !stop.has(word));
    if (!words.length) return false;
    const matches = words.filter((word) => sourceWords.has(word)).length;
    return matches >= 2 && matches / words.length >= 0.25;
  });
}

export function validateMarketCandidates(raw: unknown, sources: DiscoverySourceInput[]): MarketDiscoveryCandidate[] {
  const parsed = ExtractedPayload.safeParse(raw);
  if (!parsed.success) return [];

  const candidates: MarketDiscoveryCandidate[] = [];
  for (const item of parsed.data.candidates) {
    const validEvidence = item.evidence.filter((evidence) => {
      const source = sources[evidence.sourceId];
      return Boolean(source && quoteAppearsInSource(evidence.quote, source));
    });
    if (!validEvidence.length) continue;

    const uniqueEvidence = validEvidence.filter(
      (evidence, index, all) => all.findIndex((candidate) => candidate.sourceId === evidence.sourceId) === index,
    );
    const quotes = validEvidence.map((evidence) => evidence.quote);
    const feePercent = item.feePercent !== null && explicitPercentageInQuote(item.feePercent, quotes)
      ? item.feePercent
      : null;
    const evidenceSources = uniqueEvidence.map((evidence) => {
      const source = sources[evidence.sourceId]!;
      return {
        title: source.title,
        url: source.url,
        publishedAt: source.publishedAt,
        excerpt: evidence.quote,
      };
    });
    const confidence = Math.min(0.85, Math.round((0.5 + evidenceSources.length * 0.1) * 100) / 100);
    const pricingSummary = structuredClaimSupported(item.pricingSummary, quotes, /(fee|cost|charge|markup|margin|spread|commission|rate)/);
    const speedSummary = structuredClaimSupported(item.speedSummary, quotes, /(instant|second|minute|hour|day|settle|arrival|real time)/);

    candidates.push({
      name: item.name,
      category: item.category,
      routeSummary: item.routeSummary,
      pricingSummary,
      feePercent,
      speedSummary,
      whyConsider: groundedReasons(item.whyConsider, quotes),
      limitations: [
        ...item.limitations,
        "Fresh web discovery only; Railor has not yet promoted this claim into the verified route catalog.",
      ],
      confidence,
      status: "research_required",
      sources: evidenceSources,
    });
  }

  const deduped = candidates.filter(
    (candidate, index, all) => all.findIndex((other) => other.name.toLowerCase() === candidate.name.toLowerCase()) === index,
  );
  const perSource = new Map<string, number>();
  return deduped.filter((candidate) => {
    const primary = candidate.sources[0]!.url;
    const count = perSource.get(primary) ?? 0;
    if (count >= 2) return false;
    perSource.set(primary, count + 1);
    return true;
  }).slice(0, 6);
}

async function defaultSearch(searchQuery: string): Promise<DiscoverySourceInput[]> {
  const response = await tavilySearch(searchQuery, { searchDepth: "advanced", maxResults: 5 });
  return response.results.map((result) => ({
    title: result.title,
    url: result.url,
    publishedAt: null,
    content: result.content,
  }));
}

async function defaultParallelSearch(queries: string[]): Promise<DiscoverySourceInput[]> {
  if (!isParallelConfigured()) return [];
  const budget = new PersistentParallelBudget({
    scopeKey: process.env.MARKET_DISCOVERY_PARALLEL_SCOPE?.trim() || "market-discovery",
  });
  const response = await budget.search(queries, {
    mode: "fast",
    objective: "Find current provider, payment-rail, pricing, route-availability, settlement-speed, and launch evidence for this exact cross-border corridor.",
    maxCharsTotal: 18_000,
  });
  return response.results.map((result) => ({
    title: result.title ?? result.url,
    url: result.url,
    publishedAt: result.publishDate,
    content: result.excerpts.join("\n\n"),
  }));
}

async function hydrateTopSources(sources: DiscoverySourceInput[]): Promise<DiscoverySourceInput[]> {
  const selected = sources.slice(0, MAX_SOURCES);
  if (!selected.length) return [];
  try {
    const extracted = await tavilyExtract(selected.map((source) => source.url), { extractDepth: "basic", format: "text" });
    const contentByUrl = new Map(extracted.results.map((result) => [result.url, result.rawContent]));
    return selected.map((source) => ({
      ...source,
      // Keep Tavily's query-relevant excerpt first. Full pages often place the
      // matching pricing/route paragraph well beyond the first few thousand
      // characters; replacing the excerpt with a prefix of the page made the
      // exact sentence that justified discovery disappear before extraction.
      content: `${source.content}\n\n${contentByUrl.get(source.url) || ""}`.slice(0, MAX_SOURCE_CHARS),
    }));
  } catch {
    return selected.map((source) => ({ ...source, content: source.content.slice(0, MAX_SOURCE_CHARS) }));
  }
}

async function defaultGenerate(prompt: string): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 45_000 } });
  const response = await ai.models.generateContent({
    model: process.env.MARKET_DISCOVERY_LLM_MODEL?.trim() || process.env.RAILOR_LLM_MODEL?.trim() || "gemini-flash-latest",
    contents: prompt,
    config: { responseMimeType: "application/json", temperature: 0 },
  });
  return response.text ? JSON.parse(response.text) : { candidates: [] };
}

function buildPrompt(query: CorridorQuery, sources: DiscoverySourceInput[]): string {
  const sourceCurrency = query.sourceCurrency ?? query.sourceAsset ?? "unspecified source";
  const destinationCurrency = query.destinationCurrency ?? "unspecified destination currency";
  const route = `${sourceCurrency} to ${destinationCurrency}${query.destinationCountry ? ` in ${countryName(query.destinationCountry)}` : ""}`;
  const documents = sources.map((source, sourceId) => ({ sourceId, ...source }));
  return `You are extracting current payment-market leads for Railor. The requested direction is ${route}.

Return JSON with one key, "candidates", containing at most 8 objects with:
- name: provider, bank, network, platform, or specifically named payment rail
- category: one of provider, payment_rail, bank, network, platform
- routeSummary: what the source explicitly says is usable for this direction
- pricingSummary: explicit price/fee/FX statement, or null
- feePercent: numeric percentage only when the cited words explicitly describe a fee, cost, markup, margin, spread, or commission; otherwise null
- speedSummary: explicit settlement/speed statement, or null
- whyConsider: up to 4 source-backed advantages
- limitations: up to 4 missing facts or scope restrictions
- evidence: 1-4 objects with sourceId and an exact verbatim quote copied from that source's content

Strict rules:
1. Do not infer that a reverse-direction route works.
2. Do not turn market share, savings, growth, or success rate percentages into fees.
3. Do not call a partnership or announced pilot generally available unless the source explicitly says it is live/available.
4. Do not invent prices, supported countries, API access, execution capability, or provider names.
5. Omit a candidate if none of the supplied text explicitly supports its relevance to this corridor.
6. Keep claims conservative; conflicting claims belong in limitations.
7. Prefer source diversity. Return at most two candidates that rely on the same source URL.

Sources:
${JSON.stringify(documents)}`;
}

function recommendationFor(candidates: MarketDiscoveryCandidate[]): MarketDiscoveryResult["recommendation"] {
  // A transfer fee, an FX spread and a promotional discount are not the
  // same price. Without a normalized all-in quote, do not rank percentages.
  const bestEvidenced = [...candidates].sort((a, b) => b.sources.length - a.sources.length || b.confidence - a.confidence)[0];
  return bestEvidenced
    ? {
        candidateName: bestEvidenced.name,
        label: "Fresh lead to verify",
        rationale: `${bestEvidenced.name} is a current source-backed lead for this corridor. Pricing was not sufficiently comparable to call it the cheapest or best rail.`,
        basis: "best_evidenced",
      }
    : null;
}

export async function discoverMarket(
  query: CorridorQuery,
  dependencies: MarketDiscoveryDependencies = {},
): Promise<MarketDiscoveryResult> {
  const now = (dependencies.now ?? (() => new Date()))();
  const generatedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + CACHE_TTL_MS).toISOString();
  const queries = buildMarketDiscoveryQueries(query);
  const search = dependencies.search ?? defaultSearch;
  const parallelSearch = dependencies.parallelSearch ?? defaultParallelSearch;
  const generate = dependencies.generate ?? defaultGenerate;
  const warnings: string[] = [
    "Discovery results are research leads, not verified route support or executable quotes.",
    "Confirm the final amount and availability through the provider or a connected Railor Connector before moving money.",
  ];

  const settled = await Promise.allSettled(queries.map((searchQuery) => search(searchQuery)));
  const sourceGroups = settled.map((outcome) => outcome.status === "fulfilled" ? outcome.value : []);
  // Interleave result sets so the general pricing query cannot crowd the
  // new-launch query out of the fixed evidence budget.
  let sources: DiscoverySourceInput[] = [];
  for (let index = 0; index < Math.max(0, ...sourceGroups.map((group) => group.length)); index++) {
    for (const group of sourceGroups) {
      const source = group[index];
      if (source) sources.push(source);
    }
  }
  if (settled.some((outcome) => outcome.status === "rejected")) warnings.push("At least one live search query failed; results may be incomplete.");

  if (sources.length < 4) {
    try {
      sources.push(...await parallelSearch(queries));
    } catch {
      warnings.push("Parallel fallback was unavailable; Tavily results were used on their own.");
    }
  }
  sources = sources.filter(
    (source, index, all) => /^https?:\/\//.test(source.url) && all.findIndex((candidate) => candidate.url === source.url) === index,
  );
  sources = dependencies.search ? sources.slice(0, MAX_SOURCES) : await hydrateTopSources(sources);

  if (!sources.length) {
    return { status: "unavailable", triggerReason: "Verified catalog coverage was weak and live discovery returned no usable sources.", generatedAt, expiresAt, candidates: [], recommendation: null, warnings };
  }

  try {
    const extracted = await generate(buildPrompt(query, sources));
    const candidates = validateMarketCandidates(extracted, sources);
    return {
      status: settled.some((outcome) => outcome.status === "rejected") ? "partial" : "complete",
      triggerReason: "The stored catalog had no confirmed route, so Railor checked current web evidence.",
      generatedAt,
      expiresAt,
      candidates,
      recommendation: recommendationFor(candidates),
      warnings,
    };
  } catch (error) {
    return {
      status: "partial",
      triggerReason: "Fresh sources were found, but Railor could not safely structure them into comparable candidates.",
      generatedAt,
      expiresAt,
      candidates: [],
      recommendation: null,
      warnings: [...warnings, "Discovery extraction failed. Please retry later."],
    };
  }
}
