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
import { eq } from "drizzle-orm";
import { getDb, providerConnections } from "@railor/database";
import { getAdapter } from "./adapters.js";
import type { EligibilityVerdict, RouteConnectivityState } from "@railor/types";

/** One DB read per search, not per provider — callers loop `connectivityFor` over every result. */
export async function loadConnectionStatuses(organizationId: string): Promise<Map<string, string>> {
  const db = await getDb();
  const rows = await db
    .select({ providerId: providerConnections.providerId, status: providerConnections.status })
    .from(providerConnections)
    .where(eq(providerConnections.organizationId, organizationId));
  return new Map(rows.map((r) => [r.providerId, r.status]));
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
  if (!adapter.getQuote) return "connected";
  // "executable" is never reached here — adapters.ts's executeTransfer
  // refuses unconditionally, so nothing in this codebase can honestly claim
  // it today regardless of connection/quote state.
  return "live_quotable";
}
