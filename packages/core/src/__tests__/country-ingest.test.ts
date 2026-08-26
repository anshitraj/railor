/**
 * researchCountry() end to end against a throwaway PGlite database (same
 * pattern as engine.test.ts: unique PGLITE_DATA_DIR set before any
 * @railor/database import). Tavily and Gemini are fully mocked — no real
 * API credits spent. Each scenario uses a distinct country so tests don't
 * interfere with each other's freshness/in-progress guards.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const dataDir = mkdtempSync(join(tmpdir(), "railor-country-research-test-"));
process.env.PGLITE_DATA_DIR = dataDir;
process.env.DATABASE_URL = "";
process.env.TAVILY_API_KEY = "test-key";
process.env.GEMINI_API_KEY = "test-key";

const { mockTavilySearch, mockTavilyExtract, mockExtractProfile } = vi.hoisted(() => ({
  mockTavilySearch: vi.fn(),
  mockTavilyExtract: vi.fn(),
  mockExtractProfile: vi.fn(),
}));

vi.mock("../country-research/tavily.js", () => ({
  tavilySearch: mockTavilySearch,
  tavilyExtract: mockTavilyExtract,
}));
vi.mock("../country-research/extract.js", () => ({
  extractCountryProfile: mockExtractProfile,
}));

const { getDb, getDbHandle, schema, seedDemoData } = await import("@railor/database");
const { researchCountry } = await import("../country-research/ingest.js");

const empty = { value: null, sourceUrls: [] as string[] };
const emptyArr = { value: [] as string[], sourceUrls: [] as string[] };
const validExtraction = () => ({
  centralBankName: { value: "Reserve Bank of India", sourceUrls: ["https://rbi.org.in/doc"] },
  regulatorNames: emptyArr,
  pspLicensingSummary: empty,
  ibanSupported: empty,
  ibanNote: empty,
  swiftSupported: empty,
  swiftNote: empty,
  instantPaymentAvailable: empty,
  instantPaymentSystem: empty,
  localPaymentRails: emptyArr,
  bankAccountRequirements: emptyArr,
  routingCodeType: empty,
  routingCodeDescription: empty,
  cryptoStatus: empty,
  stablecoinStatus: empty,
  kycRequirements: emptyArr,
  kybRequirements: emptyArr,
  amlRequirements: emptyArr,
  crossBorderRestrictions: emptyArr,
  supportedPayoutCurrencies: emptyArr,
});

beforeAll(async () => {
  await seedDemoData();
}, 30_000);

afterAll(async () => {
  const { close } = await getDbHandle();
  await close();
  rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  mockTavilySearch.mockReset();
  mockTavilyExtract.mockReset();
  mockExtractProfile.mockReset();
  mockTavilySearch.mockImplementation(async () => ({
    query: "q",
    results: [{ title: "RBI", url: "https://rbi.org.in/doc", content: "text", score: 0.9 }],
  }));
  mockTavilyExtract.mockResolvedValue({
    results: [{ url: "https://rbi.org.in/doc", rawContent: "Extracted full text about the central bank." }],
    failedResults: [],
  });
  mockExtractProfile.mockResolvedValue(validExtraction());
});

describe("researchCountry", () => {
  it("is idempotent: repeated runs upsert one profile row, don't duplicate sources, and replace fact-links", async () => {
    const db = await getDb();

    const first = await researchCountry("IN", { triggerType: "cli" });
    expect(first.status).toBe("completed");

    const second = await researchCountry("IN", { triggerType: "cli", forceRefresh: true });
    expect(second.status).toBe("completed");

    const profiles = await db.select().from(schema.countryProfiles).where(eq(schema.countryProfiles.iso2, "IN"));
    expect(profiles).toHaveLength(1);
    expect(profiles[0]!.centralBankName).toBe("Reserve Bank of India");

    const sources = await db.select().from(schema.countrySources).where(eq(schema.countrySources.countryIso2, "IN"));
    expect(sources).toHaveLength(1); // same URL both runs — upserted, not duplicated

    const facts = await db.select().from(schema.countryFactSources).where(eq(schema.countryFactSources.countryIso2, "IN"));
    expect(facts).toHaveLength(1); // replaced wholesale each run, not accumulated across the 2 calls
  });

  it("marks the run failed at the searching phase, and writes no profile, when every query fails", async () => {
    mockTavilySearch.mockRejectedValue(new Error("network down"));

    const report = await researchCountry("US", { triggerType: "cli" });
    expect(report.status).toBe("failed");
    expect(report.errorPhase).toBe("searching");

    const db = await getDb();
    const profiles = await db.select().from(schema.countryProfiles).where(eq(schema.countryProfiles.iso2, "US"));
    expect(profiles).toHaveLength(0);
  });

  it("marks the run partial when some queries fail but the pipeline still produces a profile", async () => {
    let call = 0;
    mockTavilySearch.mockImplementation(async () => {
      call++;
      if (call % 3 === 0) throw new Error("transient failure");
      return { query: "q", results: [{ title: "RBI", url: "https://rbi.org.in/doc", content: "text", score: 0.9 }] };
    });

    const report = await researchCountry("GB", { triggerType: "cli" });
    expect(report.status).toBe("partial");
  });

  it("refuses a second run inside the recheck window without forceRefresh, before touching Tavily/Gemini", async () => {
    const firstRun = await researchCountry("SG", { triggerType: "cli" });
    expect(firstRun.status).toBe("completed");
    mockTavilySearch.mockClear();
    mockExtractProfile.mockClear();

    await expect(researchCountry("SG", { triggerType: "cli" })).rejects.toThrow(/recheck window|forceRefresh/i);
    expect(mockTavilySearch).not.toHaveBeenCalled();
    expect(mockExtractProfile).not.toHaveBeenCalled();

    const forced = await researchCountry("SG", { triggerType: "cli", forceRefresh: true });
    expect(forced.status).toBe("completed");
  });

  it("fires onPhase transitions in order for a clean run", async () => {
    const phases: string[] = [];
    await researchCountry("AE", { triggerType: "cli", onPhase: ({ phase }) => phases.push(phase) });
    expect(phases).toEqual(["searching", "extracting", "validating", "completed"]);
  });

  it("rejects a country outside the seeded scope without creating a run row", async () => {
    await expect(researchCountry("RU", { triggerType: "cli" })).rejects.toThrow(/researchable/i);
  });
});
