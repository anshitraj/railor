"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DISCOUNT_CODE_PATTERN, auditLogs, currencies, discountCodes, getDb, normalizeDiscountCode, providerOffers, providerPromotions, providers, walletPromoCodes } from "@railor/database";
import { requireSession } from "../../../lib/auth";
import { consumeLimit } from "../../../lib/rate-limit";
import { dodoConfig } from "../../../lib/billing/config";
import { BillingProviderError, createDodoDiscount, deleteDodoDiscount } from "../../../lib/billing/dodo";

/**
 * Operator actions for promotions. Every change is audited. Provider offers only
 * ever sit beside prices; discount and credit codes
 * change what Railor charges or credits, so they are validated tightly.
 */

const PAGE = "/admin/promotions";

async function operator() {
  const session = await requireSession();
  if (!session.user.isAdmin) throw new Error("Forbidden");
  if (!await consumeLimit("admin-promotions", session.user.id, 120, 3_600_000)) throw new Error("Rate limited");
  return session;
}

const done = (tab: string, notice: string): never => {
  revalidatePath(PAGE);
  redirect(`${PAGE}?tab=${tab}&notice=${encodeURIComponent(notice)}`);
};
const failed = (tab: string, error: string): never => redirect(`${PAGE}?tab=${tab}&error=${encodeURIComponent(error)}`);

