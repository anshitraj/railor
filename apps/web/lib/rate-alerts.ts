import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import type { PriceCheckInput, PriceRow } from "@railor/core";
import { getDb, rateAlerts, savedSearches, users } from "@railor/database";
import { onboardingPriceProfile } from "./onboarding";
import { resolvePriceInput, runPriceCheck } from "./pricing";
import { listSavedPairs, parsePairInput, type SavedPair } from "./saved-pairs";
import { savedTransferHref, type TransferBookmark } from "./saved-transfer";
import { appOrigin } from "./security";
import { alertDecision, alertTarget, ALERT_STEPS, completePrices, digestDecision, type BestPrice } from "./rate-alert-rules";
import { sendMail, smtpConfigured } from "./mail";
import { createRateAlertEmail } from "./emails/rate-alert";
import { createRateDigestEmail } from "./emails/rate-digest";
import { getEntitlement, withOrgLock } from "./entitlements";
import { ALERT_UPDATES, nextPlanFor, PLAN_LIMITS, PLAN_PRICES, type Plan } from "./plans";

/** What a saved pair shows about its alert. Only active alerts are listed. */
export interface RateAlertSummary {
  targetAmount: number;
  baselineAmount: number | null;
  currency: string;
  lastBestAmount: number | null;
  lastBestProvider: string | null;
  lastCheckedAt: string | null;
}

const PRICE_PAIR = sql`${savedSearches.query}->>'kind' = 'price_pair'`;

function summary(row: typeof rateAlerts.$inferSelect, currency: string): RateAlertSummary {
  return {
    targetAmount: Number(row.targetAmount), baselineAmount: row.baselineAmount === null ? null : Number(row.baselineAmount), currency,
    lastBestAmount: row.lastBestAmount === null ? null : Number(row.lastBestAmount), lastBestProvider: row.lastBestProvider,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
  };
}

/** This person's active alerts in this workspace, keyed by saved pair id. */
export async function rateAlertsFor(organizationId: string, userId: string, savedSearchIds: string[]): Promise<Map<string, RateAlertSummary>> {
  if (!savedSearchIds.length) return new Map();
  const db = await getDb();
  const rows = await db.select({ alert: rateAlerts, query: savedSearches.query }).from(rateAlerts)
    .innerJoin(savedSearches, eq(savedSearches.id, rateAlerts.savedSearchId))
    .where(and(eq(rateAlerts.organizationId, organizationId), eq(rateAlerts.userId, userId), eq(rateAlerts.active, true), inArray(rateAlerts.savedSearchId, savedSearchIds)));
  return new Map(rows.map(({ alert, query }) => [alert.savedSearchId, summary(alert, String(query.to ?? ""))]));
}

/** The exact check a saved pair opens with in the app, minus market estimates, which never trigger alerts. */
async function pairCheckInput(pair: TransferBookmark, entityCountry: string | null | undefined, building: string | null | undefined): Promise<PriceCheckInput> {
  const params = Object.fromEntries(new URL(savedTransferHref(pair), "http://railor.local").searchParams);
  const resolved = await resolvePriceInput(params, entityCountry, onboardingPriceProfile(building));
  return {
    sourceCurrency: resolved.from, destinationCurrency: resolved.to, amount: resolved.amount, includeMarket: false, context: resolved.context,
    ...(resolved.destinationCountry ? { destinationCountry: resolved.destinationCountry } : {}),
  };
}

type Workspace = { organizationId: string; userId: string; entityCountry?: string | null; building?: string | null };
type Reader = Pick<Awaited<ReturnType<typeof getDb>>, "select">;

/** Active alerts in a workspace other than the one on this saved pair. */
async function otherActiveAlerts(db: Reader, organizationId: string, savedSearchId: string) {
  const [row] = await db.select({ n: count() }).from(rateAlerts)
    .where(and(eq(rateAlerts.organizationId, organizationId), eq(rateAlerts.active, true), ne(rateAlerts.savedSearchId, savedSearchId)));
  return Number(row?.n ?? 0);
}

export function alertLimitMessage(plan: Plan, limit: number) {
  const next = nextPlanFor(plan, "rateAlerts");
  const own = `Your plan includes ${limit} rate ${limit === 1 ? "alert" : "alerts"}.`;
  return next
    ? `${own} Remove one, or upgrade to ${PLAN_PRICES[next].name} ($${PLAN_PRICES[next].monthlyUsd} a month) for ${PLAN_LIMITS[next].rateAlerts}.`
    : `${own} Remove one to add another, or contact us for more.`;
}

/**
 * Set (or reset) an alert on a saved pair: today's best complete price plus the
 * chosen step. Checking now gives the baseline, so the target is always a real
 * improvement on what the person just saw.
 */
