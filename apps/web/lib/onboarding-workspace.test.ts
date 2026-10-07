import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import path from "node:path";
import { OnboardingAnswers } from "@railor/types";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("server-only", () => ({}));
vi.mock("@railor/database", async original => ({
  ...await original<typeof import("@railor/database")>(),
  getDb: async () => state.db, ensureMigrated: async () => undefined,
}));
const database = await import("@railor/database");
const { createOrganizationForUser, saveOnboarding, materializeWorkspace } = await import("./org");
const client = new PGlite();
beforeAll(async () => {
  state.db = drizzle(client, { schema: database.schema });
  await migrate(state.db, { migrationsFolder: path.resolve("../../packages/database/drizzle") });
  await state.db.insert(database.countries).values([
    { code: "IN", name: "India", region: "Asia", flag: "IN" }, { code: "AE", name: "United Arab Emirates", region: "Asia", flag: "AE" },
  ]);
}, 30000);
afterAll(async () => { await client.close(); });

describe("onboarding workspace persistence", () => {
  it.each([
    ["personal", "individual"], ["freelancer", "individual"], ["freelancer_business", "business"], ["payments", "business"],
  ] as const)("resumes %s and materializes %s suggestions", async (building, customerType) => {
    const [user] = await state.db.insert(database.users).values({ email: `${building}@test.invalid` }).returning();
    const org = await createOrganizationForUser(user.id, user.email);
    const answers = OnboardingAnswers.parse({ building, entityCountry: "IN", targetCountries: ["AE"], settlementCurrencies: ["AED"], interests: ["bank_payouts"] });
    await saveOnboarding(org.id, answers, 3);
    const [resumed] = await state.db.select().from(database.organizations).where(eq(database.organizations.id, org.id));
    expect(resumed).toMatchObject({ building, onboardingStep: 3, entityCountry: "IN", settlementCurrencies: ["AED"] });
    expect(await materializeWorkspace(org.id, user.id, answers)).toBe(1);
    const [route] = await state.db.select().from(database.savedCorridors).where(eq(database.savedCorridors.organizationId, org.id));
    expect(route.query).toMatchObject({ customerType, entityCountry: "IN", destinationCountry: "AE", destinationCurrency: "AED" });
    const [finished] = await state.db.select().from(database.organizations).where(eq(database.organizations.id, org.id));
    expect(finished.onboardingCompletedAt).toBeInstanceOf(Date);
    expect(finished.onboardingStep).toBe(5);
  });
});
