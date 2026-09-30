"use server";
import { and, eq, sql } from "drizzle-orm";
import { auditLogs, getDb, organizationEntitlements, organizations } from "@railor/database";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "../../../lib/auth";
import { consumeLimit } from "../../../lib/rate-limit";
import { PLAN_LIMITS } from "../../../lib/plans";

const Activation = z.object({ slug: z.string().trim().min(1).max(120), reference: z.string().trim().min(4).max(160), validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).transform((s) => new Date(`${s}:00Z`)).refine((d) => Number.isFinite(d.getTime())) });
export async function activateFounding(form: FormData) {
  const session = await requireSession();
  if (!session.user.isAdmin) throw new Error("Forbidden");
  if (!await consumeLimit("admin-activation", session.user.id, 20, 3_600_000)) throw new Error("Rate limited");
  const input = Activation.parse(Object.fromEntries(form));
  const now = new Date();
  if (input.validUntil <= now || input.validUntil.getTime() > now.getTime() + 62 * 86_400_000) throw new Error("Expiry must be within the next 62 days");
  const db = await getDb();
  await db.transaction(async (tx) => {
    // Serialize payment-reference reuse checks across all organizations.
    await tx.execute(sql`select pg_advisory_xact_lock(824101)`);
    const [org] = await tx.select().from(organizations).where(eq(organizations.slug, input.slug)).for("update");
    if (!org) throw new Error("Workspace not found");
    const [previous] = await tx.select().from(auditLogs).where(and(eq(auditLogs.action, "entitlement.activated"), eq(auditLogs.target, input.reference))).limit(1);
    if (previous) {
      if (previous.organizationId !== org.id) throw new Error("Reference already belongs to another workspace");
      return; // Repeating an activation never extends the expiry.
    }
    const values = { plan: "founding" as const, status: "active" as const, validFrom: now, validUntil: input.validUntil, activationReference: input.reference, limits: { ...PLAN_LIMITS.founding }, activatedBy: session.user.id, updatedAt: now };
    await tx.insert(organizationEntitlements).values({ organizationId: org.id, ...values }).onConflictDoUpdate({ target: organizationEntitlements.organizationId, set: values });
    await tx.insert(auditLogs).values({ organizationId: org.id, actorId: session.user.id, action: "entitlement.activated", target: input.reference, metadata: { plan: "founding", validUntil: input.validUntil.toISOString() } });
  });
  revalidatePath("/app/settings");
  redirect("/admin/access?activated=1");
}
