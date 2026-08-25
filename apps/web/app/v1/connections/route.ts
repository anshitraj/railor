import { NextResponse } from "next/server";
import type { UnifiedConnectionStatus } from "@railor/core";
import { ApiError, authenticate, recordUsage, snake, type ApiContext } from "../../../lib/api-auth";
import { getConnectableProviders, getConnectionCredentials } from "../../../lib/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /v1/connections
 *
 * The one unified surface across however many providers an org has
 * connected: same UnifiedConnectionStatus shape regardless of which
 * provider, or whether that provider even has an adapter implemented yet.
 * Live, not cached — every call re-runs each connected adapter's
 * testConnection against the real provider, so "connected" here means
 * "connected right now," not "connected as of whenever it was last saved."
 */
export async function GET(request: Request) {
  const started = Date.now();
  let context: ApiContext | null = null;
  try {
    context = await authenticate(request);

    const rows = await getConnectableProviders(context.organizationId);
    const results: UnifiedConnectionStatus[] = await Promise.all(
      rows.map(async ({ provider, connection, adapter }): Promise<UnifiedConnectionStatus> => {
        const checkedAt = new Date().toISOString();
        if (!connection) {
          return { providerSlug: provider.slug, providerName: provider.name, connected: false, detail: "Not connected.", checkedAt };
        }
        if (!adapter) {
          return {
            providerSlug: provider.slug,
            providerName: provider.name,
            connected: false,
            detail: "No adapter implemented for this provider yet.",
            checkedAt,
          };
        }
        const credentials = await getConnectionCredentials(context!.organizationId, provider.id);
        if (!credentials) {
          return { providerSlug: provider.slug, providerName: provider.name, connected: false, detail: "No credentials stored.", checkedAt };
        }
        const result = await adapter.testConnection(credentials);
        return { providerSlug: provider.slug, providerName: provider.name, connected: result.ok, detail: result.detail, checkedAt };
      }),
    );

    const payload = {
      object: "connection_status_list",
      request_id: context.requestId,
      data: results.map((r) => snake(r as unknown as Record<string, unknown>)),
      counts: {
        connected: results.filter((r) => r.connected).length,
        not_connected: results.filter((r) => !r.connected).length,
      },
      generated_at: new Date().toISOString(),
    };

    await recordUsage(context, "/v1/connections", "GET", 200, Date.now() - started);
    return NextResponse.json(payload);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 400;
    const code = error instanceof ApiError ? error.code : "invalid_request";
    await recordUsage(context, "/v1/connections", "GET", status, Date.now() - started);
    return NextResponse.json({ object: "error", error: { code, message: (error as Error).message } }, { status });
  }
}
