"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, savedCorridors, watchlists } from "@railor/database";
import { CorridorQuery } from "@railor/types";
import { corridorLabel } from "@railor/core";
import { requireSession } from "../../../lib/auth";
import { backfillWatchlistAlerts } from "../../../lib/alerting";

/** Turns the corridor currently on screen into a saved, watchable object. */
export async function saveCorridor(rawQuery: unknown, label?: string) {
  const session = await requireSession();
  if (!session.organization) return { ok: false as const, error: "no_org" };

  const query = CorridorQuery.parse(rawQuery);
  const db = await getDb();
  const [row] = await db
    .insert(savedCorridors)
    .values({
      organizationId: session.organization.id,
      label: label?.trim() || corridorLabel(query),
      query: query as Record<string, unknown>,
      suggested: false,
      createdBy: session.user.id,
    })
    .returning();

  revalidatePath("/app");
  revalidatePath("/app/corridors");
  return { ok: true as const, id: row?.id };
}

/** Two clicks from a result to a monitored corridor. */
export async function monitorCorridor(corridorId: string) {
  const session = await requireSession();
  if (!session.organization) return { ok: false as const };

  const db = await getDb();
  const [corridor] = await db
    .select()
    .from(savedCorridors)
    .where(eq(savedCorridors.id, corridorId))
    .limit(1);
  if (!corridor || corridor.organizationId !== session.organization.id) {
    return { ok: false as const };
  }

  const [watch] = await db
    .insert(watchlists)
    .values({
      organizationId: session.organization.id,
      targetType: "corridor",
      targetId: corridor.id,
      label: corridor.label,
      kinds: ["coverage_changed", "requirement_changed", "pricing_changed", "limit_changed", "service_degraded"],
      createdBy: session.user.id,
    })
    .returning();
  if (watch) await backfillWatchlistAlerts(watch.id);

  revalidatePath("/app/monitoring");
  return { ok: true as const };
}

export async function monitorProvider(slug: string, name: string) {
  const session = await requireSession();
  if (!session.organization) return { ok: false as const };
  const db = await getDb();
  const [watch] = await db
    .insert(watchlists)
    .values({
      organizationId: session.organization.id,
      targetType: "provider",
      targetId: slug,
      label: name,
      kinds: [
        "coverage_changed",
        "requirement_changed",
        "pricing_changed",
        "limit_changed",
        "api_changed",
        "service_degraded",
        "product_launched",
        "product_removed",
      ],
      createdBy: session.user.id,
    })
    .returning();
  if (watch) await backfillWatchlistAlerts(watch.id);
  revalidatePath("/app/monitoring");
  return { ok: true as const };
}

export async function deleteWatch(id: string) {
  const session = await requireSession();
  if (!session.organization) return { ok: false as const };
  const db = await getDb();
  const [row] = await db.select().from(watchlists).where(eq(watchlists.id, id)).limit(1);
  if (!row || row.organizationId !== session.organization.id) return { ok: false as const };
  await db.delete(watchlists).where(eq(watchlists.id, id));
  revalidatePath("/app/monitoring");
  return { ok: true as const };
}
