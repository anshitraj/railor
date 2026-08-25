import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, providerConnections, providers } from "@railor/database";
import { getAdapter } from "@railor/core";
import { credentialsConfigured, decryptCredentials, encryptCredentials } from "./credentials";

export async function getConnectableProviders(organizationId: string) {
  const db = await getDb();
  const [realProviders, existing] = await Promise.all([
    db.select().from(providers).where(eq(providers.isDemo, false)),
    db.select().from(providerConnections).where(eq(providerConnections.organizationId, organizationId)),
  ]);
  const byProvider = new Map(existing.map((c) => [c.providerId, c]));

  return realProviders
    .map((provider) => ({
      provider,
      connection: byProvider.get(provider.id) ?? null,
      adapter: getAdapter(provider.slug),
    }))
    .sort((a, b) => a.provider.name.localeCompare(b.provider.name));
}

export async function connectProvider(
  organizationId: string,
  providerId: string,
  credentials: Record<string, string>,
): Promise<{ ok: boolean; detail: string }> {
  if (!credentialsConfigured()) {
    return { ok: false, detail: "Server is not configured for storing credentials (CREDENTIALS_ENCRYPTION_KEY unset)." };
  }

  const db = await getDb();
  const [provider] = await db.select().from(providers).where(eq(providers.id, providerId)).limit(1);
  if (!provider) return { ok: false, detail: "Unknown provider." };

  const adapter = getAdapter(provider.slug);
  if (!adapter) return { ok: false, detail: `No adapter implemented for ${provider.name} yet.` };

  const result = await adapter.testConnection(credentials);
  const encrypted = encryptCredentials(credentials);
  const status = result.ok ? "connected" : "error";

  const [existing] = await db
    .select()
    .from(providerConnections)
    .where(and(eq(providerConnections.organizationId, organizationId), eq(providerConnections.providerId, providerId)))
    .limit(1);

  if (existing) {
    await db
      .update(providerConnections)
      .set({ status, encryptedCredentials: encrypted, connectedAt: result.ok ? new Date() : existing.connectedAt })
      .where(eq(providerConnections.id, existing.id));
  } else {
    await db.insert(providerConnections).values({
      organizationId,
      providerId,
      status,
      encryptedCredentials: encrypted,
      connectedAt: result.ok ? new Date() : null,
    });
  }

  return result;
}

export async function disconnectProvider(organizationId: string, providerId: string): Promise<void> {
  const db = await getDb();
  await db
    .delete(providerConnections)
    .where(and(eq(providerConnections.organizationId, organizationId), eq(providerConnections.providerId, providerId)));
}

/** Only ever called from inside an adapter call that needs to actually talk to the provider — never returned to the client. */
export async function getConnectionCredentials(
  organizationId: string,
  providerId: string,
): Promise<Record<string, string> | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(providerConnections)
    .where(and(eq(providerConnections.organizationId, organizationId), eq(providerConnections.providerId, providerId)))
    .limit(1);
  if (!row?.encryptedCredentials) return null;
  return decryptCredentials(row.encryptedCredentials);
}
