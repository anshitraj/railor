/**
 * Proves the read path (what GET /api/countries/:code calls) never performs
 * network I/O — global fetch is stubbed to throw on any call, so a Tavily/
 * Gemini call anywhere in this path would fail the test loudly, not silently.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dataDir = mkdtempSync(join(tmpdir(), "railor-country-read-test-"));
process.env.PGLITE_DATA_DIR = dataDir;
process.env.DATABASE_URL = "";

vi.stubGlobal(
  "fetch",
  vi.fn(() => {
    throw new Error("loadCountryProfile/loadCountrySources must never perform network I/O");
  }),
);

const { getDbHandle, schema, seedDemoData } = await import("@railor/database");
const { loadCountryProfile, loadCountrySources } = await import("../repository.js");

beforeAll(async () => {
  await seedDemoData();
}, 30_000);

afterAll(async () => {
  const { close } = await getDbHandle();
  await close();
  rmSync(dataDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe("country intelligence reads", () => {
  it("returns null for a country that exists but hasn't been researched yet", async () => {
    const profile = await loadCountryProfile("US");
    expect(profile).toBeNull();
  });

  it("returns the stored profile once one exists, without ever calling fetch", async () => {
    const { getDb } = await import("@railor/database");
    const db = await getDb();
    await db.insert(schema.countryProfiles).values({
      iso2: "GB",
      iso3: "GBR",
      countryName: "United Kingdom",
      centralBankName: "Bank of England",
      instantPaymentSystem: "Faster Payments",
    });

    const profile = await loadCountryProfile("GB");
    expect(profile?.centralBankName).toBe("Bank of England");
    expect(profile?.instantPaymentSystem).toBe("Faster Payments");

    const sources = await loadCountrySources("GB");
    expect(sources).toEqual([]); // no sources inserted — an empty list, not an error

    expect(fetch).not.toHaveBeenCalled();
  });
});