export async function setRateAlert(workspace: Workspace, savedSearchId: string, step: number): Promise<{ ok: true; alert: RateAlertSummary; best: BestPrice } | { ok: false; error: string; limit?: true }> {
  if (!ALERT_STEPS.includes(step as (typeof ALERT_STEPS)[number])) return { ok: false, error: "Choose one of the alert options." };
  const db = await getDb();
  const [saved] = await db.select().from(savedSearches)
    .where(and(eq(savedSearches.id, savedSearchId), eq(savedSearches.organizationId, workspace.organizationId), PRICE_PAIR)).limit(1);
  const pair = saved ? parsePairInput(saved.query) : null;
  if (!saved || !pair) return { ok: false, error: "Save this transfer first." };
  // Fail fast before the price check; the insert re-checks under the workspace lock.
  const entitlement = await getEntitlement(workspace.organizationId);
  if (await otherActiveAlerts(db, workspace.organizationId, savedSearchId) >= entitlement.limits.rateAlerts) {
    return { ok: false, error: alertLimitMessage(entitlement.plan, entitlement.limits.rateAlerts), limit: true };
  }
  const input = await pairCheckInput(pair, workspace.entityCountry, workspace.building);
  let rows: PriceRow[];
  try { rows = (await runPriceCheck(workspace.organizationId, input)).rows; }
  catch { return { ok: false, error: "Prices are unavailable right now. Try again in a moment." }; }
  const best = completePrices(rows, pair.provider?.slug)[0];
  if (!best) return { ok: false, error: pair.provider ? `${pair.provider.name} has no complete price for this transfer yet, so there’s nothing to measure from.` : "No provider has a complete price for this transfer yet, so there’s nothing to measure from." };
  const now = new Date();
  const values = {
    input: input as unknown as Record<string, unknown>, targetAmount: alertTarget(best.amount, step), baselineAmount: best.amount, active: true,
    lastCheckedAt: now, lastBestAmount: best.amount, lastBestProvider: best.providerName, lastMet: false, updatedAt: now,
    lastDigestAt: now, lastDigestAmount: best.amount,
  };
  const row = await withOrgLock(workspace.organizationId, async (tx, locked) => {
    if (await otherActiveAlerts(tx, workspace.organizationId, savedSearchId) >= locked.limits.rateAlerts) return null;
    const [inserted] = await tx.insert(rateAlerts)
      .values({ organizationId: workspace.organizationId, userId: workspace.userId, savedSearchId, unsubscribeToken: randomBytes(24).toString("base64url"), ...values })
      .onConflictDoUpdate({ target: [rateAlerts.savedSearchId, rateAlerts.userId], set: values })
      .returning();
    return inserted ?? null;
  });
  if (!row) return { ok: false, error: alertLimitMessage(entitlement.plan, entitlement.limits.rateAlerts), limit: true };
  return { ok: true, alert: summary(row, input.destinationCurrency), best };
}

export async function removeRateAlert(organizationId: string, userId: string, savedSearchId: string) {
  const db = await getDb();
  await db.delete(rateAlerts).where(and(eq(rateAlerts.organizationId, organizationId), eq(rateAlerts.userId, userId), eq(rateAlerts.savedSearchId, savedSearchId)));
}

/** One-click unsubscribe from an email link. Returns the pair it stopped, or null for an unknown token. */
export async function unsubscribeRateAlert(token: string): Promise<{ label: string } | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const db = await getDb();
  const [row] = await db.update(rateAlerts).set({ active: false, updatedAt: new Date() }).where(eq(rateAlerts.unsubscribeToken, token)).returning({ savedSearchId: rateAlerts.savedSearchId });
  if (!row) return null;
  const [saved] = await db.select({ input: savedSearches.input }).from(savedSearches).where(eq(savedSearches.id, row.savedSearchId)).limit(1);
  return { label: saved?.input ?? "this pair" };
}

export interface RateAlertRun { alerts: number; checks: number; notified: number; /** Scheduled and price-moved updates, counted apart from target emails. */ updates: number; failedChecks: number; failedEmails: number; skipped: number; overLimit: number }

/**
 * Re-check the least recently checked alerts, one price check per distinct
 * workspace + transfer, and email anyone whose target was reached. Stops
 * starting new checks once the time budget is spent; the rest go first next run.
 */
