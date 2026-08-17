import { NextResponse } from "next/server";
import { z } from "zod";
import { interpretRules, searchCorridors } from "@railor/core";
import { CorridorQuery, RankingPreset } from "@railor/types";
import { ensureMigrated } from "@railor/database";
import { getSession } from "../../../lib/auth";
import { getSatisfiedRequirements } from "../../../lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  input: z.string().max(400).optional(),
  query: CorridorQuery.partial().optional(),
  preset: RankingPreset.optional(),
});

/**
 * The public search endpoint.
 *
 * Anonymous visitors get the real interpretation, the real counts and two full
 * results - enough to know whether Railor has the answer - with the remaining
 * detail withheld rather than faked.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureMigrated();
  const { input, query: overrides, preset } = parsed.data;

  const interpretation = input
    ? interpretRules(input)
    : { input: "", query: { customerType: "business" as const }, tokens: [], missing: [], interpreter: "rules" as const };

  const query = CorridorQuery.parse({ ...interpretation.query, ...(overrides ?? {}) });

  const session = await getSession();
  const satisfiedRequirements = session?.organization
    ? await getSatisfiedRequirements(session.organization.id)
    : undefined;

  const result = await searchCorridors(query, { preset, satisfiedRequirements });
  const authenticated = Boolean(session);

  const results = authenticated
    ? result.results
    : result.results.slice(0, 3).map((r, i) => ({
        ...r,
        // Preview: the verdict and one supporting fact stay visible; the
        // commercial detail is withheld until sign-in, never fabricated.
        facts: i < 2 ? { productLabel: r.facts.productLabel, kybSummary: r.facts.kybSummary } : {},
        evidence: i < 2 ? r.evidence.slice(0, 1) : [],
        reasons: r.reasons.slice(0, 1),
      }));

  return NextResponse.json({
    interpretation: { ...interpretation, query },
    providersChecked: result.providersChecked,
    counts: result.counts,
    preset: result.preset,
    results,
    authenticated,
    generatedAt: result.generatedAt,
  });
}

