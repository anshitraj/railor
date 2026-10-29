"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { apiKeys, getDb } from "@railor/database";
import { requireSession, hashApiKey } from "../../../lib/auth";
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

  const validLabel = z.string().trim().min(1).max(100).parse(label);
  const validMode = z.enum(["test", "live"]).parse(mode);
  const { secret, key } = await createApiKey(session.organization.id, session.user.id, validLabel, validMode);
  revalidatePath("/app/developers");
  return { ok: true as const, secret, mode: validMode, id: key!.id };
}

export async function revokeKey(id: string) {
  const session = await requireSession();
  if (!session.organization) return { ok: false as const };
  if (session.role !== "owner" && session.role !== "admin") return { ok: false as const, error: "insufficient_role" };
  const db = await getDb();
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
  if (!key || key.organizationId !== session.organization.id) return { ok: false as const };
  await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id));
  revalidatePath("/app/developers");
  return { ok: true as const };
}

/** Replace only the selected key, keeping its mode and cap. Other integrations retain their keys. */
export async function regenerateKey(id: string) {
  const session = await requireSession();
  if (!session.organization || !["owner", "admin"].includes(session.role ?? "")) return { ok: false as const, error: "insufficient_role" };
  const db = await getDb(); const organizationId = session.organization.id;
  const result = await db.transaction(async tx => {
    const [old] = await tx.select().from(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, organizationId), isNull(apiKeys.revokedAt))).for("update").limit(1);
    if (!old) return { ok: false as const, error: "key_unavailable" };
    const secret = `rail_${old.mode}_${randomBytes(24).toString("base64url")}`;
    const [key] = await tx.insert(apiKeys).values({ organizationId, createdBy: session.user.id, label: old.label, mode: old.mode, prefix: secret.slice(0, 12), keyHash: hashApiKey(secret), revealableSecret: old.mode === "test" ? secret : null, monthlyRequestCap: old.monthlyRequestCap }).returning();
    await tx.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, old.id));
    return { ok: true as const, secret, id: key!.id, mode: old.mode };
  });
  revalidatePath("/app/developers"); return result;
}
