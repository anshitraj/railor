import { NextResponse } from "next/server";
import { z } from "zod";
import { interpretRules, searchCorridors } from "@railor/core";
import { consumeLimit, requestIdentity } from "../../../lib/rate-limit";
import { CorridorQuery, RankingPreset } from "@railor/types";
import { ensureMigrated } from "@railor/database";
import { getSession } from "../../../lib/auth";
import { getSatisfiedRequirements } from "../../../lib/org";
import { getCachedMarketDiscovery } from "../../../lib/market-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  input: z.string().max(400).optional(),
  query: CorridorQuery.partial().optional(),
  preset: RankingPreset.optional(),
  /** Force a cached fresh-market pass. Authenticated callers only. */
  discover: z.boolean().optional(),
});

/**
 * The public search endpoint.
 *
 * Anonymous visitors get the real interpretation, the real counts and two full
 * results - enough to know whether Railor has the answer - with the remaining
 * detail withheld rather than faked.
 */
export async function POST(request: Request) {
  if (!await consumeLimit("public-search", requestIdentity(request), 60, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
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

  const result = await searchCorridors(query, {
    preset,
    satisfiedRequirements,
    organizationId: session?.organization?.id,
  });
  const authenticated = Boolean(session);
  const hasDirectionalRoute = Boolean(
    query.destinationCurrency &&
      (query.sourceCurrency || query.sourceAsset || query.sourceCountry),
  );
  const hasConfirmedCatalogRoute = result.results.some(
    (candidate) =>
      candidate.routeConfirmation === "confirmed" &&
      (candidate.eligibility === "supported" || candidate.eligibility === "additional_requirements"),
  );
  const shouldDiscover = authenticated && hasDirectionalRoute && (parsed.data.discover === true || !hasConfirmedCatalogRoute);
  let marketDiscovery = null;
  if (shouldDiscover) {
    const discoveryAllowed = await consumeLimit(
      "market-discovery",
      requestIdentity(request),
      10,
      60 * 60_000,
    );
    if (discoveryAllowed) marketDiscovery = await getCachedMarketDiscovery(query, session?.organization?.id);
  }

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
        routeConfirmation: null,
        confirmedDimensions: [],
        unconfirmedDimensions: [],
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
    marketDiscovery,
  });
}
