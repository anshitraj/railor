/**
 * Wallet ledger: prepaid Railor credit in integer US cents.
 *
 * Every change to a balance is a new row in `wallet_entries`; the balance is
 * the sum of completed rows. Each write carries an idempotency key that is
 * unique per organization, so a retried request, a double click or two racing
 * requests produce one entry, never two.
 *
 * Functions take the database explicitly so they run inside a caller's
 * transaction and in tests against a throwaway PGlite.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { RailorDb } from "./client.js";
import {
  organizations,
  walletEntries,
  walletPromoCodes,
  type WalletEntryKind,
  type WalletEntryStatus,
} from "./schema.js";

/** $5.00 of credit, granted once on a workspace's first signed-in visit. */
export const SIGNUP_CREDIT_CENTS = 500;
export const SIGNUP_CREDIT_KEY = "signup_credit";

export type WalletEntry = typeof walletEntries.$inferSelect;

export interface NewWalletEntry {
  organizationId: string;
  userId?: string | null;
  kind: WalletEntryKind;
  status?: WalletEntryStatus;
  amountCents: number;
  label: string;
  reference?: string | null;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

function assertCents(value: number, name = "amountCents") {
  if (!Number.isSafeInteger(value) || value === 0) throw new RangeError(`${name} must be a non-zero whole number of cents`);
}

function rowsOf<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : ((result as { rows?: T[] }).rows ?? [])) as T[];
}

/**
 * Appends one entry. A repeated idempotency key returns the entry that is
 * already there (`created: false`) instead of writing a second one.
 */
export async function appendWalletEntry(db: RailorDb, entry: NewWalletEntry): Promise<{ entry: WalletEntry | null; created: boolean }> {
  assertCents(entry.amountCents);
  const [created] = await db
    .insert(walletEntries)
    .values({
      organizationId: entry.organizationId,
      userId: entry.userId ?? null,
      kind: entry.kind,
      status: entry.status ?? "completed",
      amountCents: entry.amountCents,
      label: entry.label,
      reference: entry.reference ?? null,
      idempotencyKey: entry.idempotencyKey,
      metadata: entry.metadata ?? {},
    })
    .onConflictDoNothing()
    .returning();
  if (created) return { entry: created, created: true };
  const [existing] = await db
    .select()
    .from(walletEntries)
    .where(and(eq(walletEntries.organizationId, entry.organizationId), eq(walletEntries.idempotencyKey, entry.idempotencyKey)))
    .limit(1);
  return { entry: existing ?? null, created: false };
}

export interface WalletTotals {
  balanceCents: number;
  /** Money added by top-ups. */
  addedCents: number;
  /** Free credit: signup, promo codes, refunds and positive adjustments. */
  creditsCents: number;
  /** Spent on metered usage (a positive number). */
  usedCents: number;
  signupCreditGranted: boolean;
}

/** Balance and its breakdown, from completed entries only. */
export async function walletTotals(db: RailorDb, organizationId: string): Promise<WalletTotals> {
  const result = await db.execute(sql`
    select
      coalesce(sum(amount_cents) filter (where status = 'completed'), 0)::bigint as balance,
      coalesce(sum(amount_cents) filter (where status = 'completed' and kind = 'top_up'), 0)::bigint as added,
      coalesce(sum(amount_cents) filter (where status = 'completed' and kind in ('signup_credit','promo_credit','refund','adjustment') and amount_cents > 0), 0)::bigint as credits,
      coalesce(-sum(amount_cents) filter (where status = 'completed' and (kind = 'usage' or (kind = 'adjustment' and amount_cents < 0))), 0)::bigint as used,
      coalesce(bool_or(kind = 'signup_credit'), false) as signup
    from wallet_entries
    where organization_id = ${organizationId}
  `);
  const [row] = rowsOf<{ balance: string | number; added: string | number; credits: string | number; used: string | number; signup: boolean }>(result);
  return {
    balanceCents: Number(row?.balance ?? 0),
    addedCents: Number(row?.added ?? 0),
    creditsCents: Number(row?.credits ?? 0),
    usedCents: Number(row?.used ?? 0),
    signupCreditGranted: Boolean(row?.signup),
  };
}

export async function walletBalanceCents(db: RailorDb, organizationId: string): Promise<number> {
  return (await walletTotals(db, organizationId)).balanceCents;
}

/**
 * Grants the one-time signup credit. Safe to call on every visit: a
 * workspace gets it once, and a person triggers it for at most one
 * workspace (both enforced by unique indexes, so concurrent calls collapse).
 */
export async function grantSignupCredit(db: RailorDb, input: { organizationId: string; userId: string }): Promise<{ granted: boolean }> {
  const { created } = await appendWalletEntry(db, {
    organizationId: input.organizationId,
    userId: input.userId,
    kind: "signup_credit",
    amountCents: SIGNUP_CREDIT_CENTS,
    label: "Signup credit",
    idempotencyKey: SIGNUP_CREDIT_KEY,
  });
  return { granted: created };
}

