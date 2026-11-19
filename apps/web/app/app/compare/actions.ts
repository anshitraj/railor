"use server";

import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { priceWebChecks, waitForWebChecks, type WebCheckClaim } from "@railor/core";
import { getDb, sharedComparisons } from "@railor/database";
import { requireSession } from "../../../lib/auth";
import { consumeLimit } from "../../../lib/rate-limit";
import { buildRouteComparison, comparisonLink } from "../../../lib/route-comparison";
import { RouteComparisonRequest } from "../../../lib/route-comparison-model";

/** Publishes a read-only snapshot of the current comparison at a stable URL. */
export async function shareComparison(providerSlugs: string[]) {
  const session = await requireSession();
  if (!session.organization) return { ok: false as const };

  const id = randomBytes(8).toString("base64url");
  const db = await getDb();
  await db.insert(sharedComparisons).values({
    id,
    organizationId: session.organization.id,
    title: providerSlugs.join(" vs "),
    providerSlugs,
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return { ok: true as const, url: `${base}/compare/${id}` };
}

export async function compareRoute(input: unknown) {
  const session = await requireSession();
  const parsed = RouteComparisonRequest.safeParse(input);
  if (!session.organization || !parsed.success) return { ok: false as const, error: "Choose two providers and both countries." };
  if (!await consumeLimit("route-comparison", session.user.id, 20, 60_000)) {
    return { ok: false as const, error: "Too many comparisons. Try again in a minute." };
  }
  const result = await buildRouteComparison(parsed.data);
  if (!result) return { ok: false as const, error: "One of your providers or countries is unavailable. Check your selection." };

  const audience = parsed.data.customerType === "business" ? "businesses" : "individuals";
  const product = parsed.data.product?.replaceAll("_", " ") ?? "transfers";
  const claims = result.candidates.flatMap((candidate): WebCheckClaim[] => {
    if (candidate.verdict !== "unknown" || !candidate.website) return [];
    return [{
      key: ["route-compare", candidate.slug, parsed.data.from, parsed.data.to, audience, product].join(":"),
      providerSlug: candidate.slug,
      providerName: candidate.name,
      domain: new URL(candidate.website).hostname,
      kind: "corridor",
      statement: `${candidate.name} supports ${product} funded from ${result.origin} for ${audience} sending to ${result.destination}.`,
    }];
  });
  if (claims.length) {
    try {
      let checks = await priceWebChecks(claims);
      if (checks.pending.size) {
        const running = waitForWebChecks();
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([running, new Promise<void>(resolve => { timer = setTimeout(resolve, 5500); })]).finally(() => clearTimeout(timer));
        checks = await priceWebChecks(claims);
        if (checks.pending.size) after(() => running);
      }
      for (const candidate of result.candidates) {
        const check = checks.results.find(row => row.providerSlug === candidate.slug && row.official && row.verdict !== "unclear");
        const url = comparisonLink(check?.sourceUrl);
        if (check?.quote && url) candidate.webCheck = {
          verdict: check.verdict, quote: check.quote,
          source: { url, title: check.sourceTitle ?? new URL(url).hostname, verifiedAt: check.checkedAt },
        };
      }
    } catch {
      // The country and provider evidence remains usable when a public source check is unavailable.
    }
  }
  return { ok: true as const, result };
}

export async function shareRouteComparison(input: unknown) {
  const session = await requireSession();
  const parsed = RouteComparisonRequest.safeParse(input);
  if (!session.organization || !parsed.success) return { ok: false as const };
  if (!await consumeLimit("share-route-comparison", session.user.id, 20, 60_000)) return { ok: false as const };
  const id = randomBytes(8).toString("base64url");
  const request = parsed.data;
  await (await getDb()).insert(sharedComparisons).values({
    id,
    organizationId: session.organization.id,
    title: request.providers.join(" vs "),
    providerSlugs: request.providers,
    query: { routeComparison: request },
  });
  return { ok: true as const, path: `/compare/${id}` };
}
