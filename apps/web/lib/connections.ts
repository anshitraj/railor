import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb, providerConnections, providers } from "@railor/database";
import { getAdapter, getPayoutAdapter } from "@railor/core";
import { credentialsConfigured, decryptCredentials, encryptCredentials } from "./credentials";
import { getEntitlement } from "./entitlements";

export type ConnectionEnvironment = "sandbox" | "production";

/**
 * Every real provider with what Railor can do through it (test, quote,
 * execute payouts) and the org's sandbox/production connections. Providers
 * Railor has an adapter for sort first — those are the ones a connection
 * actually unlocks something for.
 */
export async function getConnectableProviders(organizationId: string) {
  const db = await getDb();
  const [realProviders, existing] = await Promise.all([
    db.select().from(providers).where(eq(providers.isDemo, false)),
    db.select().from(providerConnections).where(eq(providerConnections.organizationId, organizationId)),
  ]);
  return realProviders
    .map((provider) => {
      const adapter = getAdapter(provider.slug);
      const payout = getPayoutAdapter(provider.slug);
      const connections = existing.filter((c) => c.providerId === provider.id);
      return {
        provider,
        adapter,
        payout,
        connection: connections.find((c) => c.status === "connected") ?? connections[0] ?? null,
        connections,
      };
    })
    .sort((a, b) => Number(Boolean(b.payout)) - Number(Boolean(a.payout)) || Number(Boolean(b.adapter)) - Number(Boolean(a.adapter)) || a.provider.name.localeCompare(b.provider.name));
}

export async function connectProvider(
  organizationId: string,
  providerId: string,
  credentials: Record<string, string>,
  environment: ConnectionEnvironment = "sandbox",
): Promise<{ ok: boolean; detail: string }> {
  if (!(await getEntitlement(organizationId)).limits.providerConnections) {
    return { ok: false, detail: "Provider connections require active Founding access." };
  }
  if (!credentialsConfigured()) {
    return { ok: false, detail: "Server is not configured for storing credentials (CREDENTIALS_ENCRYPTION_KEY unset)." };
  }

  const db = await getDb();
  const [provider] = await db.select().from(providers).where(eq(providers.id, providerId)).limit(1);
  if (!provider) return { ok: false, detail: "Unknown provider." };

  const adapter = getAdapter(provider.slug);
  if (!adapter) return { ok: false, detail: `No adapter implemented for ${provider.name} yet.` };

  // The connection's environment decides which API the adapter calls — never a typed field.
  const cleaned = Object.fromEntries(Object.entries(credentials).map(([k, v]) => [k, String(v).trim()]).filter(([k, v]) => v && k !== "environment"));
  const result = await adapter.testConnection({ ...cleaned, environment });
  if (!result.ok) return result;

  const [existing] = await db
    .select()
    .from(providerConnections)
    .where(and(eq(providerConnections.organizationId, organizationId), eq(providerConnections.providerId, providerId), eq(providerConnections.environment, environment)))
    .limit(1);
  const values = {
    status: "connected",
    encryptedCredentials: encryptCredentials(cleaned),
    connectedAt: new Date(),
    lastCheckedAt: new Date(),
    lastCheckDetail: result.detail,
  };
  if (existing) await db.update(providerConnections).set(values).where(eq(providerConnections.id, existing.id));
  else await db.insert(providerConnections).values({ organizationId, providerId, environment, ...values });
  return result;
}

/** Re-runs the live connection test with the stored credentials and records the outcome. */
export async function retestConnection(organizationId: string, connectionId: string): Promise<{ ok: boolean; detail: string }> {
  const db = await getDb();
  const [row] = await db
    .select({ connection: providerConnections, slug: providers.slug })
    .from(providerConnections)
    .innerJoin(providers, eq(providerConnections.providerId, providers.id))
    .where(and(eq(providerConnections.id, connectionId), eq(providerConnections.organizationId, organizationId)))
    .limit(1);
  if (!row?.connection.encryptedCredentials) return { ok: false, detail: "Connection not found." };
  const adapter = getAdapter(row.slug);
  if (!adapter) return { ok: false, detail: "No adapter for this provider." };
  const result = await adapter.testConnection({ ...decryptCredentials(row.connection.encryptedCredentials), environment: row.connection.environment });
  await db
    .update(providerConnections)
    .set({ status: result.ok ? "connected" : "error", lastCheckedAt: new Date(), lastCheckDetail: result.detail })
    .where(eq(providerConnections.id, connectionId));
  return result;
}

export async function disconnectProvider(organizationId: string, providerId: string, environment?: ConnectionEnvironment): Promise<void> {
  const db = await getDb();
  await db
    .delete(providerConnections)
    .where(
      and(
        eq(providerConnections.organizationId, organizationId),
        eq(providerConnections.providerId, providerId),
        ...(environment ? [eq(providerConnections.environment, environment)] : []),
      ),
    );
}

/** Only ever called from inside an adapter call that needs to actually talk to the provider — never returned to the client. Production wins when both exist. */
export async function getConnectionCredentials(
  organizationId: string,
  providerId: string,
): Promise<Record<string, string> | null> {
  if (!(await getEntitlement(organizationId)).limits.providerConnections) return null;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(providerConnections)
    .where(and(eq(providerConnections.organizationId, organizationId), eq(providerConnections.providerId, providerId), eq(providerConnections.status, "connected")))
    .orderBy(desc(providerConnections.environment))
    .limit(1);
  if (!row?.encryptedCredentials) return null;
  return { ...decryptCredentials(row.encryptedCredentials), environment: row.environment };
}

/**
 * For the conformance runner only (packages/core/src/conformance.ts): does
 * ANY organization have this provider actually connected, real credentials
 * and all. Which org proved it is never stored or exposed — the check it
 * feeds answers "does Railor's integration correctly authenticate against
 * this provider's real API," a fact independent of whose account confirmed it.
 */
export async function getAnyConnectedCredentials(providerId: string): Promise<Record<string, string> | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(providerConnections)
    .where(and(eq(providerConnections.providerId, providerId), eq(providerConnections.status, "connected")))
    .orderBy(desc(providerConnections.connectedAt))
    .limit(1);
  if (!row?.encryptedCredentials) return null;
  return { ...decryptCredentials(row.encryptedCredentials), environment: row.environment };
}
