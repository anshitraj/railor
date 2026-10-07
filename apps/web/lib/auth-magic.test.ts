import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";

const state = vi.hoisted(() => ({ db: null as any, cookies: new Map<string, { value: string; options: Record<string, unknown> }>() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (key: string) => state.cookies.get(key),
  set: (key: string, value: string, options: Record<string, unknown>) => state.cookies.set(key, { value, options }),
}) }));
vi.mock("@railor/database", async original => ({
  ...await original<typeof import("@railor/database")>(),
  getDb: async () => state.db, ensureMigrated: async () => undefined,
}));
const database = await import("@railor/database");
const auth = await import("./auth");
const client = new PGlite();

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_ORIGIN", "https://www.railor.xyz");
  state.db = drizzle(client, { schema: database.schema });
  await migrate(state.db, { migrationsFolder: path.resolve("../../packages/database/drizzle") });
}, 30000);
afterEach(() => state.cookies.clear());
afterAll(async () => { await client.close(); vi.unstubAllEnvs(); });

describe("magic-link sessions against an isolated database", () => {
  it("creates a first-time user and a secure session, then refuses reuse", async () => {
    const link = await auth.createMagicLink("first-login@test.invalid", "/app");
    expect(new URL(link.url).origin).toBe("https://www.railor.xyz");
    const result = await auth.consumeMagicLink(link.token);
    expect(result).toMatchObject({ user: { email: "first-login@test.invalid" }, returnTo: "/app" });
    expect(state.cookies.get("railor_session")).toMatchObject({ options: { httpOnly: true, secure: true, sameSite: "lax", path: "/" } });
    expect(await auth.consumeMagicLink(link.token)).toBeNull();
  });

  it("refuses expired links without issuing a session", async () => {
    await state.db.insert(database.magicLinks).values({ token: "expired-fixture", email: "expired@test.invalid", expiresAt: new Date(Date.now() - 1000), returnTo: "/app" });
    expect(await auth.consumeMagicLink("expired-fixture")).toBeNull();
    expect(state.cookies.has("railor_session")).toBe(false);
  });

  it("allows only one concurrent consumption and keeps external redirects out", async () => {
    const link = await auth.createMagicLink("concurrent@test.invalid", "https://other.invalid");
    const results = await Promise.all([auth.consumeMagicLink(link.token), auth.consumeMagicLink(link.token)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.find(Boolean)?.returnTo).toBe("/welcome");
  });
});
