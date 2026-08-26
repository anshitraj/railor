/**
 * Tavily client — search + content extraction. House style matches
 * adapters.ts: real fetch, AbortSignal.timeout, honest structured results,
 * no fake success. Verified against Tavily's live API reference directly
 * (docs.tavily.com/documentation/api-reference/endpoint/{search,extract}) —
 * not guessed from memory.
 *
 * search() and extract() are two independently-callable functions with plain
 * async signatures. That split is also the Firecrawl seam: a future
 * Firecrawl-backed content fetcher just needs to match extract()'s shape and
 * ingest.ts swaps which implementation it imports — no interface built ahead
 * of need.
 */
import { z } from "zod";
import { COUNTRY_RESEARCH_CONFIG } from "./config.js";

const TAVILY_BASE_URL = "https://api.tavily.com";

export class TavilyNotConfiguredError extends Error {
  constructor() {
    super("TAVILY_API_KEY is not set — country research cannot run without it.");
  }
}

export class TavilyRequestError extends Error {
  constructor(
    readonly status: number,
    readonly kind: "invalid_key" | "rate_limited" | "plan_limit" | "server_error" | "unknown",
    message: string,
  ) {
    super(message);
  }
}

function getApiKey(): string {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) throw new TavilyNotConfiguredError();
  return key;
}

/** Maps Tavily's documented status codes to an honest, specific error — never a generic "request failed". */
function classifyStatus(status: number, detail: string): TavilyRequestError {
  if (status === 401) return new TavilyRequestError(status, "invalid_key", `Tavily rejected the API key: ${detail}`);
  if (status === 429) return new TavilyRequestError(status, "rate_limited", `Tavily rate limit hit: ${detail}`);
  if (status === 432 || status === 433) {
    return new TavilyRequestError(status, "plan_limit", `Tavily plan/usage limit exceeded: ${detail}`);
  }
  if (status >= 500) return new TavilyRequestError(status, "server_error", `Tavily server error (${status}): ${detail}`);
  return new TavilyRequestError(status, "unknown", `Tavily request failed (${status}): ${detail}`);
}

/**
 * Only rate limits and server errors are worth retrying — an invalid key or a
 * malformed request never gets better on retry. tavilyFetch always wraps
 * network/timeout/JSON failures into TavilyRequestError before this runs, so
 * anything else here is unexpected and treated as non-retryable, not looped on.
 */
function isRetryable(error: unknown): boolean {
  return error instanceof TavilyRequestError && (error.kind === "rate_limited" || error.kind === "server_error");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Bounded exponential backoff — at most `maxRetries` attempts total, never infinite. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  const { maxRetries } = COUNTRY_RESEARCH_CONFIG;
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries || !isRetryable(error)) throw error;
      await sleep(2 ** attempt * 500);
    }
  }
  throw lastError;
}

async function tavilyFetch(path: string, body: Record<string, unknown>): Promise<unknown> {
  const key = getApiKey();
  return withRetry(async () => {
    let response: Response;
    try {
      response = await fetch(`${TAVILY_BASE_URL}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(COUNTRY_RESEARCH_CONFIG.tavilyTimeoutMs),
      });
    } catch (error) {
      throw new TavilyRequestError(0, "unknown", `Could not reach Tavily: ${(error as Error).message}`);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw classifyStatus(response.status, detail);
    }

    try {
      return await response.json();
    } catch {
      throw new TavilyRequestError(response.status, "unknown", "Tavily returned a response that wasn't valid JSON.");
    }
  });
}

/* -------------------------------------------------------------------------- */
/* search()                                                                    */
/* -------------------------------------------------------------------------- */

const SearchResponseSchema = z.object({
  query: z.string(),
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      content: z.string(),
      score: z.number(),
    }),
  ),
});

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface TavilySearchResponse {
  query: string;
  results: TavilySearchResult[];
}

export interface TavilySearchOptions {
  searchDepth?: "basic" | "advanced";
  maxResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
}

export async function tavilySearch(query: string, options: TavilySearchOptions = {}): Promise<TavilySearchResponse> {
  const raw = await tavilyFetch("/search", {
    query,
    search_depth: options.searchDepth ?? "advanced",
    max_results: options.maxResults ?? COUNTRY_RESEARCH_CONFIG.maxResultsPerQuery,
    include_domains: options.includeDomains,
    exclude_domains: options.excludeDomains,
  });

  const parsed = SearchResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new TavilyRequestError(200, "unknown", `Tavily search response didn't match the expected shape: ${parsed.error.message}`);
  }
  return parsed.data;
}

/* -------------------------------------------------------------------------- */
/* extract()                                                                   */
/* -------------------------------------------------------------------------- */

const ExtractResponseSchema = z.object({
  results: z.array(z.object({ url: z.string(), raw_content: z.string() })),
  failed_results: z.array(z.object({ url: z.string(), error: z.string() })).default([]),
});

export interface TavilyExtractedSource {
  url: string;
  rawContent: string;
}

export interface TavilyExtractFailure {
  url: string;
  error: string;
}

export interface TavilyExtractResponse {
  results: TavilyExtractedSource[];
  failedResults: TavilyExtractFailure[];
}

export interface TavilyExtractOptions {
  extractDepth?: "basic" | "advanced";
  format?: "markdown" | "text";
}

/** Empty `urls` returns an empty result without a network call — never a Tavily request for nothing. */
export async function tavilyExtract(urls: string[], options: TavilyExtractOptions = {}): Promise<TavilyExtractResponse> {
  if (urls.length === 0) return { results: [], failedResults: [] };

  const raw = await tavilyFetch("/extract", {
    urls,
    extract_depth: options.extractDepth ?? "basic",
    format: options.format ?? "text",
  });

  const parsed = ExtractResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new TavilyRequestError(200, "unknown", `Tavily extract response didn't match the expected shape: ${parsed.error.message}`);
  }
  return {
    results: parsed.data.results.map((r) => ({ url: r.url, rawContent: r.raw_content })),
    failedResults: parsed.data.failed_results.map((f) => ({ url: f.url, error: f.error })),
  };
}
