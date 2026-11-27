import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { PriceRow } from "@railor/core";
import { changePct, dailySeries, dayRange, extraFound, greeting, median, summaryLine, topShares } from "./dashboard-metrics";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("server-only", () => ({}));
vi.mock("@railor/database", async (original) => ({ ...await original<typeof import("@railor/database")>(), getDb: async () => state.db }));

const database = await import("@railor/database");
const activity = await import("./activity");
const dashboard = await import("./dashboard");
const client = new PGlite();
const DAY = 86_400_000;
const NOW = new Date("2026-11-26T12:00:00Z");

const row = (slug: string, recipientAmount: number | null, extra: Partial<PriceRow> = {}) =>
  ({ providerSlug: slug, providerName: slug.toUpperCase(), basis: "published", recipientAmount, notes: [], ...extra }) as unknown as PriceRow;
const result = (rows: PriceRow[], amount = 1000) => ({ input: { sourceCurrency: "USD", destinationCurrency: "INR", amount }, rows }) as any;

async function workspace() {
  const [org] = await state.db.insert(database.organizations).values({ name: "Dash", slug: `dash-${randomUUID().slice(0, 8)}` }).returning();
  const [user] = await state.db.insert(database.users).values({ email: `${randomUUID().slice(0, 8)}@test.invalid` }).returning();
  return { org: org.id as string, user: user.id as string };
}

beforeAll(async () => {
  state.db = drizzle(client, { schema: database.schema });
  await migrate(state.db, { migrationsFolder: path.resolve("../../packages/database/drizzle") });
}, 30000);
afterAll(async () => { await client.close(); });

describe("dashboard arithmetic", () => {
  it("counts each series per day over a fixed window and drops anything outside it", () => {
    const days = dayRange(3, NOW);
    expect(days).toEqual(["2026-11-24", "2026-11-25", "2026-11-26"]);
    const series = dailySeries({ checks: [NOW, NOW, new Date(NOW.getTime() - DAY)], visits: [new Date(NOW.getTime() - 9 * DAY)], payments: [NOW] }, 3, NOW);
    expect(series.map((point) => [point.checks, point.visits, point.payments])).toEqual([[0, 0, 0], [1, 0, 0], [2, 0, 1]]);
  });

  it("keeps the biggest groups and folds the rest into Other", () => {
    const items = ["a", "a", "a", "b", "b", "c", "d", "e", "f"].map((key) => ({ key, label: key.toUpperCase() }));
    expect(topShares(items, 3)).toEqual([
      { key: "a", label: "A", count: 3 }, { key: "b", label: "B", count: 2 }, { key: "c", label: "C", count: 1 }, { key: "other", label: "Other", count: 3 },
    ]);
    expect(topShares(items.slice(0, 7), 3).map((share) => share.key)).toEqual(["a", "b", "c", "d"]);
  });

  it("measures change only when there is a previous period, and finds the extra over the middle option", () => {
    expect(changePct(15, 10)).toBe(50);
    expect(changePct(3, 0)).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    const found = extraFound([
      { from: "USD", to: "INR", amount: 1000, best: 92_100, median: 91_600, options: 5 },
      { from: "USD", to: "INR", amount: 500, best: 46_050, median: 45_800, options: 4 },
      { from: "USD", to: "EUR", amount: 100, best: 92, median: 91, options: 3 },
      { from: "USD", to: "INR", amount: 100, best: 9_200, median: 9_200, options: 1 },
    ]);
    expect(found).toEqual({ currency: "INR", amount: 750, checks: 2 });
    expect(extraFound([])).toBeNull();
  });

  it("greets by the workspace's clock and summarises only what the page shows", () => {
    expect(greeting(new Date("2026-11-26T03:00:00Z"), "Asia/Kolkata")).toBe("Good morning");
    expect(greeting(new Date("2026-11-26T14:00:00Z"), "Asia/Kolkata")).toBe("Good evening");
    expect(summaryLine({ needs: 2, checks: 14, topRoute: "USD → INR", payments: 1 })).toBe("2 things need you · 14 price checks in the last 30 days, mostly USD → INR · 1 payment this month.");
    expect(summaryLine({ needs: 0, checks: 0, topRoute: null, payments: 0 })).toBe("Compare a transfer to start your activity history.");
  });
});

