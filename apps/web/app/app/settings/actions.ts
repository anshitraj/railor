"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../../../lib/auth";
import { renameOrganization } from "../../../lib/org";

export async function updateWorkspaceName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false as const };
  const session = await requireSession();
  if (!session.organization) return { ok: false as const };
  await renameOrganization(session.organization.id, trimmed);
  revalidatePath("/app/settings");
  revalidatePath("/app");
  return { ok: true as const };
}
