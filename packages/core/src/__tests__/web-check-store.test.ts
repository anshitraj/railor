import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { WebCheckClaim, WebCheckModel } from "../web-check.js";

const dataDir = mkdtempSync(join(tmpdir(), "railor-web-check-test-"));
process.env.PGLITE_DATA_DIR = dataDir;
process.env.DATABASE_URL = "";

const { getDbHandle, ensureMigrated } = await import("@railor/database");
const { priceWebChecks, recentWebChecks, resetWebCheckState, waitForWebChecks } = await import("../web-check-store.js");

beforeAll(async () => {
  await ensureMigrated();
}, 60_000);

afterAll(async () => {
  const { close } = await getDbHandle();
  await close();
  rmSync(dataDir, { recursive: true, force: true });
});

const claim = (n: number): WebCheckClaim => ({ key: `corridor:wise:${n}`, kind: "corridor", providerSlug: "wise", providerName: "Wise", domain: "wise.com", statement: `Wise lets a customer pay in US Dollar (USD) and have Indian Rupee (INR) paid into a bank account in India (${n}).` });
const page = { url: "https://wise.com/help/inr", title: "Guide to INR transfers | Wise", text: "You can send INR to someone’s bank account in India, including NRE and NRO accounts, or UPI ID." };
const working = (): WebCheckModel => ({
  name: "test-model",
  search: vi.fn(async () => ({ queries: ["q"], citations: [{ uri: page.url, title: "wise.com" }] })),
  judge: vi.fn(async () => ({ verdict: "supported" as const, sourceId: 1, quote: "You can send INR to someone's bank account in India, including NRE and NRO accounts, or UPI ID." })),
});
const settle = () => new Promise((r) => setTimeout(r, 50));

describe("web check store", () => {
  it("never waits for Google: queues once, then serves the stored verdict", async () => {
    resetWebCheckState();
    const model = working();
    const deps = { model, fetchSource: async () => page };
    const first = await priceWebChecks([claim(1)], deps);
    expect(first.results).toHaveLength(0);
    expect(first.pending.has(claim(1).key)).toBe(true);
    // A second poll while it runs does not start a second check.
    await priceWebChecks([claim(1)], deps);
    await settle();
    expect(model.search).toHaveBeenCalledOnce();
    expect((await priceWebChecks([claim(1)], deps)).results[0]).toMatchObject({ verdict: "supported", official: true });
    // After a restart (memory gone) the table still has it.
    resetWebCheckState();
    expect((await priceWebChecks([claim(1)], deps)).results[0]?.verdict).toBe("supported");
    expect(model.search).toHaveBeenCalledOnce();
    expect((await recentWebChecks(5)).some((r) => r.key === claim(1).key)).toBe(true);
  });

  it("pauses on a billing or quota error instead of caching a failure for every claim", async () => {
    resetWebCheckState();
    const broke: WebCheckModel = { ...working(), search: vi.fn(async () => { throw new Error('{"error":{"code":402,"message":"Your prepayment credits are depleted.","status":"RESOURCE_EXHAUSTED"}}'); }) };
    await priceWebChecks([claim(2), claim(3)], { model: broke, fetchSource: async () => page });
    await settle();
    const after = await priceWebChecks([claim(2), claim(3)], { model: broke, fetchSource: async () => page });
    expect(after).toMatchObject({ paused: true, results: [] });
    expect(after.pending.size).toBe(0);
    expect((broke.search as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("caches an ordinary failure briefly so a broken page isn't re-fetched every poll", async () => {
    resetWebCheckState();
    const flaky: WebCheckModel = { ...working(), judge: vi.fn(async () => { throw new Error("socket hang up"); }) };
    await priceWebChecks([claim(4)], { model: flaky, fetchSource: async () => page });
    await settle();
    const after = await priceWebChecks([claim(4)], { model: flaky, fetchSource: async () => page });
    expect(after.results[0]).toMatchObject({ verdict: "unclear" });
    expect(after.results[0]!.note).toContain("Check failed");
    expect(after.pending.size).toBe(0);
  });

  it("reports unconfigured instead of queueing", async () => {
    resetWebCheckState();
    const result = await priceWebChecks([claim(5)], { model: null });
    expect(result).toMatchObject({ configured: false, paused: false });
    expect(result.pending.size).toBe(0);
  });

  it("retains its daily budget across a simulated serverless restart", async () => {
    const { getDb, rateLimitBuckets } = await import("@railor/database");
    const { eq } = await import("drizzle-orm");
    await (await getDb()).delete(rateLimitBuckets).where(eq(rateLimitBuckets.key, "web-check-global"));
    vi.stubEnv("RAILOR_WEB_CHECK_DAILY_LIMIT", "1");
    try {
      resetWebCheckState();
      const model = working();
      const deps = { model, fetchSource: async () => page };
      await priceWebChecks([claim(100)], deps);
      await waitForWebChecks();
      expect(model.search).toHaveBeenCalledOnce();
      resetWebCheckState(); // another process has no in-memory budget history
      await priceWebChecks([claim(101)], deps);
      await waitForWebChecks();
      expect(model.search).toHaveBeenCalledOnce();
      expect((await priceWebChecks([claim(101)], deps)).paused).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
