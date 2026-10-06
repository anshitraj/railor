import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("server-only", () => ({}));
vi.mock("@railor/database", async (original) => ({ ...await original<typeof import("@railor/database")>(), getDb: async () => state.db }));
const database = await import("@railor/database");
const { getConnectableProviders, getConnectionDirectory } = await import("./connections");
const client = new PGlite();
let organizationA: string;
let organizationB: string;

beforeAll(async () => {
  state.db = drizzle(client, { schema: database.schema });
  await migrate(state.db, { migrationsFolder: path.resolve("../../packages/database/drizzle") });
  const organizations = await state.db.insert(database.organizations).values([
    { name: "Connection fixture A", slug: "connection-fixture-a" },
    { name: "Connection fixture B", slug: "connection-fixture-b" },
  ]).returning();
  organizationA = organizations[0].id;
  organizationB = organizations[1].id;
  await state.db.insert(database.providers).values([
    { slug: "wise", name: "Wise", isDemo: false, category: "Payout", description: "Connection fixture" },
    { slug: "bridge", name: "Bridge", isDemo: false, category: "Payout", description: "Connection fixture" },
  ]);
  await state.db.insert(database.featureInterest).values([
    { feature: "provider_connection", email: "owner@fixture-a.test", organizationId: organizationA, providerRequested: "instarem" },
    { feature: "provider_connection", email: "owner@fixture-b.test", organizationId: organizationB, providerRequested: "monese" },
  ]);
}, 30000);
afterAll(async () => { await client.close(); });

describe("connection directory workspace boundary", () => {
  it("restores saved request state without exposing another workspace's requests", async () => {
    const a = await getConnectionDirectory(organizationA);
    expect(a.find((row) => row.provider.slug === "instarem")?.requested).toBe(true);
    expect(a.find((row) => row.provider.slug === "monese")?.requested).toBe(false);
    const b = await getConnectionDirectory(organizationB);
    expect(b.find((row) => row.provider.slug === "monese")?.requested).toBe(true);
    expect(b.find((row) => row.provider.slug === "instarem")?.requested).toBe(false);
  });

  it("adds discovery providers only to the UI, without creating credential records or changing API integrations", async () => {
    const directory = await getConnectionDirectory(organizationA);
    expect(directory.find((row) => row.provider.slug === "instarem")).toMatchObject({ provider: { id: null }, adapter: null, payout: null, connections: [] });
    expect(directory.find((row) => row.provider.slug === "wise")?.adapter).not.toBeNull();
    expect((await getConnectableProviders(organizationA)).map((row) => row.provider.slug).sort()).toEqual(["bridge", "wise"]);
    expect(await state.db.select().from(database.providerConnections)).toEqual([]);
  });
  it("preserves independent same-email requests across workspaces and deduplicates retries within one", async () => {
    const shared = { feature: "provider_connection", email: "shared@fixture.test", providerRequested: "skrill" };
    await state.db.insert(database.featureInterest).values([{ ...shared, organizationId: organizationA }, { ...shared, organizationId: organizationB }]);
    const duplicates = await state.db.insert(database.featureInterest).values({ ...shared, organizationId: organizationA }).onConflictDoNothing().returning();
    expect(duplicates).toEqual([]);
    expect((await getConnectionDirectory(organizationA)).find((row) => row.provider.slug === "skrill")?.requested).toBe(true);
    expect((await getConnectionDirectory(organizationB)).find((row) => row.provider.slug === "skrill")?.requested).toBe(true);
  });
});
