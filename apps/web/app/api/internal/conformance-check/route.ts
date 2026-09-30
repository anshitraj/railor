import { NextResponse } from "next/server";
import { runConformanceChecks } from "@railor/core";
import { ensureMigrated } from "@railor/database";
import { getAnyConnectedCredentials } from "../../../../lib/connections";
import { cronGuard } from "../../../../lib/cron";

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
  // Constant-time Bearer CRON_SECRET check shared by every scheduler hook.
  const denied = cronGuard(request);
  if (denied) return denied;

  await ensureMigrated();
  const summary = await runConformanceChecks({
    limit: 500,
    getConnectionCredentials: (providerId) => getAnyConnectedCredentials(providerId),
  });

  return NextResponse.json({ ok: true, ...summary });
}

export { POST as GET };
