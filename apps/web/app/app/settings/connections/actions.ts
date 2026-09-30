"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "../../../../lib/auth";
import { connectProvider, disconnectProvider, retestConnection } from "../../../../lib/connections";

const Env = z.enum(["sandbox", "production"]);
// Credential forms have a handful of short fields; anything else is rejected before it is encrypted or sent anywhere.
const Credentials = z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,40}$/), z.string().max(4096)).refine((c) => Object.keys(c).length <= 12, "Too many credential fields.");

async function manager() {
  const session = await requireSession();
  if (!session.organization) return { error: "No workspace on this session." } as const;
  if (session.role !== "owner" && session.role !== "admin") return { error: "Only workspace owners and admins can manage provider credentials." } as const;
  return { organizationId: session.organization.id } as const;
}

export async function connectProviderAction(providerId: string, credentials: Record<string, string>, environment: "sandbox" | "production" = "sandbox") {
  const who = await manager();
  if ("error" in who) return { ok: false as const, detail: who.error };
  const env = Env.safeParse(environment);
  const creds = Credentials.safeParse(credentials);
  if (!env.success || !creds.success || !z.string().uuid().safeParse(providerId).success) return { ok: false as const, detail: "Invalid request." };
  const result = await connectProvider(who.organizationId, providerId, creds.data, env.data);
  revalidatePath("/app/settings/connections");
  return result;
}

export async function retestConnectionAction(connectionId: string) {
  const who = await manager();
  if ("error" in who) return { ok: false as const, detail: who.error };
  const result = await retestConnection(who.organizationId, connectionId);
  revalidatePath("/app/settings/connections");
  return result;
}

export async function disconnectProviderAction(providerId: string, environment?: "sandbox" | "production") {
  const who = await manager();
  if ("error" in who) return { ok: false as const };
  await disconnectProvider(who.organizationId, providerId, environment ? Env.parse(environment) : undefined);
  revalidatePath("/app/settings/connections");
  return { ok: true as const };
}
