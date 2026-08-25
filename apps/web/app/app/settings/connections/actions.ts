"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../../../../lib/auth";
import { connectProvider, disconnectProvider } from "../../../../lib/connections";

export async function connectProviderAction(providerId: string, credentials: Record<string, string>) {
  const session = await requireSession();
  if (!session.organization) return { ok: false as const, detail: "No workspace on this session." };
  const result = await connectProvider(session.organization.id, providerId, credentials);
  revalidatePath("/app/settings/connections");
  return result;
}

export async function disconnectProviderAction(providerId: string) {
  const session = await requireSession();
  if (!session.organization) return { ok: false as const };
  await disconnectProvider(session.organization.id, providerId);
  revalidatePath("/app/settings/connections");
  return { ok: true as const };
}
