/**
 * Hard spend ceiling for Parallel.ai calls. Real paid credit, not a demo
 * quota — every call this session makes goes through here first.
 *
 * Per-call costs are read from parallel.ai/pricing (verified live 2026-08-28,
 * not guessed): Search is billed per call at $1 or $5 per 1,000 requests
 * depending on mode (turbo/fast vs basic/advanced), assuming the default
 * ≤10-result page — this module deliberately never requests more than that,
 * so the "additional results" surcharge never applies and the estimate stays
 * exact rather than approximate. Extract is $1 per 1,000 URLs extracted.
 * Task API tiers are listed for completeness even though nothing in this
 * pass calls it — deep tasks are reserved for genuinely ambiguous gaps, and
 * at $0.005–$2.40 *per call* depending on tier, one mis-scoped batch of deep
 * tasks could exhaust the entire budget in minutes.
 *
 * A failed call (network error, invalid key — thrown before Parallel
 * returned a response) is not charged. A call that reached Parallel and came
 * back with zero results still is: Parallel did the work either way.
 */
import { writeFileSync } from "node:fs";
import { parallelExtract, parallelSearch, type ParallelExtractResponse, type ParallelSearchOptions, type ParallelSearchResponse } from "./parallel.js";

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** $ per call, verified against parallel.ai/pricing — search modes billed per request, not per result, below the 10-result default page. */
export const PARALLEL_COST_USD = {
  search: { turbo: 0.001, fast: 0.001, basic: 0.005, advanced: 0.005 },
  extractPerUrl: 0.001,
  /** Unused this pass unless a gap genuinely needs deep research — see the module doc comment. */
  task: { lite: 0.005, base: 0.01, core: 0.025, core2x: 0.05, pro: 0.1, ultra: 0.3, ultra2x: 0.6, ultra4x: 1.2, ultra8x: 2.4 },
} as const;

export interface ParallelUsageEntry {
  timestamp: string;
  operationType: "search" | "extract" | "task";
  mode: string;
  country: string | null;
  provider: string | null;
  requestCount: number;
  estimatedCostUsd: number;
  success: boolean;
  /** e.g. "4 results" on success, the thrown error's message on failure. */
  summary: string;
}

export class ParallelBudgetExceededError extends Error {
  constructor(readonly requested: number, readonly remaining: number) {
    super(`Parallel budget would be exceeded: requested $${requested.toFixed(4)}, only $${remaining.toFixed(4)} remains before the reserve.`);
  }
}

/**
 * `maxSpendUsd` is the account-level cap; `reserveUsd` is held back so a
 * research pass never spends the account down to zero — the ceiling this
 * class actually enforces is `maxSpendUsd - reserveUsd`.
 */
/**
 * @deprecated Test-only/in-process helper retained for existing unit tests.
 * Production research must use PersistentParallelBudget, which has a durable
 * pre-request reservation and cannot reset spend on process restart.
 */
export class ParallelBudget {
  readonly maxSpendUsd: number;
  readonly reserveUsd: number;
  private spent = 0;
  private entries: ParallelUsageEntry[] = [];

  constructor(options?: { maxSpendUsd?: number; reserveUsd?: number }) {
    this.maxSpendUsd = options?.maxSpendUsd ?? envFloat("PARALLEL_MAX_SPEND_USD", 20);
    this.reserveUsd = options?.reserveUsd ?? envFloat("PARALLEL_RESERVE_USD", 5);
  }

  get ceilingUsd(): number {
    return Math.max(0, this.maxSpendUsd - this.reserveUsd);
  }
  get spentUsd(): number {
    return this.spent;
  }
  get remainingUsd(): number {
    return Math.max(0, this.ceilingUsd - this.spent);
  }
  canAfford(estimatedCostUsd: number): boolean {
    return this.spent + estimatedCostUsd <= this.ceilingUsd;
  }

  private record(entry: Omit<ParallelUsageEntry, "timestamp">): void {
    if (entry.success) this.spent += entry.estimatedCostUsd;
    this.entries.push({ ...entry, timestamp: new Date().toISOString() });
  }

  /** Guarded search: throws ParallelBudgetExceededError *before* calling Parallel if the estimated cost would breach the ceiling. */
  async search(
    searchQueries: string[],
    options: ParallelSearchOptions & { mode?: keyof typeof PARALLEL_COST_USD.search } = {},
    context: { country?: string | null; provider?: string | null } = {},
  ): Promise<ParallelSearchResponse> {
    const mode = options.mode ?? "advanced";
    const cost = PARALLEL_COST_USD.search[mode];
    if (!this.canAfford(cost)) throw new ParallelBudgetExceededError(cost, this.remainingUsd);

    try {
      const result = await parallelSearch(searchQueries, options);
      this.record({
        operationType: "search", mode, country: context.country ?? null, provider: context.provider ?? null,
        requestCount: searchQueries.length, estimatedCostUsd: cost, success: true,
        summary: `${result.results.length} result(s) for [${searchQueries.join(" | ")}]`,
      });
      return result;
    } catch (error) {
      this.record({
        operationType: "search", mode, country: context.country ?? null, provider: context.provider ?? null,
        requestCount: searchQueries.length, estimatedCostUsd: cost, success: false,
        summary: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /** Guarded extract: cost scales with URL count (max 20 per Parallel's own limit), charged only on a returned response. */
  async extract(
    urls: string[],
    objective: string | undefined,
    context: { country?: string | null; provider?: string | null } = {},
  ): Promise<ParallelExtractResponse> {
    const cost = urls.length * PARALLEL_COST_USD.extractPerUrl;
    if (!this.canAfford(cost)) throw new ParallelBudgetExceededError(cost, this.remainingUsd);

    try {
      const result = await parallelExtract(urls, objective);
      this.record({
        operationType: "extract", mode: "extract", country: context.country ?? null, provider: context.provider ?? null,
        requestCount: urls.length, estimatedCostUsd: cost, success: true,
        summary: `${result.results.length} extracted, ${result.failedResults.length} failed`,
      });
      return result;
    } catch (error) {
      this.record({
        operationType: "extract", mode: "extract", country: context.country ?? null, provider: context.provider ?? null,
        requestCount: urls.length, estimatedCostUsd: cost, success: false,
        summary: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  toReport() {
    const byCountry: Record<string, number> = {};
    const byProvider: Record<string, number> = {};
    const byOperation: Record<string, number> = {};
    let successfulEvidenceDiscoveries = 0;
    let failedSearches = 0;
    for (const e of this.entries) {
      if (e.country) byCountry[e.country] = (byCountry[e.country] ?? 0) + e.estimatedCostUsd;
      if (e.provider) byProvider[e.provider] = (byProvider[e.provider] ?? 0) + e.estimatedCostUsd;
      byOperation[e.operationType] = (byOperation[e.operationType] ?? 0) + e.estimatedCostUsd;
      if (e.success && e.operationType !== "search") successfulEvidenceDiscoveries++;
      if (!e.success && e.operationType === "search") failedSearches++;
    }
    return {
      generatedAt: new Date().toISOString(),
      maxSpendUsd: this.maxSpendUsd,
      reserveUsd: this.reserveUsd,
      ceilingUsd: this.ceilingUsd,
      spentUsd: Math.round(this.spent * 10_000) / 10_000,
      remainingUsd: Math.round(this.remainingUsd * 10_000) / 10_000,
      totalRequests: this.entries.length,
      searches: this.entries.filter((e) => e.operationType === "search").length,
      extractions: this.entries.filter((e) => e.operationType === "extract").length,
      deepTasks: this.entries.filter((e) => e.operationType === "task").length,
      successfulEvidenceDiscoveries,
      failedSearches,
      spendByCountry: byCountry,
      spendByProvider: byProvider,
      spendByOperationType: byOperation,
      entries: this.entries,
    };
  }

  writeReport(path: string): void {
    writeFileSync(path, JSON.stringify(this.toReport(), null, 2));
  }
}
