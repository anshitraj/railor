/**
 * fetch is stubbed globally — no real Tavily credits spent. Retry/backoff
 * config is overridden via env before the module is imported (module-load-
 * time env reads, same pattern engine.test.ts uses for PGLITE_DATA_DIR) so
 * the retry test doesn't take multiple real seconds.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.COUNTRY_RESEARCH_MAX_RETRIES = "2";

const { tavilySearch, tavilyExtract, TavilyNotConfiguredError, TavilyRequestError } = await import("../country-research/tavily.js");

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("tavilySearch", () => {
  beforeEach(() => {
    process.env.TAVILY_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws TavilyNotConfiguredError when the key is missing", async () => {
    delete process.env.TAVILY_API_KEY;
    await expect(tavilySearch("India central bank")).rejects.toBeInstanceOf(TavilyNotConfiguredError);
  });

  it("parses a valid 200 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ query: "q", results: [{ title: "RBI", url: "https://rbi.org.in/x", content: "...", score: 0.9 }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await tavilySearch("India central bank");
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.url).toBe("https://rbi.org.in/x");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({ authorization: "Bearer test-key" });
  });

  it("maps a 401 to a non-retried invalid_key error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad key", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(tavilySearch("x")).rejects.toMatchObject({ kind: "invalid_key" });
    expect(fetchMock).toHaveBeenCalledTimes(1); // not retried
  });

  it("retries a 429, and stops retrying once the cap is hit (never infinite)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(tavilySearch("x")).rejects.toMatchObject({ kind: "rate_limited" });
    // maxRetries=2 -> 3 total attempts (initial + 2 retries), not unbounded.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 10_000);

  it("rejects a response that doesn't match the expected shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ unexpected: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(tavilySearch("x")).rejects.toBeInstanceOf(TavilyRequestError);
  });

  it("wraps a network failure without crashing", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(tavilySearch("x")).rejects.toBeInstanceOf(TavilyRequestError);
  });

  it("rejects invalid JSON instead of throwing an unhandled parse error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("not json", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(tavilySearch("x")).rejects.toBeInstanceOf(TavilyRequestError);
  });
});

describe("tavilyExtract", () => {
  beforeEach(() => {
    process.env.TAVILY_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns empty results for an empty URL list without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await tavilyExtract([]);
    expect(result).toEqual({ results: [], failedResults: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps raw_content/failed_results to camelCase", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [{ url: "https://rbi.org.in/x", raw_content: "full text" }],
        failed_results: [{ url: "https://dead.example/y", error: "timeout" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await tavilyExtract(["https://rbi.org.in/x", "https://dead.example/y"]);
    expect(result.results).toEqual([{ url: "https://rbi.org.in/x", rawContent: "full text" }]);
    expect(result.failedResults).toEqual([{ url: "https://dead.example/y", error: "timeout" }]);
  });
});
