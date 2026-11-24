import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PriceRow } from "@railor/core";

const state = vi.hoisted(() => ({ db: null as any, rows: [] as PriceRow[], fail: false, sent: [] as any[], mailOk: true }));
vi.mock("server-only", () => ({}));
vi.mock("@railor/database", async (original) => ({ ...await original<typeof import("@railor/database")>(), getDb: async () => state.db }));
vi.mock("./pricing", () => ({
  runPriceCheck: vi.fn(async () => { if (state.fail) throw new Error("down"); return { rows: state.rows }; }),
  resolvePriceInput: vi.fn(async (params: Record<string, string>) => ({ from: params.from, to: params.to, amount: Number(params.amount), market: false, context: { profile: "freelancer", country: "IN", direction: "receive", purpose: "services", paymentMethod: "local_bank" } })),
}));
vi.mock("./mail", () => ({
  smtpConfigured: () => true,
  sendMail: vi.fn(async (message: unknown) => { state.sent.push(message); return state.mailOk ? { sent: true } : { sent: false, error: "send_failed" }; }),
}));
vi.mock("./security", () => ({ appOrigin: () => "https://www.railor.xyz" }));

const database = await import("@railor/database");
const alerts = await import("./rate-alerts");
const pricing = await import("./pricing");
const client = new PGlite();

const row = (slug: string, recipientAmount: number, extra: Partial<PriceRow> = {}): PriceRow => ({
  providerSlug: slug, providerName: slug[0]!.toUpperCase() + slug.slice(1), basis: "published", recipientAmount, feeAmount: 1, feeCurrency: "USD",
  rate: 93, totalCostPct: 0.5, partial: false, delivery: null, observedAt: "2026-11-24T00:00:00Z", source: { label: slug }, notes: [], ...extra,
});

async function savedPair(query: Record<string, unknown> = { kind: "price_pair", from: "USD", to: "INR", amount: 1000 }) {
  const [org] = await state.db.insert(database.organizations).values({ name: "Alerts", slug: `alerts-${randomUUID().slice(0, 8)}` }).returning();
  const [user] = await state.db.insert(database.users).values({ email: `${randomUUID().slice(0, 8)}@test.invalid` }).returning();
  const [saved] = await state.db.insert(database.savedSearches).values({ organizationId: org.id, createdBy: user.id, input: "USD → INR", query }).returning();
  return { workspace: { organizationId: org.id as string, userId: user.id as string }, savedId: saved.id as string, email: user.email as string };
}

const alertRow = async (savedId: string) => (await state.db.select().from(database.rateAlerts).where((await import("drizzle-orm")).eq(database.rateAlerts.savedSearchId, savedId)))[0];

beforeAll(async () => {
  state.db = drizzle(client, { schema: database.schema });
  await migrate(state.db, { migrationsFolder: path.resolve("../../packages/database/drizzle") });
}, 30000);
afterAll(async () => { await client.close(); });
beforeEach(async () => {
  state.rows = []; state.fail = false; state.sent = []; state.mailOk = true;
  // Each test checks only its own alerts.
  await state.db.update(database.rateAlerts).set({ active: false });
});

describe("setting an alert", () => {
  it("measures from today's best complete price and ignores estimates and partial rows", async () => {
    const { workspace, savedId } = await savedPair();
    state.rows = [row("skydo", 92_000), row("infinity", 93_000), row("market:remitly", 99_000, { basis: "market_estimate" }), row("wise", 98_000, { partial: true })];
    const result = await alerts.setRateAlert(workspace, savedId, 1);
    expect(result).toMatchObject({ ok: true, alert: { baselineAmount: 93_000, targetAmount: 93_930, currency: "INR", lastBestProvider: "Infinity" } });
    expect(vi.mocked(pricing.runPriceCheck)).toHaveBeenLastCalledWith(workspace.organizationId, expect.objectContaining({ sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000, includeMarket: false }));
    const listed = await alerts.listSavedPairsWithAlerts(workspace.organizationId, workspace.userId);
    expect(listed[0]?.alert).toMatchObject({ targetAmount: 93_930 });
  });

  it("refuses an unknown step, an unsaved pair, and a pair with no complete price", async () => {
    const { workspace, savedId } = await savedPair();
    expect(await alerts.setRateAlert(workspace, savedId, 7)).toMatchObject({ ok: false });
    expect(await alerts.setRateAlert(workspace, randomUUID(), 1)).toMatchObject({ ok: false, error: "Save this transfer first." });
    state.rows = [row("wise", 98_000, { partial: true })];
    expect(await alerts.setRateAlert(workspace, savedId, 1)).toMatchObject({ ok: false, error: expect.stringContaining("has a complete price") });
  });

  it("keeps the unsubscribe token when an alert is changed, and removes it on request", async () => {
    const { workspace, savedId } = await savedPair();
    state.rows = [row("infinity", 93_000)];
    await alerts.setRateAlert(workspace, savedId, 0.5);
    const token = (await alertRow(savedId)).unsubscribeToken;
    await alerts.setRateAlert(workspace, savedId, 2);
    expect(await alertRow(savedId)).toMatchObject({ unsubscribeToken: token, targetAmount: 94_860 });
    await alerts.removeRateAlert(workspace.organizationId, workspace.userId, savedId);
    expect(await alertRow(savedId)).toBeUndefined();
  });
});

