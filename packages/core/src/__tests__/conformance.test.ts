/**
 * conformance.ts against a throwaway PGlite DB (same isolation rules as
 * source-monitor.test.ts) with `fetch` fully mocked and `../adapters.js`
 * mocked to a single controllable fake adapter — no real network call, no
 * dependency on any real provider's actual adapter shape.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const dataDir = mkdtempSync(join(tmpdir(), "railor-conformance-test-"));
process.env.PGLITE_DATA_DIR = dataDir;
process.env.DATABASE_URL = "";

const testConnection = vi.fn();
vi.mock("../adapters.js", () => ({
  getAdapter: (slug: string) => (slug.startsWith("adapter-co") ? { slug, credentialFields: [], testConnection } : null),
}));

const { getDb, getDbHandle, providers, conformanceTests, conformanceRuns, ensureMigrated } = await import("@railor/database");
const { eq } = await import("drizzle-orm");
const { runConformanceChecks } = await import("../conformance.js");

async function insertProvider(overrides: Partial<typeof providers.$inferInsert> = {}) {
  const db = await getDb();
  const [p] = await db
    .insert(providers)
    .values({ slug: `provider-${crypto.randomUUID()}`, name: "Test Provider", isDemo: false, category: "Test", description: "test", ...overrides })
    .returning();
  return p!;
}

async function insertTest(providerId: string, kind: string, overrides: Partial<typeof conformanceTests.$inferInsert> = {}) {
  const db = await getDb();
  const [t] = await db
    .insert(conformanceTests)
    .values({ providerId, kind: kind as never, label: kind, ...overrides })
    .returning();
  return t!;
}

async function runsFor(testId: string) {
  const db = await getDb();
  return db.select().from(conformanceRuns).where(eq(conformanceRuns.testId, testId));
}

beforeAll(async () => {
  await ensureMigrated();
}, 30_000);

afterAll(async () => {
  const { close } = await getDbHandle();
  await close();
  rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  testConnection.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function okRobots() {
  return new Response("User-agent: *\nDisallow: /admin\n", { status: 200 });
}

describe("docs_parity / status_endpoint — real URL probes", () => {
  it("reports not_tested with no fetch at all when the provider has no URL on record", async () => {
    const provider = await insertProvider({ docsUrl: null });
    const test = await insertTest(provider.id, "docs_parity");

    const summary = await runConformanceChecks();
    expect(summary.byStatus.not_tested).toBeGreaterThanOrEqual(1);
    const [run] = await runsFor(test.id);
    expect(run!.status).toBe("not_tested");
    expect(run!.detail).toMatch(/no docs_url/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("passes on a real 2xx response, recording byte length and latency", async () => {
    const provider = await insertProvider({ docsUrl: "https://provider.example/docs" });
    const test = await insertTest(provider.id, "docs_parity");
    (fetch as any).mockImplementation(async (url: string) =>
      url.endsWith("/robots.txt") ? okRobots() : new Response("hello docs", { status: 200 }),
    );

    await runConformanceChecks();
    const [run] = await runsFor(test.id);
    expect(run!.status).toBe("pass");
    expect(run!.detail).toMatch(/HTTP 200, 10 bytes/);
    expect(run!.latencyMs).not.toBeNull();
  });

  it("fails on a real non-2xx response", async () => {
    const provider = await insertProvider({ statusPageUrl: "https://provider.example/status" });
    const test = await insertTest(provider.id, "status_endpoint");
    (fetch as any).mockImplementation(async (url: string) =>
      url.endsWith("/robots.txt") ? okRobots() : new Response("nope", { status: 503 }),
    );

    await runConformanceChecks();
    const [run] = await runsFor(test.id);
    expect(run!.status).toBe("fail");
    expect(run!.detail).toMatch(/503/);
  });

  it("fails, not crashes, on a network error", async () => {
    const provider = await insertProvider({ docsUrl: "https://provider.example/docs" });
    const test = await insertTest(provider.id, "docs_parity");
    (fetch as any).mockImplementation(async (url: string) => {
      if (url.endsWith("/robots.txt")) return okRobots();
      throw new Error("ECONNRESET");
    });

    const summary = await runConformanceChecks();
    expect(summary.byStatus.fail).toBeGreaterThanOrEqual(1);
    const [run] = await runsFor(test.id);
    expect(run!.status).toBe("fail");
    expect(run!.detail).toMatch(/ECONNRESET/);
  });

  it("marks access_required and never fetches the target when robots.txt disallows it", async () => {
    const provider = await insertProvider({ docsUrl: "https://provider.example/private-docs" });
    const test = await insertTest(provider.id, "docs_parity");
    (fetch as any).mockImplementation(async (url: string) =>
      url.endsWith("/robots.txt") ? new Response("User-agent: *\nDisallow: /\n", { status: 200 }) : new Response("should never be fetched", { status: 200 }),
    );

    await runConformanceChecks();
    const [run] = await runsFor(test.id);
    expect(run!.status).toBe("access_required");
    expect(run!.detail).toMatch(/robots\.txt/);
    expect((fetch as any).mock.calls.some((c: unknown[]) => (c[0] as string).endsWith("/private-docs"))).toBe(false);
  });
});

describe("authentication — real when a connection exists, honest otherwise", () => {
  it("is access_required when no getConnectionCredentials callback is supplied at all", async () => {
    const provider = await insertProvider();
    const test = await insertTest(provider.id, "authentication");
    await runConformanceChecks();
    const [run] = await runsFor(test.id);
    expect(run!.status).toBe("access_required");
    expect(testConnection).not.toHaveBeenCalled();
  });

  it("is access_required when the callback finds no connection", async () => {
    const provider = await insertProvider();
    const test = await insertTest(provider.id, "authentication");
    await runConformanceChecks({ getConnectionCredentials: async () => null });
    const [run] = await runsFor(test.id);
    expect(run!.status).toBe("access_required");
    expect(testConnection).not.toHaveBeenCalled();
  });

  it("calls the real adapter's testConnection and records a genuine pass", async () => {
    const provider = await insertProvider({ slug: `adapter-co-${crypto.randomUUID()}` });
    const test = await insertTest(provider.id, "authentication");
    testConnection.mockResolvedValue({ ok: true, detail: "authenticated" });

    await runConformanceChecks({ getConnectionCredentials: async () => ({ apiKey: "real-key" }) });
    expect(testConnection).toHaveBeenCalledWith({ apiKey: "real-key" });
    const [run] = await runsFor(test.id);
    expect(run!.status).toBe("pass");
    expect(run!.detail).toBe("authenticated");
  });

  it("records a genuine fail when the real adapter call rejects the credentials", async () => {
    const provider = await insertProvider({ slug: `adapter-co-${crypto.randomUUID()}` });
    const test = await insertTest(provider.id, "authentication");
    testConnection.mockResolvedValue({ ok: false, detail: "401 invalid key" });

    await runConformanceChecks({ getConnectionCredentials: async () => ({ apiKey: "bad-key" }) });
    const [run] = await runsFor(test.id);
    expect(run!.status).toBe("fail");
    expect(run!.detail).toBe("401 invalid key");
  });
});

describe("every other kind — never fabricated, always access_required", () => {
  it.each(["quote_api", "quote_schema", "idempotency", "beneficiary_validation", "asset_network_availability", "response_schema", "sandbox_reachable", "webhook_signature"])(
    "%s is access_required, never money-testing anything",
    async (kind) => {
      const provider = await insertProvider();
      const test = await insertTest(provider.id, kind);
      await runConformanceChecks({ getConnectionCredentials: async () => ({ apiKey: "irrelevant" }) });
      const [run] = await runsFor(test.id);
      expect(run!.status).toBe("access_required");
    },
  );
});

describe("runConformanceChecks orchestration", () => {
  it("skips disabled tests entirely and inserts exactly one run per enabled test", async () => {
    const provider = await insertProvider();
    const enabled = await insertTest(provider.id, "authentication");
    const disabled = await insertTest(provider.id, "quote_api", { enabled: false });

    await runConformanceChecks();
    expect(await runsFor(enabled.id)).toHaveLength(1);
    expect(await runsFor(disabled.id)).toHaveLength(0);
  });

  it("never checks a demo provider's tests — no real network call, no run recorded", async () => {
    const demoProvider = await insertProvider({ isDemo: true, docsUrl: "https://demo.railor.dev/providers/fake-co/docs" });
    const demoTest = await insertTest(demoProvider.id, "docs_parity");

    await runConformanceChecks();
    expect(await runsFor(demoTest.id)).toHaveLength(0);
    expect((fetch as any).mock.calls.some((c: unknown[]) => (c[0] as string).includes("demo.railor.dev"))).toBe(false);
  });
});
