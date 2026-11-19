"use server";

import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { waitForWebChecks } from "@railor/core";
import { getDb, sharedComparisons } from "@railor/database";
import { requireSession } from "../../../lib/auth";
import { consumeLimit } from "../../../lib/rate-limit";
import { buildRouteComparison } from "../../../lib/route-comparison";
import { addRouteComparisonResearch } from "../../../lib/route-comparison-research";
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

  try {
    const researched = await addRouteComparisonResearch(result, "start");
    if (researched.pendingWebChecks) after(() => waitForWebChecks());
    return { ok: true as const, result: researched };
  } catch {
    return { ok: true as const, result };
  }
}

export async function refreshRouteComparison(input: unknown) {
  const session = await requireSession();
  const parsed = RouteComparisonRequest.safeParse(input);
  if (!session.organization || !parsed.success) return null;
  if (!await consumeLimit("read-route-comparison-research", session.user.id, 35, 60_000)) return null;
  const comparison = await buildRouteComparison(parsed.data);
  return comparison ? addRouteComparisonResearch(comparison, "poll") : null;
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
