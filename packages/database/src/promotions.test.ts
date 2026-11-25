/**
 * Promotions and quote history against a throwaway in-memory PGlite with
 * every migration applied. Run: pnpm --filter @railor/database test
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import type { RailorDb } from "./client.js";
import * as schema from "./schema.js";
import { createBillingCheckout, settleBillingCheckout } from "./billing.js";
import { activePromotions, checkDiscountCode, discountCodeUsage, priceWithDiscount, recordQuoteSnapshots, snapshotAmounts, snapshotHistory } from "./promotions.js";

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle");
const client = new PGlite();
const db = drizzle(client, { schema }) as unknown as RailorDb;
const NOW = new Date("2026-11-25T10:00:00Z");
const DAY = 86_400_000;

async function org(name: string) {
  const [row] = await db.insert(schema.organizations).values({ name, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${Math.random().toString(36).slice(2, 8)}` }).returning();
  return row!.id;
}

before(async () => { await migrate(db as never, { migrationsFolder }); });
after(async () => { await client.close(); });

describe("discount pricing", () => {
  it("takes a percentage or a flat amount off, never below zero", () => {
    assert.deepEqual(priceWithDiscount({ kind: "percent", percentBps: 2000, amountOffCents: null }, 999), { chargeCents: 799, discountCents: 200 });
    assert.deepEqual(priceWithDiscount({ kind: "percent", percentBps: 10_000, amountOffCents: null }, 2900), { chargeCents: 0, discountCents: 2900 });
    assert.deepEqual(priceWithDiscount({ kind: "amount", percentBps: null, amountOffCents: 500 }, 299), { chargeCents: 0, discountCents: 299 });
    assert.deepEqual(priceWithDiscount({ kind: "amount", percentBps: null, amountOffCents: 500 }, 2900), { chargeCents: 2400, discountCents: 500 });
  });

  it("refuses codes outside their window, purchase or plan", async () => {
    const o = await org("Code rules");
    await db.insert(schema.discountCodes).values([
      { code: "LATER", kind: "percent", percentBps: 1000, appliesTo: "plan", startsAt: new Date(NOW.getTime() + DAY) },
      { code: "GONE", kind: "percent", percentBps: 1000, appliesTo: "plan", endsAt: new Date(NOW.getTime() - DAY) },
      { code: "TOPUPONLY", kind: "amount", amountOffCents: 200, appliesTo: "top_up" },
      { code: "PROONLY", kind: "percent", percentBps: 5000, appliesTo: "plan", plans: ["pro"] },
      { code: "OFFCODE", kind: "percent", percentBps: 5000, appliesTo: "any", active: false },
    ]);
    const check = (code: string, purpose: "plan" | "top_up", plan: string | null = "plus") => checkDiscountCode(db, { code, organizationId: o, purpose, plan, now: NOW });
    assert.deepEqual(await check("nope", "plan"), { ok: false, reason: "unknown" });
    assert.deepEqual(await check("later", "plan"), { ok: false, reason: "not_started" });
    assert.deepEqual(await check("GONE", "plan"), { ok: false, reason: "expired" });
    assert.deepEqual(await check("TOPUPONLY", "plan"), { ok: false, reason: "wrong_purchase" });
    assert.deepEqual(await check("PROONLY", "plan", "plus"), { ok: false, reason: "wrong_plan" });
    assert.deepEqual(await check("OFFCODE", "top_up", null), { ok: false, reason: "inactive" });
    assert.equal((await check(" proonly ", "plan", "pro")).ok, true);
    assert.equal((await check("TOPUPONLY", "top_up", null)).ok, true);
  });

  it("records one redemption per paid checkout and then honours the month and use limits", async () => {
    const a = await org("Redeemer A");
    const b = await org("Redeemer B");
    const [code] = await db.insert(schema.discountCodes).values({ code: "TWOMONTHS", kind: "percent", percentBps: 5000, appliesTo: "plan", cycles: 2, maxRedemptions: 3 }).returning();
    const pay = async (organizationId: string, ref: string) => {
      const checkout = await createBillingCheckout(db, { organizationId, userId: null, provider: "arcpay", purpose: "plan", plan: "pro", amountCents: 999, testMode: true, discount: { codeId: code!.id, chargeCents: 500 } });
      const first = await settleBillingCheckout(db, { checkoutId: checkout.id, providerPaymentId: ref, effect: { kind: "plan_month" }, now: NOW });
      const again = await settleBillingCheckout(db, { checkoutId: checkout.id, providerPaymentId: ref, effect: { kind: "plan_month" }, now: NOW });
      assert.equal(first.settled, true);
      assert.equal(again.settled, false);
    };
    await pay(a, "pay_a1");
    assert.equal((await checkDiscountCode(db, { code: "TWOMONTHS", organizationId: a, purpose: "plan", plan: "pro", now: NOW })).ok, true);
    await pay(a, "pay_a2");
    assert.deepEqual(await checkDiscountCode(db, { code: "TWOMONTHS", organizationId: a, purpose: "plan", plan: "pro", now: NOW }), { ok: false, reason: "already_used" });
    await pay(b, "pay_b1");
    // Three uses in total now: the code is spent for everyone.
    const other = await org("Redeemer C");
    assert.deepEqual(await checkDiscountCode(db, { code: "TWOMONTHS", organizationId: other, purpose: "plan", plan: "pro", now: NOW }), { ok: false, reason: "used_up" });
    const usage = (await discountCodeUsage(db)).find((row) => row.code.code === "TWOMONTHS");
    assert.equal(usage?.redemptions, 3);
    assert.equal(usage?.discountedCents, 3 * 499);
  });

  it("rejects a charge above the price at the database", async () => {
    const o = await org("Bad charge");
    const [code] = await db.insert(schema.discountCodes).values({ code: "BADCHARGE", kind: "percent", percentBps: 1000, appliesTo: "plan" }).returning();
    await assert.rejects(createBillingCheckout(db, { organizationId: o, userId: null, provider: "arcpay", purpose: "plan", plan: "plus", amountCents: 299, testMode: true, discount: { codeId: code!.id, chargeCents: 300 } }));
  });
});

describe("provider offers", () => {
  it("returns only live promotions for the corridor and profile", async () => {
    await db.insert(schema.providerOffers).values([
      { providerSlug: "wise", kind: "fee_free", headline: "First transfer free", terms: "New customers, first transfer.", sourceUrl: "https://wise.com/offer", sourceCurrency: "USD", destinationCurrency: "INR" },
      { providerSlug: "remitly", kind: "better_rate", headline: "Promo rate", terms: "For personal customers only.", sourceUrl: "https://remitly.com/offer", profiles: ["personal"] },
      { providerSlug: "xoom", kind: "bonus", headline: "Old offer", terms: "Ended last week.", sourceUrl: "https://xoom.com/offer", endsAt: new Date(NOW.getTime() - DAY) },
      { providerSlug: "skydo", kind: "other", headline: "Switched off", terms: "Switched off by an operator.", sourceUrl: "https://skydo.com/offer", active: false },
      { providerSlug: "wise", kind: "fee_free", headline: "Euro only", terms: "Only for euro transfers.", sourceUrl: "https://wise.com/eur", destinationCurrency: "EUR" },
    ]);
    const personal = await activePromotions(db, { from: "USD", to: "INR", profile: "personal", now: NOW });
    assert.deepEqual(personal.offers.map((offer) => offer.headline).sort(), ["First transfer free", "Promo rate"]);
    const business = await activePromotions(db, { from: "USD", to: "INR", profile: "business", now: NOW });
    assert.deepEqual(business.offers.map((offer) => offer.headline), ["First transfer free"]);
  });

  it("refuses an offer without an https source", async () => {
    await assert.rejects(db.insert(schema.providerOffers).values({ providerSlug: "wise", kind: "other", headline: "No source", terms: "No source given here.", sourceUrl: "http://wise.com" }));
  });
});

describe("quote snapshots", () => {
  const row = (slug: string, recipientAmount: number, extra: Partial<Parameters<typeof recordQuoteSnapshots>[1][number]> = {}) => ({
    sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000, profile: "personal", providerSlug: slug, providerName: slug.toUpperCase(), category: "transfer", basis: "live_public", rate: recipientAmount / 1000, fee: 0, feeCurrency: "USD", recipientAmount, midMarketRate: 92.5, ...extra,
  });

  it("keeps one row per provider and day, the latest check winning", async () => {
    await recordQuoteSnapshots(db, [row("wise", 92_100), row("sbi", 90_400, { category: "bank" })], new Date("2026-11-20T08:00:00Z"));
    await recordQuoteSnapshots(db, [row("wise", 92_300)], new Date("2026-11-20T18:00:00Z"));
    await recordQuoteSnapshots(db, [row("wise", 92_500)], new Date("2026-11-22T09:00:00Z"));
    await recordQuoteSnapshots(db, [row("wise", 91_000, { profile: "business" })], new Date("2026-11-20T09:00:00Z"));
    const days = await snapshotHistory(db, { from: "USD", to: "INR", amount: 1000, profile: "personal", since: "2026-11-01" });
    assert.deepEqual(days.map((day) => day.date), ["2026-11-20", "2026-11-22"]);
    assert.equal(days[0]!.quotes.find((quote) => quote.providerSlug === "wise")?.recipientAmount, 92_300);
    assert.equal(days[0]!.quotes.find((quote) => quote.providerSlug === "sbi")?.category, "bank");
    assert.deepEqual(await snapshotAmounts(db, { from: "USD", to: "INR", profile: "personal", since: "2026-11-01" }), [{ amount: 1000, days: 2 }]);
    // A business check is its own history: it doesn't replace the personal price for that day.
    const business = await snapshotHistory(db, { from: "USD", to: "INR", amount: 1000, profile: "business", since: "2026-11-01" });
    assert.deepEqual(business.map((day) => [day.date, day.quotes[0]?.recipientAmount]), [["2026-11-20", 91_000]]);
  });

  it("skips rows with no usable amount", async () => {
    const saved = await recordQuoteSnapshots(db, [row("bad", 0), { ...row("bad2", 1), sourceCurrency: "usdt" }], NOW);
    assert.equal(saved, 0);
    const [count] = await db.select({ id: schema.quoteSnapshots.id }).from(schema.quoteSnapshots).where(eq(schema.quoteSnapshots.providerSlug, "bad"));
    assert.equal(count, undefined);
  });
});
