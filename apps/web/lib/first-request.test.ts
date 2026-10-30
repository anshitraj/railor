/** Complete application flow in-process; no production DB, inbox or HTTP server. */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import path from "node:path";
const state = vi.hoisted(() => ({ db: null as any, cookies: new Map<string, { value: string; options: Record<string, unknown> }>() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", async original => ({ ...await original<typeof import("next/cache")>(), revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (key: string) => state.cookies.get(key),
  set: (key: string, value: string, options: Record<string, unknown>) => state.cookies.set(key, { value, options }),
}) }));
vi.mock("@railor/database", async original => ({ ...await original<typeof import("@railor/database")>(), getDb: async () => state.db, ensureMigrated: async () => undefined }));
const db = await import("@railor/database");
const auth = await import("./auth");
const { GET: verify } = await import("../app/auth/verify/route");
const { completeOnboarding } = await import("../app/welcome/actions");
const { revokeKey } = await import("../app/app/developers/actions");
const { POST: search } = await import("../app/v1/corridors/search/route");
const { developerExampleQuery } = await import("./developer-setup");
const client = new PGlite();

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("APP_ORIGIN", "https://www.railor.xyz");
  state.db = drizzle(client, { schema: db.schema });
  await migrate(state.db, { migrationsFolder: path.resolve("../../packages/database/drizzle") });
  await state.db.insert(db.countries).values([
    { code: "IN", name: "India", region: "Asia", flag: "IN" },
    { code: "AE", name: "United Arab Emirates", region: "Asia", flag: "AE" },
  ]);
}, 30000);
afterEach(() => state.cookies.clear());
afterAll(async () => { await client.close(); vi.unstubAllEnvs(); });

describe("sign-in to the first authenticated API request", () => {
  it.each([["personal", "individual"], ["freelancer", "individual"], ["payments", "business"]] as const)("keeps a %s workspace's identity and enforces its key limits", async (building, customerType) => {
    const link = await auth.createMagicLink(`${building}-flow@test.invalid`, "/app/developers");
    const signedIn = await verify(new Request(link.url));
    expect(signedIn.status).toBe(307);
    expect(signedIn.headers.get("location")).toBe("https://www.railor.xyz/welcome?next=%2Fapp%2Fdevelopers");
    expect(state.cookies.get("railor_session")?.options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax" });
    expect((await verify(new Request(link.url))).headers.get("location")).toContain("error=expired");

    expect(await completeOnboarding({ building, entityCountry: "IN", targetCountries: ["AE"], settlementCurrencies: ["AED"], interests: ["bank_payouts"] }, "/app/developers")).toEqual({ destination: "/app/developers" });
    const session = await auth.getSession();
    expect(session?.organization?.onboardingCompletedAt).toBeInstanceOf(Date);
    const org = session!.organization!;
    const [key] = await state.db.select().from(db.apiKeys).where(eq(db.apiKeys.organizationId, org.id));
    expect(key.mode).toBe("test"); expect(Boolean(key.revealableSecret)).toBe(true);
    const [route] = await state.db.select().from(db.savedCorridors).where(eq(db.savedCorridors.organizationId, org.id));
    const query = developerExampleQuery(org, { ...route.query, namedRail: "SWIFT", endpointType: "bank_account" });
    const request = () => new Request("https://www.railor.xyz/v1/corridors/search", { method: "POST", headers: { Authorization: `Bearer ${key.revealableSecret}`, "Content-Type": "application/json" }, body: JSON.stringify(query) });
    const response = await search(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ object: "corridor_search", query: { customer_type: customerType, entity_country: "IN", destination_country: "AE", destination_currency: "AED", named_rail: "SWIFT", endpoint_type: "bank_account" } });
    const [usedKey] = await state.db.select().from(db.apiKeys).where(eq(db.apiKeys.id, key.id));
    expect(usedKey.lastUsedAt).toBeInstanceOf(Date);
    const usage = await state.db.select().from(db.apiUsage).where(eq(db.apiUsage.apiKeyId, key.id));
    expect(usage).toHaveLength(1); expect(usage[0]).toMatchObject({ status: 200, endpoint: "/v1/corridors/search" });

    await state.db.update(db.apiKeys).set({ monthlyRequestCap: 1 }).where(eq(db.apiKeys.id, key.id));
    const capped = await search(request()); expect(capped.status).toBe(429);
    expect(await capped.json()).toMatchObject({ error: { code: "quota_exceeded" } });
    expect(await revokeKey(key.id)).toMatchObject({ ok: true });
    const revoked = await search(request()); expect(revoked.status).toBe(401);
    expect(await revoked.json()).toMatchObject({ error: { code: "invalid_api_key" } });
  });
});
