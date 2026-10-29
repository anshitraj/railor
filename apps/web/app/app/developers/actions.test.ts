import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import path from "node:path";
const state = vi.hoisted(() => ({ db: null as any, role: "owner", orgId: "", userId: "" }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@railor/database", async original => ({ ...await original<typeof import("@railor/database")>(), getDb: async () => state.db }));
vi.mock("../../../lib/auth", () => ({ requireSession: async () => ({ organization: { id: state.orgId }, user: { id: state.userId }, role: state.role }), hashApiKey: (value: string) => createHash("sha256").update(value).digest("hex") }));
vi.mock("../../../lib/org", () => ({ createApiKey: vi.fn() }));
const database = await import("@railor/database");
const { regenerateKey, revokeKey } = await import("./actions");
const client = new PGlite(); let otherOrg: string;
beforeAll(async () => {
  state.db = drizzle(client, { schema: database.schema });
  await migrate(state.db, { migrationsFolder: path.resolve("../../packages/database/drizzle") });
  const orgs = await state.db.insert(database.organizations).values([{ name: "Key test A", slug: "key-fixture-a" }, { name: "Key test B", slug: "key-fixture-b" }]).returning();
  state.orgId = orgs[0].id; otherOrg = orgs[1].id;
  const [user] = await state.db.insert(database.users).values({ email: "key-fixture@test.invalid" }).returning(); state.userId = user.id;
}, 30000);
afterAll(async () => { await client.close(); });
beforeEach(() => { state.role = "owner"; });
const seed = async (org = state.orgId, mode = "live") => (await state.db.insert(database.apiKeys).values({ organizationId: org, label: "Fixture only", mode, prefix: "rail_test_x", keyHash: crypto.randomUUID(), monthlyRequestCap: 71 }).returning())[0];
describe("primary API key replacement", () => {
  it("replaces only the selected key and preserves mode, cap and one-time live storage", async () => {
    const old = await seed(); const unrelated = await seed(); const result = await regenerateKey(old.id);
    expect(result.ok).toBe(true); if (!result.ok) throw new Error(result.error);
    const [replacement] = await state.db.select().from(database.apiKeys).where(eq(database.apiKeys.id, result.id));
    expect(replacement).toMatchObject({ mode: "live", monthlyRequestCap: 71, revealableSecret: null, keyHash: createHash("sha256").update(result.secret).digest("hex") });
    const rows = await state.db.select().from(database.apiKeys);
    expect(rows.find((key: any) => key.id === old.id).revokedAt).toBeInstanceOf(Date);
    expect(rows.find((key: any) => key.id === unrelated.id).revokedAt).toBeNull();
    expect(await regenerateKey(old.id)).toMatchObject({ ok: false });
  });
  it("preserves revealable test keys and prevents cross-workspace mutations", async () => {
    const old = await seed(state.orgId, "test"); const result = await regenerateKey(old.id);
    expect(result.ok).toBe(true); if (!result.ok) throw new Error(result.error);
    const [replacement] = await state.db.select().from(database.apiKeys).where(eq(database.apiKeys.id, result.id));
    expect(replacement.revealableSecret).toBe(result.secret);
    const other = await seed(otherOrg); expect(await regenerateKey(other.id)).toMatchObject({ ok: false }); expect(await revokeKey(other.id)).toMatchObject({ ok: false });
  });
  it.each(["viewer", "member"])("rejects key replacement and revocation for %s", async role => {
    const key = await seed(); state.role = role;
    expect(await regenerateKey(key.id)).toMatchObject({ ok: false, error: "insufficient_role" });
    expect(await revokeKey(key.id)).toMatchObject({ ok: false, error: "insufficient_role" });
    const [unchanged] = await state.db.select().from(database.apiKeys).where(eq(database.apiKeys.id, key.id)); expect(unchanged.revokedAt).toBeNull();
  });
});
