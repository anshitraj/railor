"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auditLogs, currencies, getDb, providerPromotions, providers } from "@railor/database";
import { requireSession } from "../../../lib/auth";

const formSchema = z.object({
  providerSlug: z.string().min(1).max(100),
  sourceCurrency: z.string().regex(/^[A-Z]{3}$/),
  destinationCurrency: z.string().regex(/^[A-Z]{3}$/),
  paymentReference: z.string().trim().min(4).max(160),
  paidUsd: z.string().regex(/^\d{1,7}(?:\.\d{1,2})?$/).transform(value => Math.round(Number(value) * 100)).pipe(z.number().int().positive()),
  days: z.coerce.number().int().min(1).max(365),
  settled: z.literal("on"),
}).refine(data => data.sourceCurrency !== data.destinationCurrency);

async function operator() {
  const session = await requireSession();
  if (!session.user.isAdmin) throw new Error("FORBIDDEN");
  return session.user.id;
}

export async function activatePromotion(form: FormData) {
  const actorId = await operator();
  const parsed = formSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect("/admin/promotions?status=invalid");

  const { providerSlug, sourceCurrency, destinationCurrency, paymentReference, paidUsd: paidUsdCents, days } = parsed.data;
  const db = await getDb();
  const [catalog, pair] = await Promise.all([
    db.select({ slug: providers.slug }).from(providers).where(and(eq(providers.slug, providerSlug), eq(providers.isDemo, false))).limit(1),
    db.select({ code: currencies.code }).from(currencies).where(inArray(currencies.code, [sourceCurrency, destinationCurrency])),
  ]);
  if (!catalog.length || pair.length !== 2) redirect("/admin/promotions?status=invalid");

  const confirmedAt = new Date();
  const endsAt = new Date(confirmedAt.getTime() + days * 86_400_000);
  const created = await db.transaction(async tx => {
    const [row] = await tx.insert(providerPromotions).values({
      providerSlug, sourceCurrency, destinationCurrency, paymentReference, paidUsdCents, confirmedBy: actorId, confirmedAt, endsAt,
    }).onConflictDoNothing({ target: providerPromotions.paymentReference }).returning({ id: providerPromotions.id });
    if (!row) return false;
    await tx.insert(auditLogs).values({
      actorId, action: "provider_promotion.activated", target: row.id,
      metadata: { providerSlug, sourceCurrency, destinationCurrency, paidUsdCents, endsAt: endsAt.toISOString() },
    });
    return true;
  });
  redirect(created ? "/admin/promotions?status=activated" : "/admin/promotions?status=duplicate");
}

export async function revokePromotion(form: FormData) {
  const actorId = await operator();
  const id = z.string().uuid().safeParse(form.get("id"));
  if (!id.success) redirect("/admin/promotions?status=invalid");
  const db = await getDb();
  await db.transaction(async tx => {
    const [row] = await tx.update(providerPromotions).set({ revokedAt: new Date() })
      .where(and(eq(providerPromotions.id, id.data), isNull(providerPromotions.revokedAt))).returning({ id: providerPromotions.id });
    if (row) await tx.insert(auditLogs).values({ actorId, action: "provider_promotion.revoked", target: row.id });
  });
  redirect("/admin/promotions?status=revoked");
}
