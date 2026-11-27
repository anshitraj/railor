import { and, eq, gt } from "drizzle-orm";
import { getDb, productEvents } from "@railor/database";
import type { PriceCheckResult } from "@railor/core";
import { median, type PriceCheckData, type ProviderOpenData } from "./dashboard-metrics";
import { completePrices } from "./rate-alert-rules";

/**
 * What a workspace does in Railor, recorded so its dashboard can show real
 * history: each price check someone runs and each provider they go on to.
 * Events live in product_events beside approvals and monitoring, scoped to the
 * workspace, and are never shown to anyone outside it.
 */
export const ACTIVITY = { priceChecked: "price_checked", providerOpened: "provider_opened" } as const;

/** A calculator re-checks as people type; the same check inside this window is one check. */
const SAME_CHECK_WINDOW_MS = 10 * 60_000;

/**
 * The figures a dashboard needs from one comparison, and nothing about the person.
 * Only complete prices count (the same rule rate alerts use: no market estimates,
 * no partial costs), and each provider counts once, at its best product.
 */
export function priceCheckData(result: Pick<PriceCheckResult, "input" | "rows">): PriceCheckData {
  const seen = new Set<string>();
  const priced = completePrices(result.rows).filter((price) => !seen.has(price.providerSlug) && Boolean(seen.add(price.providerSlug)));
  const best = priced[0] ?? null;
  return {
    from: result.input.sourceCurrency,
    to: result.input.destinationCurrency,
    amount: result.input.amount,
    best: best?.amount ?? null,
    bestProvider: best?.providerName ?? null,
    median: median(priced.map((price) => price.amount)),
    options: priced.length,
  };
}

export async function recordPriceCheck(organizationId: string, actorId: string | null, result: Pick<PriceCheckResult, "input" | "rows">, now = new Date()) {
  const data = priceCheckData(result);
  const targetId = `${data.from}-${data.to}:${data.amount}`;
  const db = await getDb();
  const recent = await db.select({ id: productEvents.id }).from(productEvents).where(and(
    eq(productEvents.organizationId, organizationId), eq(productEvents.kind, ACTIVITY.priceChecked),
    eq(productEvents.targetId, targetId), gt(productEvents.createdAt, new Date(now.getTime() - SAME_CHECK_WINDOW_MS)),
  )).limit(1);
  if (recent.length) return false;
  await db.insert(productEvents).values({ organizationId, actorId, kind: ACTIVITY.priceChecked, targetId, data: { ...data } });
  return true;
}

export async function recordProviderOpened(organizationId: string, actorId: string | null, data: ProviderOpenData) {
  const db = await getDb();
  await db.insert(productEvents).values({ organizationId, actorId, kind: ACTIVITY.providerOpened, targetId: data.provider, data: { ...data } });
}