describe("recording activity", () => {
  it("keeps only the figures a dashboard needs from a comparison", () => {
    const data = activity.priceCheckData(result([row("wise", 92_000), row("dashx", 92_100), row("bank", 90_000), row("nope", null), row("blocked", 99_999, { profileAssessment: { status: "not_supported" } } as Partial<PriceRow>)]));
    expect(data).toEqual({ from: "USD", to: "INR", amount: 1000, best: 92_100, bestProvider: "DASHX", median: 92_000, options: 3 });
  });

  it("records a check once while someone is still typing the same amount", async () => {
    const { org, user } = await workspace();
    expect(await activity.recordPriceCheck(org, user, result([row("wise", 92_000)]), NOW)).toBe(true);
    expect(await activity.recordPriceCheck(org, user, result([row("wise", 92_000)]), new Date(NOW.getTime() + 60_000))).toBe(false);
    expect(await activity.recordPriceCheck(org, user, result([row("wise", 46_000)], 500), new Date(NOW.getTime() + 60_000))).toBe(true);
  });

  it("builds the dashboard from what the workspace recorded, and nothing from other workspaces", async () => {
    const { org, user } = await workspace();
    const other = await workspace();
    const events = database.productEvents;
    const check = (to: string, best: number, median: number, daysAgo: number) => ({
      organizationId: org, actorId: user, kind: "price_checked", targetId: `USD-${to}:1000`,
      data: { from: "USD", to, amount: 1000, best, bestProvider: "Wise", median, options: 3 }, createdAt: new Date(NOW.getTime() - daysAgo * DAY),
    });
    await state.db.insert(events).values([
      check("INR", 92_100, 91_900, 1), check("INR", 92_000, 91_800, 2), check("EUR", 920, 915, 3), check("INR", 91_000, 90_000, 40),
      { organizationId: org, actorId: user, kind: "provider_opened", targetId: "wise", data: { provider: "wise", name: "Wise", from: "USD", to: "INR" }, createdAt: new Date(NOW.getTime() - DAY) },
      { ...check("GBP", 1, 1, 1), organizationId: other.org },
    ]);
    const [recipient] = await state.db.insert(database.beneficiaries).values({ organizationId: org, label: "Synthetic recipient", holderType: "business", holderName: "Fixture only", country: "IN", currency: "INR", method: "in_bank", displayHint: "•••• 1234", encryptedDetails: "test-only-not-an-account", fingerprint: "fixture" }).returning();
    await state.db.insert(database.payments).values({
      organizationId: org, beneficiaryId: recipient.id, mode: "test", status: "awaiting_funds", intent: {}, amount: "2400", sourceCurrency: "USD", destinationCurrency: "INR",
      destinationCountry: "IN", selectedProvider: "wise", reference: "R1", idempotencyKey: randomUUID(), requestHash: "h", createdAt: new Date(NOW.getTime() - 2 * DAY),
    } as any);

    const data = await dashboard.loadDashboard(org, NOW);
    expect(data.checks).toEqual({ value: 3, previous: 1, change: 200 });
    expect(data.visits.value).toBe(1);
    expect(data.routes).toEqual([{ key: "USD-INR", label: "USD → INR", count: 2 }, { key: "USD-EUR", label: "USD → EUR", count: 1 }]);
    expect(data.topRoute).toEqual({ from: "USD", to: "INR" });
    expect(data.extra).toEqual({ currency: "INR", amount: 400, checks: 2 });
    expect(data.providers).toEqual([{ key: "wise", label: "Wise", count: 2 }]);
    expect(data.payments.value).toBe(1);
    expect(data.stuckPayments.map((payment) => payment.status)).toEqual(["awaiting_funds"]);
    expect(data.daily.reduce((sum, day) => sum + day.checks, 0)).toBe(3);
    expect(data.timeline[0]?.title).toMatch(/Compared 1,000 USD → INR|Went to Wise/);
    expect(data.timeline.some((item) => item.title.includes("GBP"))).toBe(false);
  });
});
