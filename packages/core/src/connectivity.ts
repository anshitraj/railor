/**
 * Route connectivity — how far Railor could actually take a specific,
 * already-compatible route today. Deliberately never inferred backwards:
 * reaching "connected" requires a real provider_connections row, reaching
 * "live_quotable" additionally requires the provider's adapter to implement
 * getQuote. Nothing here ever runs a live network call against the
 * provider — connection status is whatever the org's last explicit
 * connect/disconnect action left in the database (see apps/web/lib/
 * connections.ts, which is where that status actually gets set); testing a
 * connection live is its own separate, explicit action (GET /v1/connections),
 * not something a corridor search should trigger on every request.
 */
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb, providerConnections, connectorJobs, connectorInstallations, providers } from "@railor/database";
import { getAdapter } from "./adapters.js";
import { getPayoutAdapter } from "./payments/adapters/index.js";
import type { EligibilityVerdict, RouteConnectivityState } from "@railor/types";

/** One DB read per search, not per provider — callers loop `connectivityFor` over every result. */
export async function loadConnectionStatuses(organizationId: string): Promise<Map<string, string>> {
  const db = await getDb();
  const rows = await db
    .select({ providerId: providerConnections.providerId, status: providerConnections.status })
    .from(providerConnections)
    .where(eq(providerConnections.organizationId, organizationId));
  const statuses = new Map(rows.map((r) => [r.providerId, r.status]));
  // A successful customer-side quote plus a recently polling runtime proves a
  // local connection without ever uploading its provider credentials.
  const local = await db.select({ providerId: providers.id }).from(connectorJobs)
    .innerJoin(connectorInstallations, eq(connectorInstallations.id, connectorJobs.installationId))
    .innerJoin(providers, sql`${providers.slug} = ${connectorJobs.payload}->>'provider'`)
    .where(and(eq(connectorJobs.organizationId, organizationId), eq(connectorJobs.status, "succeeded"),
      sql`${connectorJobs.result}->>'code' = 'quoted'`, isNull(connectorInstallations.revokedAt),
      gt(connectorInstallations.lastSeenAt, new Date(Date.now() - 5 * 60_000))));
  for (const row of local) statuses.set(row.providerId, "connected");
  return statuses;
}

export function connectivityFor(
  providerSlug: string,
  verdict: EligibilityVerdict,
  connectionStatus: string | undefined,
): RouteConnectivityState {
  if (verdict !== "supported" && verdict !== "additional_requirements") return "discovered";
  const adapter = getAdapter(providerSlug);
  if (!adapter) return "compatible";
  if (connectionStatus !== "connected") return "compatible";
  // "executable": Railor has a payout adapter for this provider and the org
  // connected an account — submitPayment can actually send through it.
  if (getPayoutAdapter(providerSlug)) return "executable";
  if (!adapter.getQuote) return "connected";
  return "live_quotable";
}
