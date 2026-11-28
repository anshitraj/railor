import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PriceCheckInput } from "@railor/core";

vi.mock("server-only", () => ({}));
vi.stubEnv("DATABASE_URL", "");
vi.stubEnv("PGLITE_DATA_DIR", mkdtempSync(join(tmpdir(), "railor-calculator-warm-")));

const { ensureMigrated } = await import("@railor/database");
const { attemptProviderCalculator, loadPublicQuoteObservations, tinyFishApiKey, warmProviderCalculators } = await import("./public-quote-observations");

const input: PriceCheckInput = { sourceCurrency: "USD", destinationCurrency: "INR", destinationCountry: "IN", amount: 1000, includeMarket: true, context: { profile: "personal", country: "US", direction: "send", purpose: "personal" } };
const MID = 92.7;
const quote = (slug: string, rate: number, extra: Record<string, unknown> = {}) => ({
  availability: true, send_amount: 1000, send_currency: "USD", fee: 0, total_to_pay: 1000, rate, recipient_gets: Math.round(rate * 1000 * 100) / 100, receive_currency: "INR",
  funding_method: "ACH", payout_method: "Bank account", shown_line: `They receive ${(Math.round(rate * 1000 * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} INR`, promotional: false, ...extra,
});

/** A stand-in for the browser-agent API: every run finishes on its first poll with the report registered for its page. */
function agent(byHost: Record<string, unknown>) {
  const runs = new Map<string, unknown>();
  const calls: string[] = [];
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    calls.push(target);
    if (target.endsWith("/v1/automation/run-async")) {
      const { url: page } = JSON.parse(String(init?.body)) as { url: string };
      const id = `run_${runs.size + 1}`;
      runs.set(id, byHost[new URL(page).hostname.replace(/^www\./, "")] ?? { availability: false, error: "Unable to get rates. Please try again." });
      return Response.json({ run_id: id });
    }
    const id = target.split("/").pop()!;
    return Response.json({ run_id: id, status: "COMPLETED", result: runs.get(id) });
  });
  return { fetcher, calls };
}

describe("reading provider calculators for a price check", () => {
  // Alternate spellings and fallback scraper keys are cleared so developer .env values never leak into these tests.
  beforeEach(async () => {
    await ensureMigrated();
    vi.stubEnv("TINY_FISH_API_KEY", "");
    vi.stubEnv("TINYFISH_API_KEY", "test-key");
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    vi.stubEnv("PARALLEL_API_KEY", "");
    vi.stubEnv("TAVILY_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GOOGLE_API_KEY", "");
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.stubEnv("DATABASE_URL", ""); });

  it("explains why a calculator gave no price instead of leaving a blank", async () => {
    vi.stubGlobal("fetch", agent({}).fetcher);
    const attempt = await attemptProviderCalculator("ria", input, MID, 5_000);
    expect(attempt).toEqual({ row: null, reason: "Unable to get rates. Please try again." });
  });

  it("returns a checked live price for a provider with a calculator, and nothing without a key", async () => {
    vi.stubGlobal("fetch", agent({ "xe.com": quote("xe", 92.5614) }).fetcher);
    const attempt = await attemptProviderCalculator("xe", input, MID, 5_000);
    expect(attempt.row).toMatchObject({ providerSlug: "xe", recipientAmount: 92561.4, basis: "live_public" });
    vi.stubEnv("TINYFISH_API_KEY", "");
    expect(await attemptProviderCalculator("xe", input, MID, 5_000)).toEqual({ row: null, reason: null });
    expect(await attemptProviderCalculator("not-a-provider", input, MID, 5_000)).toEqual({ row: null, reason: null });
  });

  it("warms every missing provider once, keeps only the prices that pass, and serves them to the next price check", async () => {
    const { fetcher } = agent({
      "xe.com": quote("xe", 92.5614),
      "paysend.com": quote("paysend", 92.7153, { fee: 0 }),
      // A rate far from mid-market is an example left on a marketing page, not a live quote.
      "worldremit.com": quote("world-remit", 83.45),
    });
    vi.stubGlobal("fetch", fetcher);
    const present = new Set(["instarem", "western-union", "ria"]);
    await warmProviderCalculators(input, MID, present);
    const cached = await loadPublicQuoteObservations(input);
    expect(cached.map((row) => row.providerSlug).sort()).toEqual(["paysend", "xe"]);
    // The same transfer isn't looked up again for 15 minutes, whether or not it worked.
    const before = fetcher.mock.calls.length;
    await warmProviderCalculators(input, MID, present);
    expect(fetcher.mock.calls.length).toBe(before);
  });

  it("reads the key from either spelling of its name", async () => {
    vi.stubEnv("TINYFISH_API_KEY", "");
    vi.stubEnv("TINY_FISH_API_KEY", "  alt-key  ");
    expect(tinyFishApiKey()).toBe("alt-key");
    vi.stubEnv("TINYFISH_API_KEY", "primary-key");
    expect(tinyFishApiKey()).toBe("primary-key");
    vi.stubEnv("TINYFISH_API_KEY", "");
    vi.stubEnv("TINY_FISH_API_KEY", "");
    expect(tinyFishApiKey()).toBeUndefined();
    // With only the alternate spelling set, a calculator is really read.
    vi.stubEnv("TINY_FISH_API_KEY", "alt-key");
    vi.stubGlobal("fetch", agent({ "xe.com": quote("xe", 92.5614) }).fetcher);
    expect((await attemptProviderCalculator("xe", input, MID, 5_000)).row).toMatchObject({ providerSlug: "xe" });
  });

  it("does nothing without a key", async () => {
    vi.stubEnv("TINYFISH_API_KEY", "");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await warmProviderCalculators({ ...input, amount: 2500 }, MID, new Set());
    expect(fetcher).not.toHaveBeenCalled();
  });
});
