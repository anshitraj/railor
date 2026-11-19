import "server-only";
import { eq } from "drizzle-orm";
import {
  appendWalletEntry,
  debitWalletUsage,
  getDb,
  grantSignupCredit,
  redeemWalletPromoCode,
  walletHistory,
  walletSettings,
  walletTotals,
  type WalletEntry,
  type WalletTotals,
} from "@railor/database";
import {
  AUTO_RELOAD_AMOUNTS_CENTS,
  AUTO_RELOAD_THRESHOLDS_CENTS,
  DEFAULT_AUTO_RELOAD,
  TOP_UP_AMOUNTS_CENTS,
  formatCents,
  walletRangeStart,
  type AutoReloadPreference,
  type WalletRange,
} from "./wallet-options";

/**
 * Totals for a workspace, granting the one-time $5.00 signup credit on the
 * first signed-in visit. Called on every app page (the sidebar pill), so the
 * common path is a single read; the grant is an idempotent insert.
 */
export async function ensureWallet(organizationId: string, userId: string): Promise<WalletTotals> {
  const db = await getDb();
  const totals = await walletTotals(db, organizationId);
  if (totals.signupCreditGranted) return totals;
  await grantSignupCredit(db, { organizationId, userId });
  // Re-read even when this call lost the race: a concurrent request may have just granted it.
  return walletTotals(db, organizationId);
}

/** The sidebar pill must never take the whole workspace down with it. */
export async function shellWalletBalance(organizationId: string, userId: string): Promise<number | null> {
  try {
    return (await ensureWallet(organizationId, userId)).balanceCents;
  } catch (error) {
    console.error("wallet balance unavailable", error);
    return null;
  }
}

export async function listWalletEntries(organizationId: string, range: WalletRange, now = new Date()): Promise<WalletEntry[]> {
  return walletHistory(await getDb(), organizationId, { since: walletRangeStart(range, now) });
}

export async function getAutoReload(organizationId: string): Promise<AutoReloadPreference> {
  const db = await getDb();
  const [row] = await db.select().from(walletSettings).where(eq(walletSettings.organizationId, organizationId)).limit(1);
  if (!row) return DEFAULT_AUTO_RELOAD;
  return { enabled: row.autoReloadEnabled, thresholdCents: row.autoReloadThresholdCents, amountCents: row.autoReloadAmountCents };
}

/** A message that is safe to show the person as is. */
export class WalletInputError extends Error {}

export async function saveAutoReload(organizationId: string, userId: string, input: AutoReloadPreference): Promise<AutoReloadPreference> {
  if (!(AUTO_RELOAD_THRESHOLDS_CENTS as readonly number[]).includes(input.thresholdCents)) throw new WalletInputError("Pick one of the listed balances.");
  if (!(AUTO_RELOAD_AMOUNTS_CENTS as readonly number[]).includes(input.amountCents)) throw new WalletInputError("Pick one of the listed amounts.");
  const values = {
    autoReloadEnabled: input.enabled === true,
    autoReloadThresholdCents: input.thresholdCents,
    autoReloadAmountCents: input.amountCents,
    updatedBy: userId,
    updatedAt: new Date(),
  };
  const db = await getDb();
  await db.insert(walletSettings).values({ organizationId, ...values }).onConflictDoUpdate({ target: walletSettings.organizationId, set: values });
  return { enabled: values.autoReloadEnabled, thresholdCents: input.thresholdCents, amountCents: input.amountCents };
}

const PROMO_MESSAGES = {
  invalid: "That code isn’t valid. Check the spelling and try again.",
  not_started: "That code isn’t active yet.",
  expired: "That code has expired.",
  used_up: "That code has been fully claimed.",
  already_redeemed: "This workspace has already used that code.",
} as const;

