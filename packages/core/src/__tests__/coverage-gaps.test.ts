/**
 * coverage-gaps.ts against a throwaway PGlite DB (same isolation rules as
 * engine.test.ts / source-monitor.test.ts). `loadProviderInputs` is mocked so
 * `revalidateCoverageGaps`'s re-evaluation is driven by a controlled,
 * minimal provider fixture rather than a fully-seeded capability graph — the
 * real `evaluateProvider` still runs unmocked, so the resolve/stay-open
 * decision is real, not asserted by hand.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dataDir = mkdtempSync(join(tmpdir(), "railor-coverage-gaps-test-"));
process.env.PGLITE_DATA_DIR = dataDir;
process.env.DATABASE_URL = "";

vi.mock("../repository.js", () => ({ loadProviderInputs: vi.fn() }));

const { getDb, getDbHandle, providers, coverageGaps, corridorDemand, changeEvents, ensureMigrated } = await import("@railor/database");
const { eq } = await import("drizzle-orm");
const { loadProviderInputs } = await import("../repository.js");
const { recordSearchTelemetry, revalidateCoverageGaps } = await import("../coverage-gaps.js");
const { corridorKey } = await import("../search.js");
const { evaluateProvider } = await import("../eligibility.js");
import type { CapabilityFacet, ProviderInput } from "../eligibility.js";
import type { CorridorQuery } from "@railor/types";

const verifiedAt = new Date("2026-08-28T00:00:00.000Z");

function facet(overrides: Partial<CapabilityFacet> = {}): CapabilityFacet {
  return {
    id: crypto.randomUUID(),
    product: "payout",
    entityCountry: null,
    customerCountry: null,
    customerType: "business",
    sourceCountry: null,
    sourceEndpointType: null,
    sourceNamedRail: null,
    sourceAsset: null,
    sourceNetwork: null,
    sourceCurrency: null,
    destinationCountry: null,
    destinationCurrency: null,
    paymentMethod: null,
    availability: "supported",
    note: null,
    lastVerifiedAt: verifiedAt,
    evidenceConfidence: 0.95,
    evidenceSourceType: "official_docs",
    evidenceVerificationType: "provider_reported",
    evidenceId: "evidence-1",
    evidenceUrl: "https://provider.example/docs",
    evidenceTitle: "Provider docs",
    evidenceRetrievedAt: verifiedAt,
    evidenceRawHash: "hash",
    evidenceExcerpt: "Supported route statement.",
    ...overrides,
  };
}

function providerInput(id: string, facets: CapabilityFacet[]): ProviderInput {
  return {
    id,
    slug: "example",
    name: "Example Provider",
    category: "Test",
    isDemo: false,
    products: ["payout"],
    facets,
    advertisedSettlement: null,
    onboardingDays: null,
    hasApi: true,
    hasSandbox: false,
    lastVerifiedAt: verifiedAt,
    requirementKeys: [],
    requirementLabels: {},
    healthOkRatio: 1,
    destinationCountryCount: 1,
  };
}

let providerId: string;

beforeAll(async () => {
  await ensureMigrated();
  const db = await getDb();
  const [p] = await db
    .insert(providers)
    .values({ slug: "coverage-gaps-test", name: "Coverage Gaps Test Co", isDemo: false, category: "Test", description: "test" })
    .returning({ id: providers.id });
  providerId = p!.id;
}, 30_000);

afterAll(async () => {
  const { close } = await getDbHandle();
  await close();
  rmSync(dataDir, { recursive: true, force: true });
});

const QUERY: CorridorQuery = { destinationCountry: "US", destinationCurrency: "USD", customerType: "business" };

function unknownResult(reasons: unknown[] = [{ code: "no_data", message: "no evidence", alsoTrue: [], wouldChange: [] }]) {
  return [{ provider: { id: providerId, slug: "example", name: "Example", category: "Test", isDemo: false }, eligibility: "unknown" as const, reasons: reasons as never }];
}

/** Wraps recordSearchTelemetry so tests never have to compute+pass the corridorKey by hand. */
function search(query: CorridorQuery, results: Parameters<typeof recordSearchTelemetry>[2]) {
  return recordSearchTelemetry(query, corridorKey(query), results);
}

