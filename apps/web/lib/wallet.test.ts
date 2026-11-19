import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import { randomUUID } from "node:crypto";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("server-only", () => ({}));
vi.mock("@railor/database", async (original) => ({ ...await original<typeof import("@railor/database")>(), getDb: async () => state.db }));
const database = await import("@railor/database");
const wallet = await import("./wallet");
const options = await import("./wallet-options");
const client = new PGlite();

async function workspace(label: string) {
  const [org] = await state.db.insert(database.organizations).values({ name: label, slug: `wallet-${randomUUID().slice(0, 8)}` }).returning();
  const [user] = await state.db.insert(database.users).values({ email: `${randomUUID().slice(0, 8)}@test.invalid` }).returning();
  return { org: org.id as string, user: user.id as string };
}

beforeAll(async () => {
  state.db = drizzle(client, { schema: database.schema });
  await migrate(state.db, { migrationsFolder: path.resolve("../../packages/database/drizzle") });
  await state.db.insert(database.walletPromoCodes).values({ code: "WEB-TEST", amountCents: 1000, label: "Web test" });
}, 30000);
afterAll(async () => { await client.close(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("signup credit on first visit", () => {
  it("grants $5.00 once across reloads and concurrent page loads", async () => {
    const { org, user } = await workspace("First visit");
    const results = await Promise.all(Array.from({ length: 5 }, () => wallet.shellWalletBalance(org, user)));
    expect(results).toEqual([500, 500, 500, 500, 500]);
    expect(await wallet.shellWalletBalance(org, user)).toBe(500);
    const entries = await wallet.listWalletEntries(org, "all");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "signup_credit", label: "Signup credit", amountCents: 500, status: "completed" });
  });

  it("shows the balance as the sum of history", async () => {
    const { org, user } = await workspace("Sum");
    await wallet.ensureWallet(org, user);
    await wallet.addTestTopUp(org, user, 2500, randomUUID());
    await wallet.redeemPromo(org, user, "web-test");
    const totals = await wallet.ensureWallet(org, user);
    const entries = await wallet.listWalletEntries(org, "all");
    expect(totals.balanceCents).toBe(entries.reduce((sum, e) => sum + e.amountCents, 0));
    expect(totals).toMatchObject({ balanceCents: 4000, addedCents: 2500, creditsCents: 1500, usedCents: 0 });
    expect(entries.map((e) => e.kind)).toEqual(["promo_credit", "top_up", "signup_credit"]);
  });
});

describe("history ranges", () => {
  it("filters by date and parses only known ranges", async () => {
    const { org, user } = await workspace("Ranges");
    await wallet.ensureWallet(org, user);
    await client.query(`insert into wallet_entries (organization_id, kind, amount_cents, label, idempotency_key, created_at) values ($1, 'refund', 100, 'Old refund', 'old', now() - interval '45 days')`, [org]);
    expect((await wallet.listWalletEntries(org, "all")).map((e) => e.label)).toEqual(["Signup credit", "Old refund"]);
    expect((await wallet.listWalletEntries(org, "30d")).map((e) => e.label)).toEqual(["Signup credit"]);
    expect((await wallet.listWalletEntries(org, "90d")).map((e) => e.label)).toEqual(["Signup credit", "Old refund"]);
    expect(options.parseWalletRange("30d")).toBe("30d");
    expect(options.parseWalletRange("constructor")).toBe("all");
    expect(options.parseWalletRange(undefined)).toBe("all");
    expect(options.walletRangeStart("year", new Date("2026-11-19T10:00:00Z"))?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("promo codes", () => {
  it("explains each outcome in plain words", async () => {
    const { org, user } = await workspace("Promo");
    expect(await wallet.redeemPromo(org, user, "WEB-TEST")).toEqual({ ok: true, amountCents: 1000, message: "$10.00 added to your wallet." });
    expect(await wallet.redeemPromo(org, user, "WEB-TEST")).toEqual({ ok: false, message: "This workspace has already used that code." });
    expect(await wallet.redeemPromo(org, user, "nope")).toMatchObject({ ok: false, message: expect.stringContaining("isn’t valid") });
  });
});

describe("test top-ups", () => {
  it("adds money once per request and only offered amounts", async () => {
    const { org, user } = await workspace("Top-up");
    const requestId = randomUUID();
    await Promise.all([wallet.addTestTopUp(org, user, 1000, requestId), wallet.addTestTopUp(org, user, 1000, requestId)]);
    expect((await wallet.ensureWallet(org, user)).addedCents).toBe(1000);
    await expect(wallet.addTestTopUp(org, user, 1234, randomUUID())).rejects.toThrow(/listed amounts/);
    await expect(wallet.addTestTopUp(org, user, 1000, "not-a-uuid")).rejects.toThrow(/Refresh/);
  });

  it("is off in production unless explicitly enabled", async () => {
    const { org, user } = await workspace("Prod");
    vi.stubEnv("NODE_ENV", "production");
    expect(wallet.walletTestModeEnabled()).toBe(false);
    await expect(wallet.addTestTopUp(org, user, 1000, randomUUID())).rejects.toBeInstanceOf(wallet.WalletInputError);
    vi.stubEnv("RAILOR_WALLET_TEST_MODE", "true");
    expect(wallet.walletTestModeEnabled()).toBe(true);
  });
});

describe("auto-reload", () => {
  it("is off by default and saves only listed choices", async () => {
    const { org, user } = await workspace("Auto");
    expect(await wallet.getAutoReload(org)).toEqual({ enabled: false, thresholdCents: 500, amountCents: 2500 });
    await wallet.saveAutoReload(org, user, { enabled: true, thresholdCents: 1000, amountCents: 5000 });
    expect(await wallet.getAutoReload(org)).toEqual({ enabled: true, thresholdCents: 1000, amountCents: 5000 });
    await wallet.saveAutoReload(org, user, { enabled: false, thresholdCents: 1000, amountCents: 5000 });
    expect((await wallet.getAutoReload(org)).enabled).toBe(false);
    await expect(wallet.saveAutoReload(org, user, { enabled: true, thresholdCents: 1, amountCents: 5000 })).rejects.toThrow(/listed balances/);
    await expect(wallet.saveAutoReload(org, user, { enabled: true, thresholdCents: 500, amountCents: 999999 })).rejects.toThrow(/listed amounts/);
  });
});

describe("metered usage hook", () => {
  it("charges nothing while an action has no price", async () => {
    const { org, user } = await workspace("Unmetered");
    await wallet.ensureWallet(org, user);
    expect(Object.values(wallet.WALLET_USAGE_PRICE_CENTS).every((price) => price === null)).toBe(true);
    expect(await wallet.chargeWalletUsage(org, "price_check", { idempotencyKey: "r1" })).toEqual({ charged: false, reason: "not_metered" });
    expect((await wallet.ensureWallet(org, user)).balanceCents).toBe(500);
  });

  it("debits once per unit of work and stops at zero when a price is set", async () => {
    const { org, user } = await workspace("Metered");
    await wallet.ensureWallet(org, user);
    const prices = { ...wallet.WALLET_USAGE_PRICE_CENTS, price_check: 200 };
    expect(await wallet.chargeWalletUsage(org, "price_check", { idempotencyKey: "req-1", prices })).toMatchObject({ charged: true, amountCents: 200, balanceCents: 300 });
    expect(await wallet.chargeWalletUsage(org, "price_check", { idempotencyKey: "req-1", prices })).toMatchObject({ charged: true, balanceCents: 300 });
    expect(await wallet.chargeWalletUsage(org, "price_check", { idempotencyKey: "req-2", units: 2, prices })).toEqual({ charged: false, reason: "insufficient_balance", balanceCents: 300 });
    const [latest] = await wallet.listWalletEntries(org, "all");
    expect(latest).toMatchObject({ kind: "usage", label: "Price check", amountCents: -200 });
    expect((await wallet.ensureWallet(org, user)).usedCents).toBe(200);
  });
});

describe("formatting", () => {
  it("formats cents and choices", () => {
    expect(options.formatCents(500)).toBe("$5.00");
    expect(options.formatCents(-200, { signed: true })).toBe("−$2.00");
    expect(options.formatCents(2500, { signed: true })).toBe("+$25.00");
    expect(options.formatChoice(10000)).toBe("$100");
    expect(options.formatChoice(250)).toBe("$2.50");
  });
});
