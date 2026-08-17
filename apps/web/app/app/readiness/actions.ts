"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../../../lib/auth";
import { setKybItem } from "../../../lib/org";

/** Tri-state, one tap: have it / don't have it / not sure. */
export async function setReadiness(
  requirementKey: string,
  status: "have" | "missing" | "unsure",
) {
  const session = await requireSession();
  if (!session.organization) return { ok: false as const };
  await setKybItem(session.organization.id, requirementKey, status, session.user.id);
  revalidatePath("/app/readiness");
  revalidatePath("/app");
  return { ok: true as const };
}

/** Bulk apply from a pasted provider checklist. */
export async function applyParsedRequirements(keys: string[]) {
  const session = await requireSession();
  if (!session.organization) return { ok: false as const };
  for (const key of keys) {
    await setKybItem(session.organization.id, key, "have", session.user.id);
  }
  revalidatePath("/app/readiness");
  return { ok: true as const, count: keys.length };
}
