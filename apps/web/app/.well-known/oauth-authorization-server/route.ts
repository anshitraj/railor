import { authorizationServerMetadata, CORS } from "../../../lib/oauth-server";

export const dynamic = "force-dynamic";

/** RFC 8414: where to register, sign in and exchange codes. */
export function GET() {
  return Response.json(authorizationServerMetadata(), { headers: { ...CORS, "Cache-Control": "public, max-age=300" } });
}
export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }
