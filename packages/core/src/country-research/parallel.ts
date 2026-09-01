/**
 * Parallel.ai — search + extract, same shape as tavily.ts on purpose (search()
 * returns short excerpts per URL; extract() returns full page content for a
 * known URL list). House style matches every other client in this directory:
 * real fetch, AbortSignal.timeout, honest structured results, no fake success.
 * Verified against Parallel's live API reference directly
 * (docs.parallel.ai/api-reference/{search-api/search,extract/extract}) — not
 * guessed. Parallel also ships an official `parallel-web` SDK, but every other
 * research client here is a plain fetch wrapper with zero extra dependencies,
 * so this one is too.
 *
 * This low-level client is intentionally used only by the durable
 * `PersistentParallelBudget` wrapper. Research runners must not call it
 * directly: the wrapper reserves and finalizes the paid request in the DB.
 */
import { z } from "zod";
import { COUNTRY_RESEARCH_CONFIG } from "./config.js";

const PARALLEL_BASE_URL = "https://api.parallel.ai";

export function isParallelConfigured(): boolean {
  return Boolean(process.env.PARALLEL_API_KEY?.trim());
}

export class ParallelNotConfiguredError extends Error {
  constructor() {
    super("PARALLEL_API_KEY is not set.");
  }
}

export class ParallelRequestError extends Error {
  constructor(
    readonly status: number,
    readonly kind: "invalid_key" | "rate_limited" | "server_error" | "unknown",
    message: string,
  ) {
    super(message);
  }
}

function getApiKey(): string {
  const key = process.env.PARALLEL_API_KEY?.trim();
  if (!key) throw new ParallelNotConfiguredError();
  return key;
}

/** Parallel's documented error codes aren't published per-status the way Tavily's are; this applies standard REST conventions rather than guessing Parallel-specific ones. */
function classifyStatus(status: number, detail: string): ParallelRequestError {
  if (status === 401 || status === 403) return new ParallelRequestError(status, "invalid_key", `Parallel rejected the API key: ${detail}`);
  if (status === 429) return new ParallelRequestError(status, "rate_limited", `Parallel rate limit hit: ${detail}`);
  if (status >= 500) return new ParallelRequestError(status, "server_error", `Parallel server error (${status}): ${detail}`);
  return new ParallelRequestError(status, "unknown", `Parallel request failed (${status}): ${detail}`);
}

async function parallelFetch(path: string, body: Record<string, unknown>): Promise<unknown> {
  const key = getApiKey();
  let response: Response;
  try {
    response = await fetch(`${PARALLEL_BASE_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(COUNTRY_RESEARCH_CONFIG.parallelTimeoutMs),
    });
  } catch (error) {
    throw new ParallelRequestError(0, "unknown", `Could not reach Parallel: ${(error as Error).message}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw classifyStatus(response.status, detail);
  }

  try {
    return await response.json();
  } catch {
    throw new ParallelRequestError(response.status, "unknown", "Parallel returned a response that wasn't valid JSON.");
  }
}

/* -------------------------------------------------------------------------- */
/* search()                                                                    */
/* -------------------------------------------------------------------------- */

const SearchResponseSchema = z.object({
  search_id: z.string(),
  results: z.array(
    z.object({
      url: z.string(),
      title: z.string().nullable(),
      publish_date: z.string().nullable(),
      excerpts: z.array(z.string()),
    }),
  ),
});

export interface ParallelSearchResult {
  url: string;
  title: string | null;
  publishDate: string | null;
  /** Short LLM-optimized snippets, not full page content — use extract() for that. */
  excerpts: string[];
}

export interface ParallelSearchResponse {
  searchId: string;
  results: ParallelSearchResult[];
}

export interface ParallelSearchOptions {
  objective?: string;
  mode?: "turbo" | "fast" | "basic" | "advanced";
  maxCharsTotal?: number;
}

/** `searchQueries` mirrors Tavily's single `query` as a list — Parallel's endpoint always takes an array, even for one term. */
export async function parallelSearch(searchQueries: string[], options: ParallelSearchOptions = {}): Promise<ParallelSearchResponse> {
  const raw = await parallelFetch("/v1/search", {
    search_queries: searchQueries,
    objective: options.objective ?? null,
    mode: options.mode,
    max_chars_total: options.maxCharsTotal,
  });

  const parsed = SearchResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ParallelRequestError(200, "unknown", `Parallel search response didn't match the expected shape: ${parsed.error.message}`);
  }
  return {
    searchId: parsed.data.search_id,
    results: parsed.data.results.map((r) => ({ url: r.url, title: r.title, publishDate: r.publish_date, excerpts: r.excerpts })),
  };
}

/* -------------------------------------------------------------------------- */
/* extract()                                                                   */
/* -------------------------------------------------------------------------- */

const ExtractResponseSchema = z.object({
  extract_id: z.string(),
  results: z.array(
    z.object({
      url: z.string(),
      title: z.string().nullable(),
      publish_date: z.string().nullable(),
      excerpts: z.array(z.string()),
      full_content: z.string().nullable(),
    }),
  ),
  errors: z.array(
    z.object({
      url: z.string(),
      error_type: z.string(),
      http_status_code: z.number().nullable(),
      content: z.string().nullable(),
    }),
  ),
});

export interface ParallelExtractedSource {
  url: string;
  title: string | null;
  /** Full page content, in the same rawContent slot tavily.ts/firecrawl.ts use, so callers can treat all three interchangeably. */
  rawContent: string;
}

export interface ParallelExtractFailure {
  url: string;
  error: string;
}

export interface ParallelExtractResponse {
  results: ParallelExtractedSource[];
  failedResults: ParallelExtractFailure[];
}

/** Empty `urls` returns an empty result without a network call. Parallel caps this endpoint at 20 URLs per call — callers must batch beyond that themselves. */
export async function parallelExtract(urls: string[], objective?: string): Promise<ParallelExtractResponse> {
  if (urls.length === 0) return { results: [], failedResults: [] };
  if (urls.length > 20) {
    throw new Error(`parallelExtract: Parallel's /v1/extract accepts at most 20 URLs per call, got ${urls.length}. Batch the caller instead of raising this limit.`);
  }

  const raw = await parallelFetch("/v1/extract", { urls, objective: objective ?? null });

  const parsed = ExtractResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ParallelRequestError(200, "unknown", `Parallel extract response didn't match the expected shape: ${parsed.error.message}`);
  }
  // full_content is null when Parallel could only retrieve excerpts (e.g. a
  // paywalled or JS-heavy page); that's a partial success, not an error, and
  // falling back to the joined excerpts keeps the caller's contract simple —
  // a genuinely empty string here would look identical to "found nothing".
  return {
    results: parsed.data.results.map((r) => ({ url: r.url, title: r.title, rawContent: r.full_content ?? r.excerpts.join("\n\n") })),
    failedResults: parsed.data.errors.map((e) => ({ url: e.url, error: `${e.error_type}${e.http_status_code ? ` (HTTP ${e.http_status_code})` : ""}` })),
  };
}