export async function redeemPromo(
  organizationId: string,
  userId: string,
  code: string,
): Promise<{ ok: true; message: string; amountCents: number } | { ok: false; message: string }> {
  const result = await redeemWalletPromoCode(await getDb(), { organizationId, userId, code });
  if (!result.ok) return { ok: false, message: PROMO_MESSAGES[result.reason] };
  return { ok: true, amountCents: result.amountCents, message: `${formatCents(result.amountCents)} added to your wallet.` };
}

/**
 * Test-mode top-ups: on for local and preview builds, off in production
 * unless RAILOR_WALLET_TEST_MODE=true. They are labelled "Test top-up" in
 * history and never touch a card or a payment provider.
 */
export function walletTestModeEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.RAILOR_WALLET_TEST_MODE === "true";
}

export async function addTestTopUp(organizationId: string, userId: string, amountCents: number, requestId: string) {
  if (!walletTestModeEnabled()) throw new WalletInputError("Adding money isn’t available yet.");
  if (!(TOP_UP_AMOUNTS_CENTS as readonly number[]).includes(amountCents)) throw new WalletInputError("Pick one of the listed amounts.");
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new WalletInputError("Refresh the page and try again.");
  return appendWalletEntry(await getDb(), {
    organizationId,
    userId,
    kind: "top_up",
    amountCents,
    label: "Test top-up",
    reference: "test-mode",
    idempotencyKey: `top_up:test:${requestId}`,
    metadata: { mode: "test" },
  });
}

/* -------------------------------------------------------------------------- */
/* Metered usage hook                                                          */
/* -------------------------------------------------------------------------- */

/** Actions that could draw on credit. Nothing is metered until it has a price. */
export type WalletMeteredAction = "price_check" | "api_request" | "agent_message" | "payroll_sheet";

/**
 * Price per unit in cents. `null` means "not metered": the action stays free
 * and `chargeWalletUsage` records nothing. Setting a number here is the
 * business decision that turns metering on for that action.
 */
export const WALLET_USAGE_PRICE_CENTS: Record<WalletMeteredAction, number | null> = {
  price_check: null,
  api_request: null,
  agent_message: null,
  payroll_sheet: null,
};

const USAGE_LABEL: Record<WalletMeteredAction, string> = {
  price_check: "Price check",
  api_request: "API request",
  agent_message: "Agent message",
  payroll_sheet: "Payroll sheet",
};

export type WalletCharge =
  | { charged: false; reason: "not_metered" }
  | { charged: true; amountCents: number; balanceCents: number; entryId: string }
  | { charged: false; reason: "insufficient_balance"; balanceCents: number };

/**
 * The one place a metered feature calls to pay for billable work.
 * `idempotencyKey` must identify the unit of work (a request id), so a retry
 * is charged once. Not wired to any feature yet: every price is null.
 */
export async function chargeWalletUsage(
  organizationId: string,
  action: WalletMeteredAction,
  options: { idempotencyKey: string; units?: number; userId?: string | null; prices?: Record<WalletMeteredAction, number | null> },
): Promise<WalletCharge> {
  const price = (options.prices ?? WALLET_USAGE_PRICE_CENTS)[action];
  if (price === null) return { charged: false, reason: "not_metered" };
  const units = options.units ?? 1;
  if (!Number.isSafeInteger(units) || units < 1) throw new RangeError("units must be a positive whole number");
  const amountCents = price * units;
  const result = await debitWalletUsage(await getDb(), {
    organizationId,
    userId: options.userId ?? null,
    amountCents,
    label: units === 1 ? USAGE_LABEL[action] : `${USAGE_LABEL[action]} × ${units}`,
    reference: action,
    idempotencyKey: `usage:${action}:${options.idempotencyKey}`,
    metadata: { units, unitPriceCents: price },
  });
  if (!result.ok) return { charged: false, reason: "insufficient_balance", balanceCents: result.balanceCents };
  return { charged: true, amountCents, balanceCents: result.balanceCents, entryId: result.entry.id };
}
