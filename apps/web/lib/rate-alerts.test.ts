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
  runPriceCheck: vi.fn(async () => { if (state.fail) throw new Error("down"); return { rows: state.rows, reference: { rate: 93, source: "Test", observedAt: "2026-11-24T00:00:00Z" } }; }),
  resolvePriceInput: vi.fn(async (params: Record<string, string>) => ({ from: params.from, to: params.to, amount: Number(params.amount), market: false, context: { profile: "freelancer", country: "IN", direction: "receive", purpose: "services", paymentMethod: "local_bank" } })),
}));
vi.mock("./mail", () => ({
  smtpConfigured: () => true,
  sendMail: vi.fn(async (message: unknown) => { state.sent.push(message); return state.mailOk ? { sent: true } : { sent: false, error: "send_failed" }; }),
}));
vi.mock("./security", () => ({ appOrigin: () => "https://www.railor.xyz" }));
// The chart is a picture drawn at send time; these tests are about who is emailed and when.
vi.mock("./emails/rate-chart", () => ({ renderRateChart: vi.fn(async () => Buffer.from("png")) }));
vi.mock("./rate-history", () => ({ loadRateHistory: vi.fn(async () => ({ source: "Test", points: [{ date: "2026-11-01", rate: 90 }, { date: "2026-11-02", rate: 91 }, { date: "2026-11-03", rate: 92 }] })) }));

const database = await import("@railor/database");
const alerts = await import("./rate-alerts");
const pricing = await import("./pricing");
const client = new PGlite();
const DAY = 86_400_000;

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
const at = (days: number) => () => new Date(Date.now() + days * DAY);
async function withPlan(organizationId: string, plan: "plus" | "pro") {
  await state.db.insert(database.organizationEntitlements).values({ organizationId, plan, validUntil: new Date(Date.now() + 40 * DAY) });
}

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

describe("turning updates on", () => {
  it("measures from today's best complete price, ignoring estimates and partial rows, and keeps the chosen frequency", async () => {
    const { workspace, savedId } = await savedPair();
    state.rows = [row("skydo", 92_000), row("infinity", 93_000), row("market:remitly", 99_000, { basis: "market_estimate" }), row("wise", 98_000, { partial: true })];
    const result = await alerts.setRateAlert(workspace, savedId, "weekly");
    expect(result).toMatchObject({ ok: true, alert: { frequency: "weekly", baselineAmount: 93_000, currency: "INR", lastBestProvider: "Infinity" } });
    expect(vi.mocked(pricing.runPriceCheck)).toHaveBeenLastCalledWith(workspace.organizationId, expect.objectContaining({ sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000, includeMarket: false }));
    expect((await alerts.listSavedPairsWithAlerts(workspace.organizationId, workspace.userId))[0]?.alert).toMatchObject({ frequency: "weekly" });
  });

  it("offers weekly to everyone, smart from Plus and daily from Pro, and says which plan unlocks the rest", async () => {
    const free = await savedPair();
    state.rows = [row("infinity", 93_000)];
    expect(await alerts.setRateAlert(free.workspace, free.savedId, "weekly")).toMatchObject({ ok: true });
    expect(await alerts.setRateAlert(free.workspace, free.savedId, "smart")).toMatchObject({ ok: false, error: expect.stringContaining("Smart updates are on Plus ($2.99 a month) and above") });
    expect(await alerts.setRateAlert(free.workspace, free.savedId, "daily")).toMatchObject({ ok: false, error: expect.stringContaining("Daily updates are on Pro") });

    const plus = await savedPair();
    await withPlan(plus.workspace.organizationId, "plus");
    expect(await alerts.setRateAlert(plus.workspace, plus.savedId, "smart")).toMatchObject({ ok: true, alert: { frequency: "smart" } });
    expect(await alerts.setRateAlert(plus.workspace, plus.savedId, "daily")).toMatchObject({ ok: false });

    const pro = await savedPair();
    await withPlan(pro.workspace.organizationId, "pro");
    expect(await alerts.setRateAlert(pro.workspace, pro.savedId, "daily")).toMatchObject({ ok: true, alert: { frequency: "daily" } });
  });

  it("refuses an unknown choice, an unsaved pair, and a pair with no complete price", async () => {
    const { workspace, savedId } = await savedPair();
    state.rows = [row("infinity", 93_000)];
    expect(await alerts.setRateAlert(workspace, savedId, "hourly" as never)).toMatchObject({ ok: false, error: expect.stringContaining("daily, weekly or smart") });
    expect(await alerts.setRateAlert(workspace, randomUUID(), "weekly")).toMatchObject({ ok: false, error: expect.stringContaining("Save this transfer first") });
    state.rows = [row("infinity", 93_000, { basis: "market_estimate" })];
    expect(await alerts.setRateAlert(workspace, savedId, "weekly")).toMatchObject({ ok: false, error: expect.stringContaining("nothing to measure from") });
  });

  it("keeps the unsubscribe token when the frequency is changed, and removes the alert on request", async () => {
    const { workspace, savedId } = await savedPair();
    await withPlan(workspace.organizationId, "plus");
    state.rows = [row("infinity", 93_000)];
    await alerts.setRateAlert(workspace, savedId, "weekly");
    const first = await alertRow(savedId);
    await alerts.setRateAlert(workspace, savedId, "smart");
    const second = await alertRow(savedId);
    expect(second.unsubscribeToken).toBe(first.unsubscribeToken);
    expect(second.frequency).toBe("smart");
    await alerts.removeRateAlert(workspace.organizationId, workspace.userId, savedId);
    expect(await alertRow(savedId)).toBeUndefined();
  });
});