const optionalText = z.string().trim().max(400).transform((value) => value || null);
const currency = z.string().trim().toUpperCase().transform((value) => value || null).refine((value) => value === null || /^[A-Z]{3}$/.test(value), "Use a three-letter currency code");
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,64}$/, "Use the provider’s slug, e.g. wise");
const https = z.string().trim().url().refine((value) => value.startsWith("https://"), "Use an https:// link");
// datetime-local values are read as UTC, the way the rest of the console shows times.
const when = z.string().trim().transform((value, ctx) => {
  if (!value) return null;
  const date = new Date(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}:00Z`);
  if (Number.isNaN(date.getTime())) { ctx.addIssue({ code: "custom", message: "Enter a valid date and time" }); return z.NEVER; }
  return date;
});
const windowOk = (value: { startsAt: Date | null; endsAt: Date | null }) => !value.startsAt || !value.endsAt || value.endsAt > value.startsAt;
const firstIssue = (error: z.ZodError) => error.issues[0]?.message ?? "Check the form and try again.";

async function audit(actorId: string, action: string, target: string, metadata: Record<string, unknown>) {
  const db = await getDb();
  await db.insert(auditLogs).values({ actorId, action, target, metadata });
}

/* -------------------------------------------------------------------------- */
/* Provider offers                                                             */
/* -------------------------------------------------------------------------- */

const Offer = z.object({
  providerSlug: slug,
  kind: z.enum(["fee_free", "better_rate", "bonus", "other"]),
  headline: z.string().trim().min(3).max(60),
  terms: z.string().trim().min(10, "Say who qualifies and the limits, in a sentence or two").max(400),
  sourceUrl: https,
  sourceCurrency: currency,
  destinationCurrency: currency,
  profiles: z.array(z.enum(["personal", "freelancer", "business"])).transform((value) => value.length ? value : null),
  newCustomersOnly: z.boolean(),
  startsAt: when,
  endsAt: when,
}).refine(windowOk, "The end must be after the start");

export async function createOffer(form: FormData) {
  const session = await operator();
  const parsed = Offer.safeParse({ ...Object.fromEntries(form), profiles: form.getAll("profiles"), newCustomersOnly: form.get("newCustomersOnly") === "on" });
  if (!parsed.success) failed("offers", firstIssue(parsed.error));
  const input = parsed.data!;
  const db = await getDb();
  const [row] = await db.insert(providerOffers).values({ ...input, createdBy: session.user.id }).returning({ id: providerOffers.id });
  await audit(session.user.id, "promotion.offer_created", row!.id, { providerSlug: input.providerSlug, headline: input.headline, sourceUrl: input.sourceUrl });
  done("offers", `Offer added for ${input.providerSlug}.`);
}

/* -------------------------------------------------------------------------- */
/* Discount codes (plans and top-ups)                                          */
/* -------------------------------------------------------------------------- */

const Discount = z.object({
  code: z.string().transform(normalizeDiscountCode).refine((value) => DISCOUNT_CODE_PATTERN.test(value), "Codes are 3–16 letters, digits, - or _"),
  description: optionalText,
  kind: z.enum(["percent", "amount"]),
  percent: z.coerce.number().optional(),
  amountOff: z.coerce.number().optional(),
  appliesTo: z.enum(["plan", "top_up", "any"]),
  plans: z.array(z.enum(["plus", "pro", "business"])).transform((value) => value.length ? value : null),
  cycles: z.coerce.number().int().min(1).max(24),
  maxRedemptions: z.string().trim().transform((value) => value ? Number(value) : null).refine((value) => value === null || (Number.isInteger(value) && value > 0), "Limit must be a whole number above zero"),
  startsAt: when,
  endsAt: when,
}).refine(windowOk, "The end must be after the start")
  .refine((value) => value.kind === "amount" || (value.percent !== undefined && value.percent >= 1 && value.percent <= 100), "Percent off must be between 1 and 100")
  .refine((value) => value.kind === "percent" || (value.amountOff !== undefined && value.amountOff >= 0.5 && value.amountOff <= 500), "Amount off must be between $0.50 and $500");

export async function createDiscountCode(form: FormData) {
  const session = await operator();
  const parsed = Discount.safeParse({ ...Object.fromEntries(form), plans: form.getAll("plans") });
  if (!parsed.success) failed("codes", firstIssue(parsed.error));
  const input = parsed.data!;
  const percentBps = input.kind === "percent" ? Math.round(input.percent! * 100) : null;
  const amountOffCents = input.kind === "amount" ? Math.round(input.amountOff! * 100) : null;
  const db = await getDb();
  const [existing] = await db.select({ id: discountCodes.id }).from(discountCodes).where(eq(discountCodes.code, input.code)).limit(1);
  if (existing) failed("codes", `${input.code} already exists.`);

  // Card checkouts charge through Dodo, so the same code is created there; without Dodo keys it works for USDC only.
  let dodoDiscountId: string | null = null;
  const config = dodoConfig();
  if (config) {
    const products = [
      ...(input.appliesTo !== "top_up" ? (input.plans ?? ["plus", "pro", "business"]).map((plan) => config.products[plan as "plus" | "pro" | "business"]) : []),
      ...(input.appliesTo !== "plan" ? [config.products.topUp] : []),
    ].filter((id): id is string => Boolean(id));
    try {
      dodoDiscountId = await createDodoDiscount(config, {
        code: input.code, name: input.description ?? input.code, kind: input.kind, percentBps, amountOffCents,
        productIds: products, cycles: input.cycles, usageLimit: input.maxRedemptions, startsAt: input.startsAt, endsAt: input.endsAt,
      });
    } catch (error) {
      console.error("[admin] dodo discount", error instanceof BillingProviderError ? error.message : error);
      failed("codes", "Dodo Payments didn’t accept the code, so nothing was saved. Check the Dodo dashboard and try again.");
    }
  }
  const [row] = await db.insert(discountCodes).values({
    code: input.code, description: input.description, kind: input.kind, percentBps, amountOffCents, appliesTo: input.appliesTo,
    plans: input.plans, cycles: input.cycles, maxRedemptions: input.maxRedemptions, startsAt: input.startsAt, endsAt: input.endsAt,
    dodoDiscountId, createdBy: session.user.id,
  }).returning({ id: discountCodes.id });
  await audit(session.user.id, "promotion.discount_created", input.code, { id: row!.id, kind: input.kind, percentBps, amountOffCents, appliesTo: input.appliesTo, dodo: Boolean(dodoDiscountId) });
  done("codes", dodoDiscountId ? `${input.code} is live for card and USDC.` : `${input.code} is live for USDC. Card checkouts need Dodo keys first.`);
}

/* -------------------------------------------------------------------------- */
/* Wallet credit codes                                                         */
/* -------------------------------------------------------------------------- */

const Credit = z.object({
  code: z.string().transform((value) => value.trim().toUpperCase()).refine((value) => /^[A-Z0-9-]{3,32}$/.test(value), "Codes are 3–32 letters, digits or -"),
  amount: z.coerce.number().min(0.5, "At least $0.50").max(500, "At most $500"),
  label: z.string().trim().min(3).max(80),
  maxRedemptions: z.string().trim().transform((value) => value ? Number(value) : null).refine((value) => value === null || (Number.isInteger(value) && value > 0), "Limit must be a whole number above zero"),
  startsAt: when,
  expiresAt: when,
}).refine((value) => !value.startsAt || !value.expiresAt || value.expiresAt > value.startsAt, "The end must be after the start");

export async function createCreditCode(form: FormData) {
  const session = await operator();
  const parsed = Credit.safeParse(Object.fromEntries(form));
  if (!parsed.success) failed("credit", firstIssue(parsed.error));
  const input = parsed.data!;
  const db = await getDb();
  const [existing] = await db.select({ code: walletPromoCodes.code }).from(walletPromoCodes).where(eq(walletPromoCodes.code, input.code)).limit(1);
  if (existing) failed("credit", `${input.code} already exists.`);
  await db.insert(walletPromoCodes).values({ code: input.code, amountCents: Math.round(input.amount * 100), label: input.label, maxRedemptions: input.maxRedemptions, startsAt: input.startsAt, expiresAt: input.expiresAt });
  await audit(session.user.id, "promotion.credit_created", input.code, { amountCents: Math.round(input.amount * 100), maxRedemptions: input.maxRedemptions });
  done("credit", `${input.code} adds $${input.amount.toFixed(2)} of credit.`);
}

/* -------------------------------------------------------------------------- */
/* Switching any promotion on or off                                           */
/* -------------------------------------------------------------------------- */

const Toggle = z.object({ kind: z.enum(["offer", "discount", "credit"]), id: z.string().min(1).max(64), active: z.enum(["true", "false"]) });
const TAB = { offer: "offers", discount: "codes", credit: "credit" } as const;

export async function setPromotionActive(form: FormData) {
  const session = await operator();
  const parsed = Toggle.safeParse(Object.fromEntries(form));
  if (!parsed.success) failed("offers", "That change couldn’t be applied.");
  const { kind, id, active } = parsed.data!;
  const on = active === "true";
  const db = await getDb();
  const now = new Date();
  if (kind === "offer") await db.update(providerOffers).set({ active: on, updatedAt: now }).where(eq(providerOffers.id, id));
  else if (kind === "credit") await db.update(walletPromoCodes).set({ active: on }).where(eq(walletPromoCodes.code, id));
  else {
    const [code] = await db.select().from(discountCodes).where(eq(discountCodes.id, id)).limit(1);
    if (!code) failed("codes", "That code no longer exists.");
    if (!on && code!.dodoDiscountId) {
      // Switching a code off also removes it at Dodo, so card checkouts stop honouring it.
      const config = dodoConfig();
      if (config) {
        try { await deleteDodoDiscount(config, code!.dodoDiscountId); } catch (error) {
          console.error("[admin] dodo discount delete", error instanceof BillingProviderError ? error.message : error);
          failed("codes", "Dodo Payments didn’t remove the code, so it stays on. Try again.");
        }
      }
    }
    // Switched back on, a code that was removed at Dodo works for USDC only; create a new code for card.
    await db.update(discountCodes).set({ active: on, ...(on ? {} : { dodoDiscountId: null }), updatedAt: now }).where(eq(discountCodes.id, id));
  }
  await audit(session.user.id, `promotion.${kind}_${on ? "enabled" : "disabled"}`, id, {});
  done(TAB[kind], on ? "Switched on." : "Switched off.");
}

/* -------------------------------------------------------------------------- */
/* Paid placements (Codex's provider promotions)                               */
/* -------------------------------------------------------------------------- */

const Placement = z.object({
  providerSlug: z.string().min(1).max(100),
  sourceCurrency: z.string().regex(/^[A-Z]{3}$/),
  destinationCurrency: z.string().regex(/^[A-Z]{3}$/),
  paymentReference: z.string().trim().min(4).max(160),
  paidUsd: z.string().regex(/^\d{1,7}(?:\.\d{1,2})?$/).transform((value) => Math.round(Number(value) * 100)).pipe(z.number().int().positive()),
  days: z.coerce.number().int().min(1).max(365),
  settled: z.literal("on"),
}).refine((data) => data.sourceCurrency !== data.destinationCurrency);

/** Activates a paid placement once its payment has settled. One payment reference buys one placement. */
export async function activatePromotion(form: FormData) {
  const session = await operator();
  const parsed = Placement.safeParse(Object.fromEntries(form));
  if (!parsed.success) failed("featured", "Select a valid provider and pair, enter the settled payment details, and confirm payment.");
  const { providerSlug, sourceCurrency, destinationCurrency, paymentReference, paidUsd: paidUsdCents, days } = parsed.data!;
  const db = await getDb();
  const [catalog, pair] = await Promise.all([
    db.select({ slug: providers.slug }).from(providers).where(and(eq(providers.slug, providerSlug), eq(providers.isDemo, false))).limit(1),
    db.select({ code: currencies.code }).from(currencies).where(inArray(currencies.code, [sourceCurrency, destinationCurrency])),
  ]);
  if (!catalog.length || pair.length !== 2) failed("featured", "Select a valid provider and pair, enter the settled payment details, and confirm payment.");
  const confirmedAt = new Date();
  const endsAt = new Date(confirmedAt.getTime() + days * 86_400_000);
  const created = await db.transaction(async (tx) => {
    const [row] = await tx.insert(providerPromotions).values({
      providerSlug, sourceCurrency, destinationCurrency, paymentReference, paidUsdCents, confirmedBy: session.user.id, confirmedAt, endsAt,
    }).onConflictDoNothing({ target: providerPromotions.paymentReference }).returning({ id: providerPromotions.id });
    if (!row) return false;
    await tx.insert(auditLogs).values({
      actorId: session.user.id, action: "provider_promotion.activated", target: row.id,
      metadata: { providerSlug, sourceCurrency, destinationCurrency, paidUsdCents, endsAt: endsAt.toISOString() },
    });
    return true;
  });
  if (!created) failed("featured", "This payment reference has already been used.");
  done("featured", "Paid placement activated.");
}

export async function revokePromotion(form: FormData) {
  const session = await operator();
  const id = z.string().uuid().safeParse(form.get("id"));
  if (!id.success) failed("featured", "That placement couldn’t be found.");
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [row] = await tx.update(providerPromotions).set({ revokedAt: new Date() })
      .where(and(eq(providerPromotions.id, id.data!), isNull(providerPromotions.revokedAt))).returning({ id: providerPromotions.id });
    if (row) await tx.insert(auditLogs).values({ actorId: session.user.id, action: "provider_promotion.revoked", target: row.id });
  });
  done("featured", "Placement ended.");
}
