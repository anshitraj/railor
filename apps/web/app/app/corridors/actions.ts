"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { getDb, savedCorridors, watchlists } from "@railor/database";
import { ChangeKind, CorridorQuery } from "@railor/types";
import { z } from "zod";
import { corridorLabel } from "@railor/core";
import { requireSession } from "../../../lib/auth";
import { createWatchlist } from "../../../lib/watchlists";
import { withOrgLock } from "../../../lib/entitlements";

/** Turns the corridor currently on screen into a saved, watchable object. */
export async function saveCorridor(rawQuery: unknown, label?: string) {
  const session = await requireSession();
  if (!session.organization) return { ok: false as const, error: "no_org" };
  if (session.role === "viewer") return { ok: false as const, error: "read_only" };

  const query = CorridorQuery.parse(rawQuery);
  const organizationId = session.organization.id;
  const row = await withOrgLock(organizationId, async (db, entitlement) => {
    const [usage] = await db.select({ count: sql<number>`count(*)::int` }).from(savedCorridors).where(eq(savedCorridors.organizationId, organizationId));
    if ((usage?.count ?? 0) >= entitlement.limits.savedCorridors) return null;
    const [created] = await db
    .insert(savedCorridors)
    .values({
      organizationId,
      label: label?.trim().slice(0, 160) || corridorLabel(query),
      query: query as Record<string, unknown>,
      suggested: false,
      createdBy: session.user.id,
    })
    .returning();
    return created;
  });
  if (!row) return { ok: false as const, error: "corridor_limit" };

  revalidatePath("/app");
  revalidatePath("/app/corridors");
  return { ok: true as const, id: row?.id };
}

/** Two clicks from a result to a monitored corridor. */
export async function monitorCorridor(corridorId: string) {
  const session = await requireSession();
  if (!session.organization) return { ok: false as const };
  if (session.role === "viewer") return { ok: false as const, error: "read_only" };
  try {
    await createWatchlist(session.organization.id, session.user.id, { target_type: "corridor", target_id: corridorId });
  } catch { return { ok: false as const, error: "Unable to monitor this corridor. Check your plan limit and corridor." }; }

  revalidatePath("/app/monitoring");
  return { ok: true as const };
}

export async function monitorProvider(slug: string, name: string) {
  const session = await requireSession();
  if (!session.organization) return { ok: false as const };
  if (session.role === "viewer") return { ok: false as const, error: "read_only" };
  try {
    await createWatchlist(session.organization.id, session.user.id, { target_type: "provider", target_id: slug });
  } catch { return { ok: false as const, error: "Unable to monitor this provider. Check your plan limit and provider." }; }
  revalidatePath("/app/monitoring");
  return { ok: true as const };
}

export async function deleteWatch(id: string) {
  const session = await requireSession();
  if (!session.organization) return { ok: false as const };
  if (session.role === "viewer") return { ok: false as const };
  const db = await getDb();
  const [row] = await db.select().from(watchlists).where(eq(watchlists.id, id)).limit(1);
  if (!row || row.organizationId !== session.organization.id) return { ok: false as const };
  await db.delete(watchlists).where(eq(watchlists.id, id));
  revalidatePath("/app/monitoring");
  return { ok: true as const };
}

const WatchSettings = z.object({
  digest: z.enum(["instant", "daily", "weekly"]).optional(),
  channelEmail: z.boolean().optional(),
  kinds: z.array(ChangeKind).min(1).optional(),
});

/** Retune one monitor: how often it emails, and which change kinds it raises. */
export async function updateWatch(id: string, raw: unknown) {
  const session = await requireSession();
  if (!session.organization) return { ok: false as const, error: "no_org" };
  if (session.role === "viewer") return { ok: false as const, error: "read_only" };
  const parsed = WatchSettings.safeParse(raw);
  if (!parsed.success || !z.string().uuid().safeParse(id).success) return { ok: false as const, error: "invalid" };
  const db = await getDb();
  const [row] = await db.select().from(watchlists).where(eq(watchlists.id, id)).limit(1);
  if (!row || row.organizationId !== session.organization.id) return { ok: false as const, error: "not_found" };
  await db.update(watchlists).set(parsed.data).where(eq(watchlists.id, id));
  revalidatePath("/app/monitoring");
  return { ok: true as const };
}