describe("sending the updates", () => {
  it("emails a free workspace one weekly update, with the chart attached, and nothing in between", async () => {
    const { workspace, savedId, email } = await savedPair();
    state.rows = [row("infinity", 93_000), row("skydo", 92_500)];
    await alerts.setRateAlert(workspace, savedId, "weekly");
    state.rows = [row("infinity", 93_800), row("skydo", 92_500)];
    expect(await alerts.checkRateAlerts({ now: at(3) })).toMatchObject({ updates: 0 });
    expect(await alerts.checkRateAlerts({ now: at(7) })).toMatchObject({ updates: 1 });
    expect(state.sent[0]).toMatchObject({ to: email, subject: expect.stringContaining("INR 93,800.00") });
    expect(state.sent[0].attachments.some((item: { cid: string }) => item.cid === "rate-chart@mail.railor.xyz")).toBe(true);
    expect(state.sent[0].html).toContain("/go/infinity?from=USD&amp;to=INR&amp;amount=1000");
    expect(state.sent[0].headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(state.sent[0].text).toContain("https://www.railor.xyz/api/alerts/unsubscribe?token=");
    expect(await alerts.checkRateAlerts({ now: at(8) })).toMatchObject({ updates: 0 });
  });

  it("emails a smart update only when the best price moved", async () => {
    const { workspace, savedId } = await savedPair();
    await withPlan(workspace.organizationId, "plus");
    state.rows = [row("infinity", 93_000)];
    await alerts.setRateAlert(workspace, savedId, "smart");
    expect(await alerts.checkRateAlerts({ now: at(2) })).toMatchObject({ updates: 0 });
    state.rows = [row("infinity", 93_650)];
    expect(await alerts.checkRateAlerts({ now: at(3) })).toMatchObject({ updates: 1 });
    expect(state.sent[0].subject).toContain("best price up 0.70%");
    // The move is the new baseline: the same price a day later sends nothing.
    expect(await alerts.checkRateAlerts({ now: at(4) })).toMatchObject({ updates: 0 });
  });

  it("emails a Pro workspace a daily update that mentions WhatsApp as coming", async () => {
    const { workspace, savedId } = await savedPair();
    await withPlan(workspace.organizationId, "pro");
    state.rows = [row("infinity", 93_000)];
    await alerts.setRateAlert(workspace, savedId, "daily");
    expect(await alerts.checkRateAlerts({ now: at(1) })).toMatchObject({ updates: 1 });
    expect(state.sent[0].text).toContain("WhatsApp alerts are coming soon.");
    expect(await alerts.checkRateAlerts({ now: at(2) })).toMatchObject({ updates: 1 });
  });

  it("starts counting for an alert that has no baseline, retries a failed email, and leaves alerts alone when prices are down", async () => {
    const { workspace, savedId } = await savedPair();
    state.rows = [row("infinity", 93_000)];
    await alerts.setRateAlert(workspace, savedId, "weekly");
    await state.db.update(database.rateAlerts).set({ lastDigestAt: null, lastDigestAmount: null });
    expect(await alerts.checkRateAlerts({ now: at(30) })).toMatchObject({ updates: 0 });
    expect(await alertRow(savedId)).toMatchObject({ lastDigestAmount: 93_000 });

    state.mailOk = false;
    expect(await alerts.checkRateAlerts({ now: at(40) })).toMatchObject({ updates: 0, failedEmails: 1 });
    state.mailOk = true;
    expect(await alerts.checkRateAlerts({ now: at(41) })).toMatchObject({ updates: 1 });

    state.fail = true;
    const sentBefore = state.sent.length;
    expect(await alerts.checkRateAlerts({ now: at(60) })).toMatchObject({ failedChecks: 1, updates: 0 });
    expect(state.sent).toHaveLength(sentBefore);
  });

  it("watches only the saved provider on a provider corridor", async () => {
    const context = { profile: "freelancer", country: "IN", direction: "receive", purpose: "services", paymentMethod: "local_bank" };
    const { workspace, savedId } = await savedPair({ kind: "price_pair", from: "USD", to: "INR", amount: 1000, context, provider: { slug: "skydo", name: "Skydo" } });
    state.rows = [row("skydo", 92_000), row("infinity", 94_000)];
    expect(await alerts.setRateAlert(workspace, savedId, "weekly")).toMatchObject({ ok: true, alert: { lastBestProvider: "Skydo", baselineAmount: 92_000 } });
    await alerts.checkRateAlerts({ now: at(7) });
    expect(state.sent[0].subject).toContain("INR 92,000.00");
    expect(state.sent[0].html).not.toContain("Go to Infinity");
  });

  it("stops an alert from its unsubscribe token, and then sends nothing", async () => {
    const { workspace, savedId } = await savedPair();
    state.rows = [row("infinity", 93_000)];
    await alerts.setRateAlert(workspace, savedId, "weekly");
    const { unsubscribeToken } = await alertRow(savedId);
    expect(await alerts.unsubscribeRateAlert("short")).toBeNull();
    expect(await alerts.unsubscribeRateAlert(unsubscribeToken)).toMatchObject({ label: "USD → INR" });
    expect(await alerts.checkRateAlerts({ now: at(8) })).toMatchObject({ alerts: 0, updates: 0 });
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
    expect(await alerts.setRateAlert(workspace, savedId, "weekly")).toMatchObject({ ok: true });
    expect(await alerts.setRateAlert(workspace, savedId, "weekly")).toMatchObject({ ok: true });
    const other = await secondPair(workspace.organizationId, workspace.userId, "EUR");
    expect(await alerts.setRateAlert(workspace, other, "weekly")).toMatchObject({ ok: false, limit: true, error: expect.stringContaining("upgrade to Plus ($2.99 a month) for 10") });
  });

  it("gives Plus ten, and keeps only the oldest running after a downgrade", async () => {
    const { workspace, savedId } = await savedPair();
    await withPlan(workspace.organizationId, "plus");
    state.rows = [row("infinity", 93_000)];
    const ids = [savedId, ...await Promise.all(["EUR", "GBP", "AED"].map((to) => secondPair(workspace.organizationId, workspace.userId, to)))];
    for (const id of ids) expect(await alerts.setRateAlert(workspace, id, "smart")).toMatchObject({ ok: true });

    await state.db.update(database.organizationEntitlements).set({ validUntil: new Date(Date.now() - 1000) });
    expect(await alerts.checkRateAlerts({ now: at(0) })).toMatchObject({ alerts: 4, overLimit: 3 });
  });
});
