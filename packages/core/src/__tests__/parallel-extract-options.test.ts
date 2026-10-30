import { afterEach, describe, expect, it, vi } from "vitest";
import { parallelExtract } from "../country-research/parallel.js";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("Parallel extract freshness policy", () => {
  function mock() {
    vi.stubEnv("PARALLEL_API_KEY", "test-key");
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ extract_id: "test", results: [], errors: [] })));
    vi.stubGlobal("fetch", fetcher); return fetcher;
  }
  it("requests a maximum cache age of 24 hours without stale fallback", async () => {
    const fetcher = mock(); await parallelExtract(["https://provider.example/pricing"], "fees", { maxAgeSeconds: 86400 });
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string).advanced_settings).toEqual({ fetch_policy: { max_age_seconds: 86400, disable_cache_fallback: true } });
  });
  it("preserves the existing request when no freshness policy is supplied", async () => {
    const fetcher = mock(); await parallelExtract(["https://provider.example/pricing"]);
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({ urls: ["https://provider.example/pricing"], objective: null });
  });
  it("rejects invalid policy values before making a paid request", async () => {
    const fetcher = mock();
    for (const maxAgeSeconds of [0, 599, 1000.5, Infinity]) await expect(parallelExtract(["https://provider.example"], undefined, { maxAgeSeconds })).rejects.toThrow("at least 600");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
