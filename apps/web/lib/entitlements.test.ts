import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./alerting", () => ({ backfillWatchlistAlerts: vi.fn(async () => 0) }));
const directory = mkdtempSync(join(tmpdir(), "railor-entitlements-"));
process.env.PGLITE_DATA_DIR = directory;
process.env.DATABASE_URL = "";
const { ensureMigrated, getDb, getDbHandle, organizations, organizationEntitlements, rateLimitBuckets } = await import("@railor/database");
const { eq } = await import("drizzle-orm");
const { consumeApiAllowance, getEntitlement } = await import("./entitlements");
const { consumeLimit } = await import("./rate-limit");
const { createWatchlist, getOwnedWatchlist } = await import("./watchlists");
let org: string;
let other: string;
beforeAll(async () => {
  await ensureMigrated();
  const db = await getDb();
  const rows = await db.insert(organizations).values([{ name: "Test", slug: "quota-test" }, { name: "Other", slug: "other-test" }]).returning();
  org = rows[0]!.id; other = rows[1]!.id;
}, 30_000);
afterAll(async () => { await (await getDbHandle()).close(); rmSync(directory, { recursive: true, force: true }); });

describe("shared production limits", () => {
  it("allows only the configured burst under concurrent requests", async () => {
    const outcomes = await Promise.all(Array.from({ length: 10 }, () => consumeLimit("test", "same-client", 3, 3_600_000)));
    expect(outcomes.filter(Boolean)).toHaveLength(3);
  });
  it("shares the 500-request allowance across keys and avoids a concurrent overrun", async () => {
    const db = await getDb();
    const now = new Date(); const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    await db.insert(rateLimitBuckets).values({ key: `api-month:${org}`, windowStart: month, expiresAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)), count: 499 });
    const results = await Promise.all([consumeApiAllowance(org, "key-a", null), consumeApiAllowance(org, "key-b", null)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await consumeApiAllowance(other, "other-key", null)).toBe(true);
  });
  it("enforces monitor quota, keeps creation idempotent, and isolates tenants", async () => {
    const first = await createWatchlist(org, null, { target_type: "country", target_id: "IN" });
    expect(first.row.channelEmail).toBe(false);
    expect((await createWatchlist(org, null, { target_type: "country", target_id: "IN" })).created).toBe(false);
    await expect(createWatchlist(org, null, { target_type: "country", target_id: "AE" })).rejects.toMatchObject({ code: "monitor_limit" });
    await expect(getOwnedWatchlist(other, first.row.id)).rejects.toMatchObject({ status: 404 });
  });
  it("applies manual activation and expiry immediately without deleting saved data", async () => {
    const db = await getDb();
    await db.insert(organizationEntitlements).values({ organizationId: org, plan: "founding", validUntil: new Date(Date.now() + 86_400_000) });
    expect((await getEntitlement(org)).limits.apiRequests).toBe(10_000);
    expect(await consumeApiAllowance(org, "key-a", null)).toBe(true);
    const watch = await createWatchlist(org, null, { target_type: "country", target_id: "AE", channel_email: true });
    expect(watch.row.channelEmail).toBe(true);
    await db.update(organizationEntitlements).set({ validUntil: new Date(Date.now() - 1000) }).where(eq(organizationEntitlements.organizationId, org));
    expect((await getEntitlement(org)).plan).toBe("free");
    expect(await consumeApiAllowance(org, "key-a", null)).toBe(false);
    expect((await getOwnedWatchlist(org, watch.row.id)).id).toBe(watch.row.id);
  });
});