describe("recordSearchTelemetry", () => {
  it("records nothing for a query with no real destination", async () => {
    await search({ customerType: "business" } as CorridorQuery, []);
    const db = await getDb();
    const rows = await db.select().from(corridorDemand);
    expect(rows).toHaveLength(0);
  });

  it("creates a corridor_demand row on first search and increments on repeat, tracking volume only when an amount was given", async () => {
    const db = await getDb();
    await search(QUERY, []);
    const key = corridorKey(QUERY);
    let [row] = await db.select().from(corridorDemand).where(eq(corridorDemand.corridorKey, key));
    expect(row!.searchCount).toBe(1);
    expect(row!.volumeSearchCount).toBe(0);
    expect(row!.totalRequestedVolume).toBeNull();

    await search({ ...QUERY, amount: 500 }, []);
    [row] = await db.select().from(corridorDemand).where(eq(corridorDemand.corridorKey, key));
    expect(row!.searchCount).toBe(2);
    expect(row!.volumeSearchCount).toBe(1);
    expect(Number(row!.totalRequestedVolume)).toBe(500);
  });

  it("creates a coverage_gaps row for an unknown result, carrying the real reasons verbatim", async () => {
    const gapQuery = { destinationCountry: "FR", destinationCurrency: "EUR", customerType: "business" } as CorridorQuery;
    const reasons = [{ code: "no_data", message: "Railor has no verified statement for FR.", alsoTrue: [], wouldChange: [] }];
    await search(gapQuery, unknownResult(reasons));

    const db = await getDb();
    const [gap] = await db.select().from(coverageGaps).where(eq(coverageGaps.corridorKey, corridorKey(gapQuery)));
    expect(gap!.status).toBe("open");
    expect(gap!.timesRequested).toBe(1);
    expect(gap!.reasons).toEqual(reasons);
  });

  it("never creates a coverage_gaps row for a supported result", async () => {
    const gapQuery = { destinationCountry: "DE", destinationCurrency: "EUR", customerType: "business" } as CorridorQuery;
    await search(gapQuery, [
      { provider: { id: providerId, slug: "example", name: "Example", category: "Test", isDemo: false }, eligibility: "supported" as const, reasons: [] as never },
    ]);
    const db = await getDb();
    const rows = await db.select().from(coverageGaps).where(eq(coverageGaps.corridorKey, corridorKey(gapQuery)));
    expect(rows).toHaveLength(0);
  });

  it("increments timesRequested on a repeat unknown search instead of duplicating the row", async () => {
    const gapQuery = { destinationCountry: "IT", destinationCurrency: "EUR", customerType: "business" } as CorridorQuery;
    await search(gapQuery, unknownResult());
    await search(gapQuery, unknownResult());
    const db = await getDb();
    const rows = await db.select().from(coverageGaps).where(eq(coverageGaps.corridorKey, corridorKey(gapQuery)));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.timesRequested).toBe(2);
  });

  it("reopens a gap that resurfaces as unknown after being marked resolved", async () => {
    const gapQuery = { destinationCountry: "ES", destinationCurrency: "EUR", customerType: "business" } as CorridorQuery;
    await search(gapQuery, unknownResult());
    const db = await getDb();
    const key = corridorKey(gapQuery);
    await db.update(coverageGaps).set({ status: "resolved", resolvedAt: new Date() }).where(eq(coverageGaps.corridorKey, key));

    await search(gapQuery, unknownResult());
    const [row] = await db.select().from(coverageGaps).where(eq(coverageGaps.corridorKey, key));
    expect(row!.status).toBe("open");
    expect(row!.resolvedAt).toBeNull();
  });
});

describe("revalidateCoverageGaps", () => {
  it("resolves a gap and writes one pending coverage_changed event when current data now answers it", async () => {
    const gapQuery: CorridorQuery = { destinationCountry: "JP", destinationCurrency: "JPY", customerType: "business" };
    const db = await getDb();
    await db.insert(coverageGaps).values({
      providerId,
      corridorKey: corridorKey(gapQuery),
      query: gapQuery as Record<string, unknown>,
      reasons: [{ code: "no_data", message: "old", alsoTrue: [], wouldChange: [] }],
    });

    const nowSupported = providerInput(providerId, [
      facet({ destinationCountry: "JP", destinationCurrency: "JPY", availability: "supported" }),
    ]);
    // Sanity-check the fixture actually evaluates to "supported" before
    // trusting revalidateCoverageGaps's real call to the same function.
    expect(evaluateProvider(nowSupported, gapQuery).verdict).toBe("supported");
    vi.mocked(loadProviderInputs).mockResolvedValue([nowSupported]);

    const summary = await revalidateCoverageGaps();
    expect(summary.resolved).toBe(1);

    const [gap] = await db.select().from(coverageGaps).where(eq(coverageGaps.corridorKey, corridorKey(gapQuery)));
    expect(gap!.status).toBe("resolved");
    expect(gap!.resolvedChangeEventId).toBeTruthy();

    const [change] = await db.select().from(changeEvents).where(eq(changeEvents.id, gap!.resolvedChangeEventId!));
    expect(change!.kind).toBe("coverage_changed");
    expect(change!.reviewStatus).toBe("pending");
    expect(change!.affects).toMatchObject({ destinationCountry: "JP", destinationCurrency: "JPY" });
  });

  it("leaves a gap open and writes no change_event when it's still genuinely unknown", async () => {
    const gapQuery: CorridorQuery = { destinationCountry: "KR", destinationCurrency: "KRW", customerType: "business" };
    const db = await getDb();
    await db.insert(coverageGaps).values({
      providerId,
      corridorKey: corridorKey(gapQuery),
      query: gapQuery as Record<string, unknown>,
      reasons: [{ code: "no_data", message: "old", alsoTrue: [], wouldChange: [] }],
    });

    const stillUnknown = providerInput(providerId, []); // no facets at all for KR — still unknown
    vi.mocked(loadProviderInputs).mockResolvedValue([stillUnknown]);

    const changeCountBefore = (await db.select().from(changeEvents)).length;
    const summary = await revalidateCoverageGaps();
    const changeCountAfter = (await db.select().from(changeEvents)).length;

    const [gap] = await db.select().from(coverageGaps).where(eq(coverageGaps.corridorKey, corridorKey(gapQuery)));
    expect(gap!.status).toBe("open");
    expect(changeCountAfter).toBe(changeCountBefore);
    expect(summary.stillOpen).toBeGreaterThanOrEqual(1);
  });

  it("skips a gap whose provider no longer exists in current data, without crashing", async () => {
    const gapQuery: CorridorQuery = { destinationCountry: "BR", destinationCurrency: "BRL", customerType: "business" };
    const db = await getDb();
    await db.insert(coverageGaps).values({
      providerId,
      corridorKey: corridorKey(gapQuery),
      query: gapQuery as Record<string, unknown>,
      reasons: [],
    });
    vi.mocked(loadProviderInputs).mockResolvedValue([]); // provider vanished from current inputs

    await expect(revalidateCoverageGaps()).resolves.toBeDefined();
    const [gap] = await db.select().from(coverageGaps).where(eq(coverageGaps.corridorKey, corridorKey(gapQuery)));
    expect(gap!.status).toBe("open");
  });
});
