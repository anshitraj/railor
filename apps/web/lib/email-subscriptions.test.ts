import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import type { PriceRow } from "@railor/core";

const state = vi.hoisted(() => ({ db: null as any, rows: [] as PriceRow[], sent: [] as any[], mailOk: true }));
vi.mock("server-only", () => ({}));
vi.mock("@railor/database", async (original) => ({ ...await original<typeof import("@railor/database")>(), getDb: async () => state.db }));
vi.mock("./pricing", () => ({
  runPriceCheck: vi.fn(async () => ({ rows: state.rows, reference: { rate: 92.4, source: "Test", observedAt: "2026-11-24T00:00:00Z" } })),
  resolvePriceInput: vi.fn(async (params: Record<string, string>) => ({ from: params.from, to: params.to, amount: Number(params.amount), market: true, context: { profile: "personal", country: "US", direction: "send", purpose: "personal" }, destinationCountry: "IN" })),
}));
vi.mock("./mail", () => ({
  smtpConfigured: () => true,
  sendMail: vi.fn(async (message: unknown) => { state.sent.push(message); return state.mailOk ? { sent: true } : { sent: false, error: "send_failed" }; }),
}));
vi.mock("./security", () => ({ appOrigin: () => "https://www.railor.xyz" }));
vi.mock("./emails/rate-chart", () => ({ renderRateChart: vi.fn(async () => Buffer.from("png")) }));
vi.mock("./rate-history", () => ({ loadRateHistory: vi.fn(async () => ({ source: "Test", points: [{ date: "2026-11-01", rate: 90 }, { date: "2026-11-02", rate: 91 }] })) }));

const database = await import("@railor/database");
const subs = await import("./email-subscriptions");
const client = new PGlite();
const DAY = 86_400_000;

const row = (slug: string, recipientAmount: number): PriceRow => ({
  providerSlug: slug, providerName: slug[0]!.toUpperCase() + slug.slice(1), basis: "published", recipientAmount, feeAmount: 1, feeCurrency: "USD",
  rate: 93, totalCostPct: 0.5, partial: false, delivery: "In minutes", observedAt: "2026-11-24T00:00:00Z", source: { label: slug }, notes: [],
});
const ask = (over: Partial<Parameters<typeof subs.subscribeByEmail>[0]> = {}) => subs.subscribeByEmail({ email: "Reader@Example.com", from: "USD", to: "INR", amount: 1000, identity: `ip-${Math.random()}`, ...over });
const stored = async () => (await state.db.select().from(database.emailSubscriptions)) as Array<typeof database.emailSubscriptions.$inferSelect>;
const tokenIn = (message: { text: string }, name: string) => new URL(message.text.match(new RegExp(`https://www\\.railor\\.xyz/api/alerts/${name}\\?token=[\\w-]+`))![0]).searchParams.get("token")!;

beforeAll(async () => {
  state.db = drizzle(client, { schema: database.schema });
  await migrate(state.db, { migrationsFolder: path.resolve("../../packages/database/drizzle") });
}, 30000);
afterAll(async () => { await client.close(); });
beforeEach(async () => {
  state.rows = []; state.sent = []; state.mailOk = true;
  await state.db.delete(database.emailSubscriptions);
  await state.db.delete(database.rateLimitBuckets);
});

describe("asking for updates without an account", () => {
  it("rejects a bad address, a bad pair and a missing amount before anything is stored or sent", async () => {
    expect(await ask({ email: "nope" })).toMatchObject({ ok: false, error: expect.stringContaining("valid email") });
    expect(await ask({ from: "USD", to: "USD" })).toMatchObject({ ok: false, error: expect.stringContaining("two different currencies") });
    expect(await ask({ amount: 0 })).toMatchObject({ ok: false, error: expect.stringContaining("amount") });
    expect(await stored()).toHaveLength(0);
    expect(state.sent).toHaveLength(0);
  });

  it("stores an unconfirmed subscription and emails a confirmation link, once, to a lower-cased address", async () => {
    expect(await ask()).toEqual({ ok: true, status: "confirm_sent", email: "reader@example.com" });
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0]).toMatchObject({ to: "reader@example.com", subject: "Confirm your weekly USD → INR rate updates" });
    expect(await stored()).toMatchObject([{ email: "reader@example.com", frequency: "weekly", confirmedAt: null, unsubscribedAt: null }]);
    // Asking again straight away doesn't send a second email.
    expect(await ask()).toMatchObject({ ok: true, status: "confirm_sent" });
    expect(state.sent).toHaveLength(1);
  });

  it("reports a failed confirmation email instead of pretending, and limits how often one address can ask", async () => {
    state.mailOk = false;
    expect(await ask({ email: "fail@example.com" })).toMatchObject({ ok: false, error: expect.stringContaining("couldn’t send the confirmation") });
    for (let i = 0; i < 3; i += 1) await ask({ email: "many@example.com", amount: 100 + i });
    expect(await ask({ email: "many@example.com", amount: 999 })).toMatchObject({ ok: false, error: expect.stringContaining("Too many requests") });
  });
});

