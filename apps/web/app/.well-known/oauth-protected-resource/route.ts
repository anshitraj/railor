import { CORS, protectedResourceMetadata } from "../../../lib/oauth-server";

export const dynamic = "force-dynamic";

/** RFC 9728: which authorization server protects this site's MCP endpoint. */
export function GET() {
  return Response.json(protectedResourceMetadata(), { headers: { ...CORS, "Cache-Control": "public, max-age=300" } });
}
export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }
