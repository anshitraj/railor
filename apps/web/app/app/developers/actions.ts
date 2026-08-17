"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { apiKeys, getDb } from "@railor/database";
import { requireSession } from "../../../lib/auth";
import { createApiKey } from "../../../lib/org";

/**
 * Creates a key. Test keys stay revealable so the docs can keep rendering with
 * them; live keys are returned exactly once and only their hash is stored.
 */
export async function createKey(label: string, mode: "test" | "live") {
  const session = await requireSession();
  if (!session.organization) return { ok: false as const };
  if (session.role !== "owner" && session.role !== "admin") {
    return { ok: false as const, error: "insufficient_role" as const };
  }

  const { secret } = await createApiKey(session.organization.id, session.user.id, label, mode);
  revalidatePath("/app/developers");
  return { ok: true as const, secret, mode };
}

export async function revokeKey(id: string) {
  const session = await requireSession();
  if (!session.organization) return { ok: false as const };
  const db = await getDb();
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
  if (!key || key.organizationId !== session.organization.id) return { ok: false as const };
  await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id));
  revalidatePath("/app/developers");
  return { ok: true as const };
}