describe("confirming and unsubscribing", () => {
  it("confirms from the inbox link, only once it is that link, and says it is already confirmed afterwards", async () => {
    await ask();
    const confirm = tokenIn(state.sent[0], "confirm");
    expect(await subs.confirmSubscription("short")).toBeNull();
    expect(await subs.confirmSubscription("x".repeat(30))).toBeNull();
    expect(await subs.confirmSubscription(confirm)).toMatchObject({ email: "reader@example.com", label: "USD → INR", frequency: "weekly" });
    expect((await stored())[0]!.confirmedAt).not.toBeNull();
    expect(await ask()).toMatchObject({ ok: true, status: "already_confirmed" });
  });

  it("stops from the unsubscribe link in any email, and a stopped link can't be confirmed", async () => {
    await ask();
    const unsubscribe = tokenIn(state.sent[0], "unsubscribe");
    const confirm = tokenIn(state.sent[0], "confirm");
    expect(await subs.unsubscribeSubscription(unsubscribe)).toEqual({ label: "USD → INR" });
    expect(await subs.confirmSubscription(confirm)).toBeNull();
    expect(await subs.unsubscribeSubscription("short")).toBeNull();
  });
});

describe("sending updates to confirmed addresses", () => {
  async function confirmed() {
    await ask();
    await subs.confirmSubscription(tokenIn(state.sent[0], "confirm"));
    state.sent = [];
  }

  it("sends the first update soon after confirming, then weekly, and never to an unconfirmed or stopped address", async () => {
    await ask({ email: "pending@example.com" });
    state.sent = [];
    await confirmed();
    state.rows = [row("moneygram", 93_000), row("remitly", 92_800)];
    expect(await subs.checkEmailSubscriptions({ now: () => new Date() })).toMatchObject({ subscriptions: 1, updates: 1 });
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0]).toMatchObject({ to: "reader@example.com", subject: expect.stringContaining("INR 93,000.00") });
    expect(state.sent[0].html).toContain("Create a free account");
    expect(state.sent[0].text).toContain("/api/alerts/unsubscribe?token=");

    state.sent = [];
    expect(await subs.checkEmailSubscriptions({ now: () => new Date(Date.now() + 3 * DAY) })).toMatchObject({ subscriptions: 0, updates: 0 });
    expect(await subs.checkEmailSubscriptions({ now: () => new Date(Date.now() + 7 * DAY) })).toMatchObject({ updates: 1 });

    await subs.unsubscribeSubscription((await stored()).find((item) => item.email === "reader@example.com")!.unsubscribeToken);
    state.sent = [];
    expect(await subs.checkEmailSubscriptions({ now: () => new Date(Date.now() + 20 * DAY) })).toMatchObject({ subscriptions: 0 });
  });

  it("retries after a failed send, and sends nothing when no provider has a complete price", async () => {
    await confirmed();
    state.rows = [];
    expect(await subs.checkEmailSubscriptions({ now: () => new Date() })).toMatchObject({ updates: 0 });
    state.rows = [row("moneygram", 93_000)];
    state.mailOk = false;
    expect(await subs.checkEmailSubscriptions({ now: () => new Date() })).toMatchObject({ updates: 0, failedEmails: 1 });
    state.mailOk = true;
    expect(await subs.checkEmailSubscriptions({ now: () => new Date() })).toMatchObject({ updates: 1 });
  });
});
