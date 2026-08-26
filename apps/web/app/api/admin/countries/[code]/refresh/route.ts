import { NextResponse } from "next/server";
import { auditLogs, getDb } from "@railor/database";
import { isResearchableCountry, RESEARCHABLE_COUNTRIES, researchCountry } from "@railor/core";
import { getSession } from "../../../../../../lib/auth";
import { checkBurstLimit } from "../../../../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Multiple Tavily searches + one Gemini extraction can easily exceed the
// platform's default function timeout — this is a genuinely slow route.
export const maxDuration = 300;

type Params = { params: Promise<{ code: string }> };

/**
 * POST /api/admin/countries/:code/refresh — the only way to trigger the
 * (paid) research pipeline over HTTP. Admin-session gated, rate-limited,
 * audit-logged. Never reachable without an authenticated admin session —
 * there is no bearer-secret or unauthenticated fallback for this route.
 */
export async function POST(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated", message: "Sign in first." }, { status: 401 });
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: "forbidden", message: "This action is restricted to Railor operators." }, { status: 403 });
  }

  if (!checkBurstLimit(`admin:country-refresh:${session.user.id}`)) {
    return NextResponse.json({ error: "rate_limited", message: "Too many refresh requests. Slow down and retry shortly." }, { status: 429 });
  }

  const { code: raw } = await params;
  const code = raw.trim().toUpperCase();
  if (!isResearchableCountry(code)) {
    return NextResponse.json(
      { error: "not_researchable", message: `${code} is not one of the researchable countries: ${RESEARCHABLE_COUNTRIES.join(", ")}.` },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { forceRefresh?: boolean };
  const forceRefresh = body.forceRefresh === true;

  try {
    const report = await researchCountry(code, { triggerType: "admin_refresh", forceRefresh });

    const db = await getDb();
    await db.insert(auditLogs).values({
      actorId: session.user.id,
      action: "country.research.refresh",
      target: code,
      metadata: { forceRefresh, runId: report.runId, status: report.status, sourcesUsed: report.sourcesUsed },
    });

    return NextResponse.json({ ok: report.status !== "failed", report });
  } catch (error) {
    // CountryNotResearchableError / ResearchAlreadyFreshError / ResearchInProgressError
    // all land here — none of them created a run row, nothing to audit-log.
    return NextResponse.json({ error: "refresh_refused", message: (error as Error).message }, { status: 409 });
  }
}