/** Newest first; `seq` breaks ties between entries written in the same instant. */
export async function walletHistory(db: RailorDb, organizationId: string, options: { since?: Date | null; limit?: number } = {}): Promise<WalletEntry[]> {
  const conditions = [eq(walletEntries.organizationId, organizationId)];
  if (options.since) conditions.push(gte(walletEntries.createdAt, options.since));
  return db
    .select()
    .from(walletEntries)
    .where(and(...conditions))
    .orderBy(desc(walletEntries.createdAt), desc(walletEntries.seq))
    .limit(Math.min(Math.max(options.limit ?? 200, 1), 500));
}

export function normalizePromoCode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export type PromoRedemption =
  | { ok: true; entry: WalletEntry; amountCents: number }
  | { ok: false; reason: "invalid" | "not_started" | "expired" | "used_up" | "already_redeemed" };

/** Redeems a promo code once per workspace, respecting its window and redemption cap. */
export async function redeemWalletPromoCode(
  db: RailorDb,
  input: { organizationId: string; userId: string | null; code: string; now?: Date },
): Promise<PromoRedemption> {
  const code = normalizePromoCode(input.code);
  if (!/^[A-Z0-9-]{3,32}$/.test(code)) return { ok: false, reason: "invalid" };
  const now = input.now ?? new Date();
  const key = `promo:${code}`;
  return db.transaction(async (tx) => {
    // Locking the code serializes redemptions, so the cap can't be overshot.
    const [promo] = await tx.select().from(walletPromoCodes).where(eq(walletPromoCodes.code, code)).for("update");
    if (!promo || !promo.active) return { ok: false, reason: "invalid" } as const;
    if (promo.startsAt && promo.startsAt > now) return { ok: false, reason: "not_started" } as const;
    if (promo.expiresAt && promo.expiresAt <= now) return { ok: false, reason: "expired" } as const;
    const [mine] = await tx
      .select({ id: walletEntries.id })
      .from(walletEntries)
      .where(and(eq(walletEntries.organizationId, input.organizationId), eq(walletEntries.idempotencyKey, key)))
      .limit(1);
    if (mine) return { ok: false, reason: "already_redeemed" } as const;
    if (promo.maxRedemptions !== null) {
      const [counted] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(walletEntries)
        .where(and(eq(walletEntries.kind, "promo_credit"), eq(walletEntries.reference, code)));
      if (Number(counted?.count ?? 0) >= promo.maxRedemptions) return { ok: false, reason: "used_up" } as const;
    }
    const { entry, created } = await appendWalletEntry(tx as unknown as RailorDb, {
      organizationId: input.organizationId,
      userId: input.userId,
      kind: "promo_credit",
      amountCents: promo.amountCents,
      label: `Promo credit · ${code}`,
      reference: code,
      idempotencyKey: key,
      metadata: { promoLabel: promo.label },
    });
    if (!entry || !created) return { ok: false, reason: "already_redeemed" } as const;
    return { ok: true, entry, amountCents: promo.amountCents } as const;
  });
}

export type UsageDebit =
  | { ok: true; entry: WalletEntry; created: boolean; balanceCents: number }
  | { ok: false; reason: "insufficient_balance"; balanceCents: number };

/**
 * Charges metered usage. Serialized per workspace (row lock on the
 * organization) so two concurrent debits can't both spend the last cent.
 * A repeated idempotency key returns the original charge.
 */
export async function debitWalletUsage(
  db: RailorDb,
  input: { organizationId: string; userId?: string | null; amountCents: number; label: string; reference: string; idempotencyKey: string; metadata?: Record<string, unknown> },
): Promise<UsageDebit> {
  assertCents(input.amountCents);
  if (input.amountCents < 0) throw new RangeError("amountCents is the positive price of the usage");
  return db.transaction(async (tx) => {
    const conn = tx as unknown as RailorDb;
    await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, input.organizationId)).for("update");
    const [existing] = await tx
      .select()
      .from(walletEntries)
      .where(and(eq(walletEntries.organizationId, input.organizationId), eq(walletEntries.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (existing) return { ok: true, entry: existing, created: false, balanceCents: await walletBalanceCents(conn, input.organizationId) } as const;
    const balance = await walletBalanceCents(conn, input.organizationId);
    if (balance < input.amountCents) return { ok: false, reason: "insufficient_balance", balanceCents: balance } as const;
    const { entry } = await appendWalletEntry(conn, {
      organizationId: input.organizationId,
      userId: input.userId ?? null,
      kind: "usage",
      amountCents: -input.amountCents,
      label: input.label,
      reference: input.reference,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
    });
    return { ok: true, entry: entry!, created: true, balanceCents: balance - input.amountCents } as const;
  });
}

/** "$5.00", "−$1.20" (a true minus sign), "+$25.00" — cents in, US dollars out, no float drift. */
export function formatWalletCents(cents: number, options: { signed?: boolean } = {}): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  const text = `$${dollars}.${String(abs % 100).padStart(2, "0")}`;
  if (negative) return `−${text}`;
  return options.signed && cents > 0 ? `+${text}` : text;
}