export async function checkRateAlerts(options: { limit?: number; budgetMs?: number; now?: () => Date } = {}): Promise<RateAlertRun> {
  const clock = options.now ?? (() => new Date());
  const started = Date.now();
  const db = await getDb();
  const due = await db.select({ alert: rateAlerts, email: users.email, query: savedSearches.query }).from(rateAlerts)
    .innerJoin(users, eq(users.id, rateAlerts.userId))
    .innerJoin(savedSearches, eq(savedSearches.id, rateAlerts.savedSearchId))
    .where(eq(rateAlerts.active, true))
    .orderBy(sql`${rateAlerts.lastCheckedAt} asc nulls first`, asc(rateAlerts.createdAt))
    .limit(options.limit ?? 200);

  // A workspace over its plan's limit (after a downgrade) keeps its oldest alerts running; the rest wait.
  const allowed = new Set<string>();
  const plans = new Map<string, Plan>();
  for (const organizationId of new Set(due.map((row) => row.alert.organizationId))) {
    const { limits, plan } = await getEntitlement(organizationId);
    plans.set(organizationId, plan);
    const kept = await db.select({ id: rateAlerts.id }).from(rateAlerts)
      .where(and(eq(rateAlerts.organizationId, organizationId), eq(rateAlerts.active, true)))
      .orderBy(asc(rateAlerts.createdAt), asc(rateAlerts.id)).limit(limits.rateAlerts);
    for (const { id } of kept) allowed.add(id);
  }
  const overLimit = due.filter((row) => !allowed.has(row.alert.id)).length;

  const groups = new Map<string, typeof due>();
  for (const row of due.filter((row) => allowed.has(row.alert.id))) {
    const key = `${row.alert.organizationId}|${JSON.stringify(row.alert.input)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const run: RateAlertRun = { alerts: due.length, checks: 0, notified: 0, updates: 0, failedChecks: 0, failedEmails: 0, skipped: 0, overLimit };
  const mail = smtpConfigured();
  const origin = appOrigin().replace(/\/$/, "");
  for (const members of groups.values()) {
    if (Date.now() - started > (options.budgetMs ?? 240_000)) { run.skipped += members.length; continue; }
    const input = members[0]!.alert.input as unknown as PriceCheckInput;
    let rows: PriceRow[];
    try { rows = (await runPriceCheck(members[0]!.alert.organizationId, input)).rows; run.checks += 1; }
    catch {
      run.failedChecks += 1;
      await db.update(rateAlerts).set({ lastCheckedAt: clock() }).where(inArray(rateAlerts.id, members.map((m) => m.alert.id)));
      continue;
    }
    for (const { alert, email, query } of members) {
      const pair = parsePairInput(query);
      const prices = completePrices(rows, pair?.provider?.slug);
      const best = prices[0] ?? null;
      const now = clock();
      const decision = alertDecision({ targetAmount: Number(alert.targetAmount), lastMet: alert.lastMet, lastNotifiedAt: alert.lastNotifiedAt }, best, now);
      let notified = false;
      if (decision.notify && best && pair && mail) {
        const message = createRateAlertEmail({
          to: email, from: input.sourceCurrency, toCurrency: input.destinationCurrency, amount: input.amount, providerName: pair.provider?.name,
          target: Number(alert.targetAmount), best, others: prices.slice(1, 4),
          compareUrl: `${origin}${savedTransferHref(pair)}`, manageUrl: `${origin}/app/saved`,
          unsubscribeUrl: `${origin}/api/alerts/unsubscribe?token=${encodeURIComponent(alert.unsubscribeToken)}`,
        });
        const sent = await sendMail(message);
        if (sent.sent) { notified = true; run.notified += 1; } else run.failedEmails += 1;
      }
      // The plan's own update: weekly or daily, and when the best price moves. A target email counts as an update too.
      const plan = plans.get(alert.organizationId) ?? "free";
      const update = decision.notify ? { send: false } : digestDecision(ALERT_UPDATES[plan], { lastDigestAt: alert.lastDigestAt, lastDigestAmount: alert.lastDigestAmount }, best, now);
      let updated = false;
      if (update.send && best && pair && mail && "reason" in update && update.reason) {
        const message = createRateDigestEmail({
          to: email, from: input.sourceCurrency, toCurrency: input.destinationCurrency, amount: input.amount, providerName: pair.provider?.name,
          best, others: prices.slice(1, 4), previousAmount: alert.lastDigestAmount, reason: update.reason, plan,
          compareUrl: `${origin}${savedTransferHref(pair)}`, manageUrl: `${origin}/app/saved`, plansUrl: `${origin}/pricing`,
          unsubscribeUrl: `${origin}/api/alerts/unsubscribe?token=${encodeURIComponent(alert.unsubscribeToken)}`,
        });
        const sent = await sendMail(message);
        if (sent.sent) { updated = true; run.updates += 1; } else run.failedEmails += 1;
      }
      const startsClock = "baseline" in update && update.baseline === true;
      // A failed or skipped email leaves lastMet false, so the next run tries again.
      const met = decision.notify && !notified ? false : decision.met;
      await db.update(rateAlerts).set({
        lastCheckedAt: now, lastMet: met,
        ...(best ? { lastBestAmount: best.amount, lastBestProvider: best.providerName } : {}),
        ...(notified ? { lastNotifiedAt: now } : {}),
        ...(best && (notified || updated || startsClock) ? { lastDigestAt: now, lastDigestAmount: best.amount } : {}),
      }).where(eq(rateAlerts.id, alert.id));
    }
  }
  return run;
}

/** Saved pairs with this person's alerts attached. */
export async function listSavedPairsWithAlerts(organizationId: string, userId: string): Promise<SavedPair[]> {
  const pairs = await listSavedPairs(organizationId);
  const alerts = await rateAlertsFor(organizationId, userId, pairs.map((pair) => pair.id)).catch(() => new Map<string, RateAlertSummary>());
  return pairs.map((pair) => { const alert = alerts.get(pair.id); return alert ? { ...pair, alert } : pair; });
}
