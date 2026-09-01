/**
 * source-monitor.ts against a throwaway PGlite DB (same isolation rules as
 * engine.test.ts) with `fetch` fully mocked — no real network call, ever.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const dataDir = mkdtempSync(join(tmpdir(), "railor-source-monitor-test-"));
process.env.PGLITE_DATA_DIR = dataDir;
process.env.DATABASE_URL = "";

const { getDb, getDbHandle, providers, sourceDocuments, changeEvents, ensureMigrated } = await import("@railor/database");
const { eq } = await import("drizzle-orm");
const { checkSource, checkDueSources } = await import("../source-monitor.js");

let providerId: string;

beforeAll(async () => {
  await ensureMigrated();
  const db = await getDb();
  const [p] = await db
    .insert(providers)
    .values({ slug: "source-monitor-test", name: "Source Monitor Test Co", isDemo: false, category: "Test", description: "test" })
    .returning({ id: providers.id });
  providerId = p!.id;
}, 30_000);

afterAll(async () => {
  const { close } = await getDbHandle();
  await close();
  rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function insertDoc(overrides: Partial<typeof sourceDocuments.$inferInsert> = {}) {
  const db = await getDb();
  const [doc] = await db
    .insert(sourceDocuments)
    .values({ providerId, url: `https://example.test/${crypto.randomUUID()}`, title: "Test doc", sourceType: "official_docs", ...overrides })
    .returning();
  return doc!;
}

describe("checkSource", () => {
  it("records a baseline hash on first check without creating a change_event", async () => {
    const doc = await insertDoc();
    (fetch as any).mockResolvedValue(new Response("hello world", { status: 200, headers: { etag: "\"v1\"" } }));

    const result = await checkSource(doc.id);
    expect(result.outcome).toBe("unchanged");
    expect(result.detail).toMatch(/first check/);

    const db = await getDb();
    const [updated] = await db.select().from(sourceDocuments).where(eq(sourceDocuments.id, doc.id));
    expect(updated!.contentHash).toBeTruthy();
    expect(updated!.etag).toBe('"v1"');
    expect(updated!.lastCheckedAt).toBeTruthy();
    expect(updated!.nextCheckAt).toBeTruthy();

    const events = await db.select().from(changeEvents).where(eq(changeEvents.sourceDocumentId, doc.id));
    expect(events).toHaveLength(0);
  });

  it("treats a 304 as unchanged without re-hashing anything", async () => {
    const doc = await insertDoc({ etag: '"v1"', contentHash: "deadbeef" });
    (fetch as any).mockResolvedValue(new Response(null, { status: 304 }));

    const result = await checkSource(doc.id);
    expect(result.outcome).toBe("unchanged");
    expect(result.detail).toMatch(/304/);

    const db = await getDb();
    const [updated] = await db.select().from(sourceDocuments).where(eq(sourceDocuments.id, doc.id));
    expect(updated!.contentHash).toBe("deadbeef"); // untouched — 304 body was never fetched
  });

  it("detects a real content change and creates a pending change_event", async () => {
    const oldHash = "0".repeat(64);
    const doc = await insertDoc({ contentHash: oldHash });
    (fetch as any).mockResolvedValue(new Response("brand new content", { status: 200 }));

    const result = await checkSource(doc.id);
    expect(result.outcome).toBe("changed");

    const db = await getDb();
    const [updated] = await db.select().from(sourceDocuments).where(eq(sourceDocuments.id, doc.id));
    expect(updated!.contentHash).not.toBe(oldHash);

    const events = await db.select().from(changeEvents).where(eq(changeEvents.sourceDocumentId, doc.id));
    expect(events).toHaveLength(1);
    expect(events[0]!.reviewStatus).toBe("pending");
    expect(events[0]!.previousValue).toBe(oldHash);
    expect(events[0]!.kind).toBe("documentation_changed");
  });

  it("does not create a change_event when the identical content is fetched again", async () => {
    const doc = await insertDoc();
    (fetch as any).mockImplementation(async () => new Response("stable content", { status: 200 }));
    await checkSource(doc.id); // establishes the baseline

    const result = await checkSource(doc.id); // same body again
    expect(result.outcome).toBe("unchanged");

    const db = await getDb();
    const events = await db.select().from(changeEvents).where(eq(changeEvents.sourceDocumentId, doc.id));
    expect(events).toHaveLength(0);
  });

  it("records a failure and increments failureCount on a network error, without throwing", async () => {
    const doc = await insertDoc();
    (fetch as any).mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await checkSource(doc.id);
    expect(result.outcome).toBe("failed");
    expect(result.detail).toMatch(/ECONNREFUSED/);

    const db = await getDb();
    const [updated] = await db.select().from(sourceDocuments).where(eq(sourceDocuments.id, doc.id));
    expect(updated!.failureCount).toBe(1);
    expect(updated!.lastError).toMatch(/ECONNREFUSED/);
  });

  it("records a failure on a non-2xx, non-304 response", async () => {
    const doc = await insertDoc();
    (fetch as any).mockResolvedValue(new Response("not found", { status: 404 }));

    const result = await checkSource(doc.id);
    expect(result.outcome).toBe("failed");
    expect(result.detail).toMatch(/404/);
  });

  it("skips the change_event (but still updates the hash) when the source has no providerId", async () => {
    const db = await getDb();
    const [orphan] = await db
      .insert(sourceDocuments)
      .values({ providerId: null, url: "https://example.test/orphan", title: "Orphan", sourceType: "official_docs", contentHash: "0".repeat(64) })
      .returning();
    (fetch as any).mockResolvedValue(new Response("changed content", { status: 200 }));

    const result = await checkSource(orphan!.id);
    expect(result.outcome).toBe("skipped_no_provider_for_change_event");

    const [updated] = await db.select().from(sourceDocuments).where(eq(sourceDocuments.id, orphan!.id));
    expect(updated!.contentHash).not.toBe("0".repeat(64));
  });
});

describe("checkDueSources", () => {
  it("only checks sources that are due, and is safe to run twice in a row (idempotent state, not duplicate change_events)", async () => {
    const dueDoc = await insertDoc({ nextCheckAt: new Date(Date.now() - 1000) });
    const notDueDoc = await insertDoc({ nextCheckAt: new Date(Date.now() + 3_600_000) });
    (fetch as any).mockImplementation(async () => new Response("content", { status: 200 }));

    const first = await checkDueSources({ limit: 50 });
    expect(first.results.some((r) => r.sourceDocumentId === dueDoc.id)).toBe(true);
    expect(first.results.some((r) => r.sourceDocumentId === notDueDoc.id)).toBe(false);

    // After one check, dueDoc's nextCheckAt moves into the future, so an
    // immediate second run must not re-check it (and must not re-fire a
    // change_event for a page that hasn't changed since).
    const second = await checkDueSources({ limit: 50 });
    expect(second.results.some((r) => r.sourceDocumentId === dueDoc.id)).toBe(false);
  });
});
