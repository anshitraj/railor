import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("server-only", () => ({}));
vi.mock("@railor/database", async (original) => ({ ...await original<typeof import("@railor/database")>(), getDb: async () => state.db }));
const database = await import("@railor/database");
const { getPaymentHistorySummary } = await import("./payment-history");
const client = new PGlite();
let orgA: string, orgB: string, emptyOrg: string;

beforeAll(async () => {
  state.db = drizzle(client, { schema: database.schema });
  await migrate(state.db, { migrationsFolder: path.resolve("../../packages/database/drizzle") });
  const orgs = await state.db.insert(database.organizations).values([
    { name: "History fixture A", slug: "history-fixture-a" }, { name: "History fixture B", slug: "history-fixture-b" }, { name: "Empty history fixture", slug: "history-fixture-empty" },
  ]).returning();
  [orgA, orgB, emptyOrg] = orgs.map((org: { id: string }) => org.id);
  const [recipient] = await state.db.insert(database.beneficiaries).values({ organizationId: orgA, label: "Synthetic recipient", holderType: "business", holderName: "Fixture only", country: "IN", currency: "INR", method: "in_bank", displayHint: "•••• 1234", encryptedDetails: "test-only-not-an-account", fingerprint: "fixture" }).returning();
  const recent = new Date(Date.now() - 86_400_000), old = new Date(Date.now() - 45 * 86_400_000);
  const row = (organizationId: string, mode: "test" | "live", status: string, createdAt = recent, sourceCurrency = "USD") => ({ organizationId, mode, status, createdAt, beneficiaryId: recipient.id, intent: {}, amount: "1000", sourceCurrency, destinationCurrency: "INR", destinationCountry: "IN" });
  await state.db.insert(database.payments).values([
    row(orgA, "test", "completed"), row(orgA, "test", "completed", recent, "EUR"), row(orgA, "test", "completed", old),
    ...["failed", "returned", "blocked", "cancelled", "ready", "requires_approval", "submitting", "awaiting_funds", "unknown"].map((status) => row(orgA, "test", status)),
    row(orgA, "test", "processing", old), row(orgA, "live", "completed"), row(orgA, "live", "processing"), row(orgB, "test", "failed"),
  ]);
  const providers = await state.db.insert(database.providers).values([
    { name: "Fixture provider A", slug: "history-fixture-a", category: "Payout", description: "Synthetic history fixture" }, { name: "Fixture provider B", slug: "history-fixture-b", category: "Payout", description: "Synthetic history fixture" },
  ]).returning();
  await state.db.insert(database.providerConnections).values([
    { organizationId: orgA, providerId: providers[0].id, environment: "sandbox", status: "connected" },
    { organizationId: orgA, providerId: providers[1].id, environment: "sandbox", status: "disconnected" },
    { organizationId: orgA, providerId: providers[1].id, environment: "production", status: "connected" },
    { organizationId: orgB, providerId: providers[0].id, environment: "sandbox", status: "connected" },
    { organizationId: orgB, providerId: providers[1].id, environment: "sandbox", status: "connected" },
  ]);
}, 30000);
afterAll(async () => { await client.close(); });

describe("payment history counts", () => {
  it("keeps all-time filters and open records distinct from the 30-day cohort", async () => {
    const result = await getPaymentHistorySummary(orgA, "test");
    expect(result).toMatchObject({ total: 13, completed: 2, open: 6, successRate: 50 });
    expect(result.counts).toMatchObject({ completed: 3, submitting: 1, requires_approval: 1, processing: 1 });
  });
  it("isolates workspaces and environments", async () => {
    expect(await getPaymentHistorySummary(orgA, "live")).toMatchObject({ total: 2, completed: 1, open: 1, successRate: 100 });
    expect(await getPaymentHistorySummary(orgB, "test")).toMatchObject({ total: 1, completed: 0, open: 0, successRate: 0, connectedProviders: 2 });
  });
  it("counts unique connected providers in the selected environment", async () => {
    expect((await getPaymentHistorySummary(orgA, "test")).connectedProviders).toBe(1);
    expect((await getPaymentHistorySummary(orgA, "live")).connectedProviders).toBe(1);
  });
  it("shows no success rate for an empty history", async () => {
    expect(await getPaymentHistorySummary(emptyOrg, "test")).toEqual({ counts: {}, total: 0, completed: 0, open: 0, connectedProviders: 0, successRate: null });
  });
});
