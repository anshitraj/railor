import { NextResponse } from "next/server";
import { runConformanceChecks } from "@railor/core";
import { ensureMigrated } from "@railor/database";
import { getAnyConnectedCredentials } from "../../../../lib/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Conformance check runner — see packages/core/src/conformance.ts. Same
 * pattern as /api/internal/source-monitor and /api/internal/coverage-gap-revalidation:
 * an external scheduler calls this (none wired up yet), gated by CRON_SECRET.
 *
 * Passes the real, decrypted-credential lookup in from here rather than from
 * @railor/core, since credential decryption owns its encryption key in
 * apps/web/lib/credentials.ts, not in the core package.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  }
  const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (presented !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await ensureMigrated();
  const summary = await runConformanceChecks({
    limit: 500,
    getConnectionCredentials: (providerId) => getAnyConnectedCredentials(providerId),
  });

  return NextResponse.json({ ok: true, ...summary });
}

export { POST as GET };