describe("checking alerts", () => {
  it("emails once when the target is reached, then waits for it to drop and return", async () => {
    const { workspace, savedId, email } = await savedPair();
    state.rows = [row("infinity", 93_000)];
    await alerts.setRateAlert(workspace, savedId, 1);

    expect(await alerts.checkRateAlerts()).toMatchObject({ alerts: 1, checks: 1, notified: 0 });
    state.rows = [row("infinity", 93_000), row("skydo", 94_000)];
    expect(await alerts.checkRateAlerts()).toMatchObject({ notified: 1 });
    expect(state.sent[0]).toMatchObject({ to: email, subject: expect.stringContaining("INR 94,000.00") });
    expect(state.sent[0].text).toContain("https://www.railor.xyz/api/alerts/unsubscribe?token=");
    expect(state.sent[0].headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(await alertRow(savedId)).toMatchObject({ lastMet: true, lastBestAmount: 94_000, lastBestProvider: "Skydo" });

    // Still above target: no second email.
    expect(await alerts.checkRateAlerts()).toMatchObject({ notified: 0 });
    // Drops, then returns within a day: the cooldown holds it back.
    state.rows = [row("infinity", 93_000)];
    await alerts.checkRateAlerts();
    state.rows = [row("skydo", 95_000)];
    expect(await alerts.checkRateAlerts()).toMatchObject({ notified: 0 });
  });

  it("checks a shared transfer once, retries a failed email, and leaves alerts alone when prices are down", async () => {
    const { workspace, savedId } = await savedPair();
    state.rows = [row("infinity", 93_000)];
    await alerts.setRateAlert(workspace, savedId, 0.5);
    state.fail = true;
    expect(await alerts.checkRateAlerts()).toMatchObject({ failedChecks: 1, notified: 0 });
    state.fail = false;
    state.mailOk = false;
    state.rows = [row("skydo", 96_000)];
    expect(await alerts.checkRateAlerts()).toMatchObject({ failedEmails: 1 });
    expect(await alertRow(savedId)).toMatchObject({ lastMet: false, lastNotifiedAt: null });
    state.mailOk = true;
    expect(await alerts.checkRateAlerts()).toMatchObject({ notified: 1 });
  });

  it("watches only the saved provider on a provider corridor", async () => {
    const context = { profile: "freelancer", country: "IN", direction: "receive", purpose: "services", paymentMethod: "local_bank" };
    const { workspace, savedId } = await savedPair({ kind: "price_pair", from: "USD", to: "INR", amount: 1000, context, provider: { slug: "skydo", name: "Skydo" } });
    state.rows = [row("infinity", 95_000), row("skydo", 92_000)];
    expect(await alerts.setRateAlert(workspace, savedId, 1)).toMatchObject({ ok: true, alert: { baselineAmount: 92_000 } });
    state.rows = [row("infinity", 99_000), row("skydo", 92_500)];
    expect(await alerts.checkRateAlerts()).toMatchObject({ notified: 0 });
    state.rows = [row("infinity", 99_000), row("skydo", 93_000)];
    expect(await alerts.checkRateAlerts()).toMatchObject({ notified: 1 });
    expect(state.sent[0].subject).toContain("Skydo · USD → INR");
  });

  it("stops an alert from its unsubscribe token", async () => {
    const { workspace, savedId } = await savedPair();
    state.rows = [row("infinity", 93_000)];
    await alerts.setRateAlert(workspace, savedId, 1);
    const { unsubscribeToken } = await alertRow(savedId);
    expect(await alerts.unsubscribeRateAlert(unsubscribeToken)).toEqual({ label: "USD → INR" });
    expect(await alertRow(savedId)).toMatchObject({ active: false });
    expect(await alerts.unsubscribeRateAlert("nope")).toBeNull();
    expect((await alerts.listSavedPairsWithAlerts(workspace.organizationId, workspace.userId))[0]?.alert).toBeUndefined();
  });
});

describe("plan limits", () => {
  async function secondPair(organizationId: string, userId: string, to: string) {
    const [saved] = await state.db.insert(database.savedSearches).values({ organizationId, createdBy: userId, input: `USD → ${to}`, query: { kind: "price_pair", from: "USD", to, amount: 1000 } }).returning();
    return saved.id as string;
  }

  it("gives a free workspace one alert, and lets it change that one", async () => {
    const { workspace, savedId } = await savedPair();
    state.rows = [row("infinity", 93_000)];
    expect(await alerts.setRateAlert(workspace, savedId, 1)).toMatchObject({ ok: true });
    expect(await alerts.setRateAlert(workspace, savedId, 2)).toMatchObject({ ok: true });
    const other = await secondPair(workspace.organizationId, workspace.userId, "EUR");
    const refused = await alerts.setRateAlert(workspace, other, 1);
    expect(refused).toMatchObject({ ok: false, limit: true, error: expect.stringContaining("upgrade to Plus ($2.99 a month) for 10") });
  });

  it("gives Plus ten, and keeps only the oldest running after a downgrade", async () => {
    const { workspace, savedId } = await savedPair();
    const until = new Date(Date.now() + 86_400_000);
    await state.db.insert(database.organizationEntitlements).values({ organizationId: workspace.organizationId, plan: "plus", validUntil: until });
    state.rows = [row("infinity", 93_000)];
    const ids = [savedId, ...await Promise.all(["EUR", "GBP", "AED"].map((to) => secondPair(workspace.organizationId, workspace.userId, to)))];
    for (const id of ids) expect(await alerts.setRateAlert(workspace, id, 0.5)).toMatchObject({ ok: true });

    await state.db.update(database.organizationEntitlements).set({ validUntil: new Date(Date.now() - 1000) });
    state.rows = [row("infinity", 99_000)];
    const run = await alerts.checkRateAlerts();
    expect(run).toMatchObject({ alerts: 4, overLimit: 3, notified: 1 });
  });
});
