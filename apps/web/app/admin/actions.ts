"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auditLogs, changeEvents, getDb, providerCapabilities } from "@railor/database";
import { requireSession } from "../../lib/auth";
import { fanOutAlertsForChange } from "../../lib/alerting";

async function requireAdmin() {
  const session = await requireSession();
  if (!session.user.isAdmin) throw new Error("FORBIDDEN");
  return session;
}

/**
 * Approving a change is the only path from "detected" to "published".
 * Coverage changes are applied to the capability graph; anything Railor cannot
 * apply mechanically is approved as a recorded fact for a human to action,
 * never silently written.
 */
export async function approveChange(id: string) {
  const session = await requireAdmin();
  const db = await getDb();

  const [change] = await db.select().from(changeEvents).where(eq(changeEvents.id, id)).limit(1);
  if (!change) return { ok: false as const, error: "not_found" as const };

  let applied = false;
  const [kind, key] = change.field.split(":");

  if (kind === "entity_country" && key && change.currentValue) {
    const availability =
      change.currentValue === "unsupported"
        ? "unsupported"
        : change.currentValue === "partial"
          ? "partial"
          : "supported";

    await db
      .update(providerCapabilities)
      .set({ availability, updatedAt: new Date(), lastVerifiedAt: new Date() })
      .where(
        and(
          eq(providerCapabilities.providerId, change.providerId),
          eq(providerCapabilities.entityCountry, key),
        ),
      );
    applied = true;
  }

  await db
    .update(changeEvents)
    .set({ reviewStatus: "approved", reviewedBy: session.user.id, reviewedAt: new Date() })
    .where(eq(changeEvents.id, id));

  const alerted = await fanOutAlertsForChange(id);

  await db.insert(auditLogs).values({
    actorId: session.user.id,
    action: applied ? "change.approved.applied" : "change.approved.recorded",
    target: id,
    metadata: { field: change.field, current: change.currentValue, alertsRaised: alerted },
  });

  revalidatePath("/admin");
  return { ok: true as const, applied };
}

export async function rejectChange(id: string) {
  const session = await requireAdmin();
  const db = await getDb();

  await db
    .update(changeEvents)
    .set({ reviewStatus: "rejected", reviewedBy: session.user.id, reviewedAt: new Date() })
    .where(eq(changeEvents.id, id));

  await db.insert(auditLogs).values({
    actorId: session.user.id,
    action: "change.rejected",
    target: id,
    metadata: {},
  });

  revalidatePath("/admin");
  return { ok: true as const };
}
