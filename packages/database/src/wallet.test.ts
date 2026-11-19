/**
 * Wallet ledger tests against a throwaway in-memory PGlite with every
 * migration applied. Run: pnpm --filter @railor/database test
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq, sql } from "drizzle-orm";
import type { RailorDb } from "./client.js";
import * as schema from "./schema.js";
import {
  SIGNUP_CREDIT_CENTS,
  appendWalletEntry,
  debitWalletUsage,
  formatWalletCents,
  grantSignupCredit,
  redeemWalletPromoCode,
  walletBalanceCents,
  walletHistory,
  walletTotals,
} from "./wallet.js";
import { TEST_PROMO_CODES, seedWalletPromoCodes } from "./seed/wallet.js";

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle");
const client = new PGlite();
const db = drizzle(client, { schema }) as unknown as RailorDb;

async function org(name: string) {
  const [row] = await db.insert(schema.organizations).values({ name, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${Math.random().toString(36).slice(2, 8)}` }).returning();
  return row!.id;
}
async function user(email: string) {
  const [row] = await db.insert(schema.users).values({ email }).returning();
  return row!.id;
}

before(async () => {
  await migrate(db as never, { migrationsFolder });
});
after(async () => {
  await client.close();
});

describe("signup credit", () => {
  it("grants $5.00 exactly once per workspace across repeat visits and races", async () => {
    const o = await org("Grant once");
    const u = await user("grant-once@test.invalid");
    assert.deepEqual(await grantSignupCredit(db, { organizationId: o, userId: u }), { granted: true });
    assert.deepEqual(await grantSignupCredit(db, { organizationId: o, userId: u }), { granted: false });
    const racers = await Promise.all(Array.from({ length: 6 }, () => grantSignupCredit(db, { organizationId: o, userId: u })));
    assert.equal(racers.filter((r) => r.granted).length, 0);
    const history = await walletHistory(db, o);
    assert.equal(history.length, 1);
    assert.equal(history[0]!.label, "Signup credit");
    assert.equal(history[0]!.amountCents, SIGNUP_CREDIT_CENTS);
    assert.equal(await walletBalanceCents(db, o), 500);
  });

  it("collapses concurrent first visits to one grant", async () => {
    const o = await org("Grant race");
    const u = await user("grant-race@test.invalid");
    const results = await Promise.all(Array.from({ length: 8 }, () => grantSignupCredit(db, { organizationId: o, userId: u })));
    assert.equal(results.filter((r) => r.granted).length, 1);
    assert.equal(await walletBalanceCents(db, o), 500);
  });

  it("gives one person one signup credit, not one per workspace they create", async () => {
    const u = await user("many-workspaces@test.invalid");
    const first = await org("First workspace");
    const second = await org("Second workspace");
    assert.equal((await grantSignupCredit(db, { organizationId: first, userId: u })).granted, true);
    assert.equal((await grantSignupCredit(db, { organizationId: second, userId: u })).granted, false);
    assert.equal(await walletBalanceCents(db, second), 0);
    // A teammate who never claimed one can still start the second workspace's credit.
    const teammate = await user("teammate@test.invalid");
    assert.equal((await grantSignupCredit(db, { organizationId: second, userId: teammate })).granted, true);
    assert.equal(await walletBalanceCents(db, second), 500);
  });
});

describe("balance math", () => {
  it("sums completed entries only and breaks the total down", async () => {
    const o = await org("Balance math");
    const u = await user("balance@test.invalid");
    await grantSignupCredit(db, { organizationId: o, userId: u });
    await appendWalletEntry(db, { organizationId: o, userId: u, kind: "top_up", amountCents: 2500, label: "Top-up", idempotencyKey: "t1" });
    await appendWalletEntry(db, { organizationId: o, userId: u, kind: "top_up", status: "failed", amountCents: 1000, label: "Top-up", idempotencyKey: "t2" });
    await appendWalletEntry(db, { organizationId: o, userId: u, kind: "top_up", status: "pending", amountCents: 700, label: "Top-up", idempotencyKey: "t3" });
    await appendWalletEntry(db, { organizationId: o, kind: "usage", amountCents: -120, label: "Price check", idempotencyKey: "u1" });
    await appendWalletEntry(db, { organizationId: o, kind: "usage", amountCents: -1, label: "API call", idempotencyKey: "u2" });
    await appendWalletEntry(db, { organizationId: o, kind: "adjustment", amountCents: -30, label: "Correction", idempotencyKey: "a1" });
    assert.deepEqual(await walletTotals(db, o), { balanceCents: 500 + 2500 - 120 - 1 - 30, addedCents: 2500, creditsCents: 500, usedCents: 151, signupCreditGranted: true });
  });

  it("is zero for a new workspace and ignores other workspaces", async () => {
    const o = await org("Empty");
    assert.deepEqual(await walletTotals(db, o), { balanceCents: 0, addedCents: 0, creditsCents: 0, usedCents: 0, signupCreditGranted: false });
  });

  it("stores the same idempotency key once", async () => {
    const o = await org("Idempotent append");
    const a = await appendWalletEntry(db, { organizationId: o, kind: "top_up", amountCents: 1000, label: "Top-up", idempotencyKey: "same" });
    const b = await appendWalletEntry(db, { organizationId: o, kind: "top_up", amountCents: 1000, label: "Top-up", idempotencyKey: "same" });
    assert.equal(a.created, true);
    assert.equal(b.created, false);
    assert.equal(b.entry?.id, a.entry?.id);
    assert.equal(await walletBalanceCents(db, o), 1000);
  });

  it("rejects fractional, zero and wrongly signed amounts", async () => {
    const o = await org("Bad amounts");
    await assert.rejects(appendWalletEntry(db, { organizationId: o, kind: "top_up", amountCents: 10.5, label: "x", idempotencyKey: "f" }), RangeError);
    await assert.rejects(appendWalletEntry(db, { organizationId: o, kind: "top_up", amountCents: 0, label: "x", idempotencyKey: "z" }), RangeError);
    await assert.rejects(appendWalletEntry(db, { organizationId: o, kind: "usage", amountCents: 50, label: "x", idempotencyKey: "u" }));
    await assert.rejects(appendWalletEntry(db, { organizationId: o, kind: "top_up", amountCents: -50, label: "x", idempotencyKey: "n" }));
  });
});

describe("history", () => {
  it("lists newest first, keeps write order for same-instant entries, and filters by date", async () => {
    const o = await org("History order");
    await db.transaction(async (tx) => {
      // now() is the transaction's start time, so these three share a timestamp.
      for (const key of ["first", "second", "third"]) {
        await appendWalletEntry(tx as unknown as RailorDb, { organizationId: o, kind: "top_up", amountCents: 100, label: key, idempotencyKey: key });
      }
    });
    await client.query(`insert into wallet_entries (organization_id, kind, amount_cents, label, idempotency_key, created_at) values ($1, 'promo_credit', 300, 'old', 'old', now() - interval '60 days')`, [o]);
    const all = await walletHistory(db, o);
    assert.deepEqual(all.map((e) => e.label), ["third", "second", "first", "old"]);
    const recent = await walletHistory(db, o, { since: new Date(Date.now() - 30 * 86_400_000) });
    assert.deepEqual(recent.map((e) => e.label), ["third", "second", "first"]);
  });
});

describe("append-only ledger", () => {
  it("refuses to edit an entry but lets a deleted user's link go", async () => {
    const o = await org("Append only");
    const u = await user("leaver@test.invalid");
    const { entry } = await appendWalletEntry(db, { organizationId: o, userId: u, kind: "top_up", amountCents: 900, label: "Top-up", idempotencyKey: "keep" });
    await assert.rejects(db.update(schema.walletEntries).set({ amountCents: 90000 }).where(eq(schema.walletEntries.id, entry!.id)), (error: Error) => /append-only/.test(String((error.cause as Error | undefined)?.message ?? error.message)));
    await db.delete(schema.users).where(eq(schema.users.id, u));
    const [after] = await db.select().from(schema.walletEntries).where(eq(schema.walletEntries.id, entry!.id));
    assert.equal(after!.userId, null);
    assert.equal(after!.amountCents, 900);
  });
});

describe("promo codes", () => {
  it("credits a seeded code once per workspace", async () => {
    await seedWalletPromoCodes(db);
    assert.equal(await seedWalletPromoCodes(db), 0, "seed is idempotent");
    const o = await org("Promo");
    const result = await redeemWalletPromoCode(db, { organizationId: o, userId: null, code: " railor-test " });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.amountCents, TEST_PROMO_CODES[0].amountCents);
    assert.deepEqual(await redeemWalletPromoCode(db, { organizationId: o, userId: null, code: "RAILOR-TEST" }), { ok: false, reason: "already_redeemed" });
    assert.equal(await walletBalanceCents(db, o), 1000);
    const [entry] = await walletHistory(db, o);
    assert.equal(entry!.label, "Promo credit · RAILOR-TEST");
  });

  it("enforces caps, windows and unknown codes", async () => {
    const a = await org("Cap A");
    const b = await org("Cap B");
    const [first, second] = await Promise.all([
      redeemWalletPromoCode(db, { organizationId: a, userId: null, code: "TEST-ONCE" }),
      redeemWalletPromoCode(db, { organizationId: b, userId: null, code: "TEST-ONCE" }),
    ]);
    assert.equal([first, second].filter((r) => r.ok).length, 1);
    assert.deepEqual([first, second].find((r) => !r.ok), { ok: false, reason: "used_up" });
    await db.insert(schema.walletPromoCodes).values([
      { code: "OLD-CODE", amountCents: 100, label: "Expired", expiresAt: new Date("2020-01-01") },
      { code: "FUTURE", amountCents: 100, label: "Later", startsAt: new Date("2999-01-01") },
      { code: "OFF", amountCents: 100, label: "Off", active: false },
    ]);
    assert.deepEqual(await redeemWalletPromoCode(db, { organizationId: a, userId: null, code: "OLD-CODE" }), { ok: false, reason: "expired" });
    assert.deepEqual(await redeemWalletPromoCode(db, { organizationId: a, userId: null, code: "FUTURE" }), { ok: false, reason: "not_started" });
    assert.deepEqual(await redeemWalletPromoCode(db, { organizationId: a, userId: null, code: "OFF" }), { ok: false, reason: "invalid" });
    assert.deepEqual(await redeemWalletPromoCode(db, { organizationId: a, userId: null, code: "NOPE-123" }), { ok: false, reason: "invalid" });
    assert.deepEqual(await redeemWalletPromoCode(db, { organizationId: a, userId: null, code: "<script>" }), { ok: false, reason: "invalid" });
  });
});

describe("usage debits", () => {
  it("charges once per key and never spends past zero, even concurrently", async () => {
    const o = await org("Debits");
    await appendWalletEntry(db, { organizationId: o, kind: "top_up", amountCents: 100, label: "Top-up", idempotencyKey: "seed" });
    const charge = (key: string, cents = 40) => debitWalletUsage(db, { organizationId: o, amountCents: cents, label: "Price check", reference: "price_check", idempotencyKey: key });
    const once = await charge("check-1");
    const again = await charge("check-1");
    assert.equal(once.ok && once.created, true);
    assert.equal(again.ok && again.created, false);
    assert.equal(await walletBalanceCents(db, o), 60);
    const racers = await Promise.all([charge("a"), charge("b"), charge("c")]);
    assert.equal(racers.filter((r) => r.ok).length, 1);
    assert.deepEqual(racers.find((r) => !r.ok), { ok: false, reason: "insufficient_balance", balanceCents: 20 });
    assert.equal(await walletBalanceCents(db, o), 20);
    const [counted] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.walletEntries).where(eq(schema.walletEntries.organizationId, o));
    assert.equal(counted?.count, 3);
  });
});

describe("formatting", () => {
  it("formats cents without float drift", () => {
    assert.equal(formatWalletCents(500), "$5.00");
    assert.equal(formatWalletCents(0), "$0.00");
    assert.equal(formatWalletCents(1), "$0.01");
    assert.equal(formatWalletCents(123456789), "$1,234,567.89");
    assert.equal(formatWalletCents(-120), "−$1.20");
    assert.equal(formatWalletCents(2500, { signed: true }), "+$25.00");
  });
});
