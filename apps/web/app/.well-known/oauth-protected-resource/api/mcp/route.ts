import { CORS, protectedResourceMetadata } from "../../../../../lib/oauth-server";

export const dynamic = "force-dynamic";

/** The path-suffixed form of the same document, for clients that build the URL from the resource. */
export function GET() {
  return Response.json(protectedResourceMetadata(), { headers: { ...CORS, "Cache-Control": "public, max-age=300" } });
}
export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }
