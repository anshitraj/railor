/**
 * ParallelBudget: real paid credit, so these tests mock the network layer
 * (same pattern country-ingest.test.ts uses for Tavily) — nothing here may
 * ever call the live Parallel API.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockParallelSearch = vi.fn();
const mockParallelExtract = vi.fn();
vi.mock("../country-research/parallel.js", () => ({
  parallelSearch: mockParallelSearch,
  parallelExtract: mockParallelExtract,
}));

const { ParallelBudget, ParallelBudgetExceededError, PARALLEL_COST_USD } = await import("../country-research/parallel-budget.js");

beforeEach(() => {
  mockParallelSearch.mockReset();
  mockParallelExtract.mockReset();
});

describe("ParallelBudget", () => {
  it("enforces maxSpend minus reserve as the real ceiling, not the raw max", () => {
    const budget = new ParallelBudget({ maxSpendUsd: 20, reserveUsd: 5 });
    expect(budget.ceilingUsd).toBe(15);
    expect(budget.remainingUsd).toBe(15);
  });

  it("charges the advanced-mode search rate and records a successful call", async () => {
    mockParallelSearch.mockResolvedValue({ searchId: "s1", results: [{ url: "https://x.example", title: "t", publishDate: null, excerpts: ["e"] }] });
    const budget = new ParallelBudget({ maxSpendUsd: 20, reserveUsd: 5 });

    await budget.search(["Germany USDC SEPA"], { mode: "advanced" }, { country: "DE", provider: "circle" });

    expect(budget.spentUsd).toBe(PARALLEL_COST_USD.search.advanced);
    const report = budget.toReport();
    expect(report.searches).toBe(1);
    expect(report.spendByCountry.DE).toBe(PARALLEL_COST_USD.search.advanced);
    expect(report.spendByProvider.circle).toBe(PARALLEL_COST_USD.search.advanced);
  });

  it("refuses to call Parallel at all once the estimated cost would breach the ceiling", async () => {
    const budget = new ParallelBudget({ maxSpendUsd: 0.002, reserveUsd: 0 });
    // First advanced search ($0.005) already exceeds a $0.002 ceiling.
    await expect(budget.search(["q"], { mode: "advanced" })).rejects.toThrow(ParallelBudgetExceededError);
    expect(mockParallelSearch).not.toHaveBeenCalled();
    expect(budget.spentUsd).toBe(0);
  });

  it("does not charge for a call that throws before Parallel returns a response", async () => {
    mockParallelSearch.mockRejectedValue(new Error("network down"));
    const budget = new ParallelBudget({ maxSpendUsd: 20, reserveUsd: 5 });

    await expect(budget.search(["q"])).rejects.toThrow("network down");
    expect(budget.spentUsd).toBe(0);
    const report = budget.toReport();
    expect(report.failedSearches).toBe(1);
  });

  it("scales extract cost with URL count and stops before an over-budget batch", async () => {
    const budget = new ParallelBudget({ maxSpendUsd: 0.01, reserveUsd: 0 });
    // 20 URLs * $0.001 = $0.02, over the $0.01 ceiling.
    const urls = Array.from({ length: 20 }, (_, i) => `https://provider.example/${i}`);
    await expect(budget.extract(urls, "find EUR SEPA support")).rejects.toThrow(ParallelBudgetExceededError);
    expect(mockParallelExtract).not.toHaveBeenCalled();
  });

  it("stays usable with no key configured — the underlying client throws, the budget just reports the failure", async () => {
    mockParallelSearch.mockRejectedValue(new Error("PARALLEL_API_KEY is not set."));
    const budget = new ParallelBudget({ maxSpendUsd: 20, reserveUsd: 5 });
    await expect(budget.search(["q"])).rejects.toThrow("PARALLEL_API_KEY is not set.");
    expect(budget.spentUsd).toBe(0);
  });
});
