/**
 * Engine tests run against a throwaway PGlite database, migrated and seeded
 * fresh in `beforeAll` and deleted in `afterAll`.
 *
 * This must never point at the dev database: PGlite is single-process, so a
 * test run sharing the dev server's `.railor/pglite` directory aborts both.
 * `PGLITE_DATA_DIR` is set here, before any `getDb()` call, to a unique temp
 * directory instead.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dataDir = mkdtempSync(join(tmpdir(), "railor-core-test-"));
process.env.PGLITE_DATA_DIR = dataDir;
process.env.DATABASE_URL = ""; // force the embedded driver regardless of ambient env

const { getDbHandle, seedDemoData } = await import("@railor/database");
const { interpretRules } = await import("../interpret.js");
const { searchCorridors } = await import("../search.js");

const flagship = "Indian company sending USDC on Base to a UAE supplier who receives AED";

beforeAll(async () => {
  await seedDemoData();
}, 30_000);

afterAll(async () => {
  const { close } = await getDbHandle();
  await close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe("corridor search", () => {
  it("answers the flagship query with a spread of verdicts", async () => {
    const { query } = interpretRules(flagship);
    const result = await searchCorridors(query);

    expect(result.providersChecked).toBe(15);
    expect(result.counts.supported).toBeGreaterThan(0);
    expect(result.counts.unavailable).toBeGreaterThan(0);
    expect(result.results).toHaveLength(15);

    const bySlug = Object.fromEntries(result.results.map((r) => [r.provider.slug, r]));

    // Ironwood publishes AE local AED payouts and onboards Indian entities.
    expect(bySlug["ironwood-settlement"]!.eligibility).toBe("supported");

    // Corvus does not accept Indian-incorporated businesses — and says why.
    const corvus = bySlug["corvus-financial"]!;
    expect(corvus.eligibility).toBe("unavailable");
    expect(corvus.reasons[0]!.code).toBe("entity_jurisdiction_unsupported");
    expect(corvus.reasons[0]!.message).toMatch(/not currently accepted/i);
    expect(corvus.reasons[0]!.alsoTrue.join(" ")).toMatch(/United Arab Emirates/);
  }, 30_000);

  it("never returns a verdict without a reason", async () => {
    const { query } = interpretRules(flagship);
    const result = await searchCorridors(query);
    for (const r of result.results) {
      expect(r.reasons.length).toBeGreaterThan(0);
      expect(r.reasons[0]!.message.length).toBeGreaterThan(10);
    }
  }, 30_000);

  it("ranks eligible providers above ineligible ones regardless of preset", async () => {
    const { query } = interpretRules(flagship);
    for (const preset of ["balanced", "cheapest", "fastest"] as const) {
      const result = await searchCorridors(query, { preset });
      const firstUnavailable = result.results.findIndex((r) => r.eligibility === "unavailable");
      const lastSupported = result.results.map((r) => r.eligibility).lastIndexOf("supported");
      expect(lastSupported).toBeLessThan(firstUnavailable);
    }
  }, 30_000);

  it("attaches evidence to every supported verdict", async () => {
    const { query } = interpretRules(flagship);
    const result = await searchCorridors(query);
    for (const r of result.results.filter((x) => x.eligibility === "supported")) {
      expect(r.evidence.length).toBeGreaterThan(0);
      expect(r.evidence[0]!.sourceUrl).toMatch(/^https:\/\//);
      expect(r.lastVerifiedAt).toBeTruthy();
    }
  }, 30_000);
});
