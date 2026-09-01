import { NextResponse } from "next/server";
import { z } from "zod";
import { fillMissingFields, interpretRules, searchCorridors } from "@railor/core";
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
    ? await fillMissingFields(input, interpretRules(input))
    : { input: "", query: { customerType: "business" as const }, tokens: [], missing: [], interpreter: "rules" as const };

  const query = CorridorQuery.parse({ ...interpretation.query, ...(overrides ?? {}) });

  const session = await getSession();
  const satisfiedRequirements = session?.organization
    ? await getSatisfiedRequirements(session.organization.id)
    : undefined;

  const result = await searchCorridors(query, {
    preset,
    satisfiedRequirements,
    organizationId: session?.organization?.id,
  });
  const authenticated = Boolean(session);

  // Anonymous visitors see two previews, matching what the marketing copy
  // promises ("Show 2 provider previews"). The name, category and verdict
  // are real and unblurred — that's the hook. Everything that would let
  // someone actually act (fees, limits, evidence, the full reasoning) is
  // withheld server-side, not just hidden by CSS: the response never
  // contains it, so it can't leak through devtools either.
  const results = authenticated
    ? result.results
    : result.results.slice(0, 2).map((r) => ({
        ...r,
        facts: { productLabel: r.facts.productLabel },
        evidence: [],
        reasons: [],
        receivingMode: null,
      }));

  return NextResponse.json({
    interpretation: { ...interpretation, query },
    providersChecked: result.providersChecked,
    counts: result.counts,
    preset: result.preset,
    results,
    authenticated,
    generatedAt: result.generatedAt,
    countryContext: result.countryContext,
  });
}

