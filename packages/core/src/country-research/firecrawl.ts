/**
 * Firecrawl — optional fallback content fetcher, used only for URLs Tavily's
 * own extract() couldn't retrieve. Matches tavily.ts's house style: real
 * fetch, AbortSignal.timeout, honest structured results. Verified against
 * Firecrawl's live API reference directly (docs.firecrawl.dev), not guessed.
 *
 * Entirely optional: unconfigured (no FIRECRAWL_API_KEY) means ingest.ts
 * just skips this fallback and keeps whatever Tavily/the search snippet
 * already provided — never a hard failure for the whole pipeline.
 */
import { z } from "zod";
import { COUNTRY_RESEARCH_CONFIG } from "./config.js";

const FIRECRAWL_BASE_URL = "https://api.firecrawl.dev/v2";

export function isFirecrawlConfigured(): boolean {
  return Boolean(process.env.FIRECRAWL_API_KEY?.trim());
}

export class FirecrawlRequestError extends Error {
  constructor(
    readonly status: number,
    readonly kind: "invalid_key" | "payment_required" | "rate_limited" | "server_error" | "unknown",
    message: string,
  ) {
    super(message);
  }
}

function classifyStatus(status: number, detail: string): FirecrawlRequestError {
  if (status === 401 || status === 403) return new FirecrawlRequestError(status, "invalid_key", `Firecrawl rejected the API key: ${detail}`);
  if (status === 402) return new FirecrawlRequestError(status, "payment_required", `Firecrawl payment required: ${detail}`);
  if (status === 429) return new FirecrawlRequestError(status, "rate_limited", `Firecrawl rate limit hit: ${detail}`);
  if (status >= 500) return new FirecrawlRequestError(status, "server_error", `Firecrawl server error (${status}): ${detail}`);
  return new FirecrawlRequestError(status, "unknown", `Firecrawl request failed (${status}): ${detail}`);
}

const ScrapeResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      markdown: z.string().optional(),
      metadata: z.object({ title: z.union([z.string(), z.array(z.string())]).optional() }).optional(),
    })
    .optional(),
  error: z.string().optional(),
});

async function scrapeOne(url: string): Promise<{ url: string; rawContent: string; title: string | null }> {
  const key = process.env.FIRECRAWL_API_KEY!.trim();
  let response: Response;
  try {
    response = await fetch(`${FIRECRAWL_BASE_URL}/scrape`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ url, formats: ["markdown"] }),
      signal: AbortSignal.timeout(COUNTRY_RESEARCH_CONFIG.firecrawlTimeoutMs),
    });
  } catch (error) {
    throw new FirecrawlRequestError(0, "unknown", `Could not reach Firecrawl: ${(error as Error).message}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw classifyStatus(response.status, detail);
  }

  const raw = await response.json().catch(() => null);
  const parsed = ScrapeResponseSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.success || !parsed.data.data?.markdown) {
    throw new FirecrawlRequestError(200, "unknown", parsed.success ? (parsed.data.error ?? "Firecrawl returned no content") : "Firecrawl response didn't match the expected shape");
  }

  const title = parsed.data.data.metadata?.title;
  return {
    url,
    rawContent: parsed.data.data.markdown,
    title: Array.isArray(title) ? (title[0] ?? null) : (title ?? null),
  };
}

export interface FirecrawlResult {
  url: string;
  rawContent: string;
  title: string | null;
}

export interface FirecrawlFailure {
  url: string;
  error: string;
}

/** Scrapes each URL independently (bounded concurrency, per-URL try/catch) — one bad page never drops the rest. */
export async function firecrawlExtract(urls: string[]): Promise<{ results: FirecrawlResult[]; failedResults: FirecrawlFailure[] }> {
  if (urls.length === 0) return { results: [], failedResults: [] };

  const results: FirecrawlResult[] = [];
  const failedResults: FirecrawlFailure[] = [];
  const limit = COUNTRY_RESEARCH_CONFIG.concurrency;
  let cursor = 0;

  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor++]!;
      try {
        results.push(await scrapeOne(url));
      } catch (error) {
        failedResults.push({ url, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, urls.length) }, worker));

  return { results, failedResults };
}
