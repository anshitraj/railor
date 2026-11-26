import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import type { PriceCheckInput, PriceCheckResult, PriceRow } from "@railor/core";
import { getDb, rateAlerts, savedSearches, users } from "@railor/database";
import { onboardingPriceProfile } from "./onboarding";
import { resolvePriceInput, runPriceCheck } from "./pricing";
import { listSavedPairs, parsePairInput, type SavedPair } from "./saved-pairs";
import { savedTransferHref, type TransferBookmark } from "./saved-transfer";
import { appOrigin } from "./security";
import { completePrices, updateDecision, type BestPrice } from "./rate-alert-rules";
import { sendMail, smtpConfigured } from "./mail";
import { composeRateUpdate } from "./rate-update-compose";
import { getEntitlement, withOrgLock } from "./entitlements";
import { ALERT_FREQUENCIES, FREQUENCY_LABEL, FREQUENCY_PLAN, allowedFrequencies, nextPlanFor, PLAN_LIMITS, PLAN_PRICES, type AlertFrequency, type Plan } from "./plans";

/** What a saved pair shows about its alert. Only active alerts are listed. */
export interface RateAlertSummary {
  frequency: AlertFrequency;
  baselineAmount: number | null;
  currency: string;
  lastBestAmount: number | null;
  lastBestProvider: string | null;
  lastCheckedAt: string | null;
}

const PRICE_PAIR = sql`${savedSearches.query}->>'kind' = 'price_pair'`;

function summary(row: typeof rateAlerts.$inferSelect, currency: string): RateAlertSummary {
  return {
    frequency: (ALERT_FREQUENCIES as readonly string[]).includes(row.frequency) ? row.frequency as AlertFrequency : "weekly",
    baselineAmount: row.baselineAmount === null ? null : Number(row.baselineAmount), currency,
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

/** The exact check a saved pair opens with in the app, minus market estimates, which never count as a complete price. */
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

/** Why a plan can't have a frequency, in words that name the plan that can. */
export function frequencyLockMessage(frequency: AlertFrequency): string {
  const needs = FREQUENCY_PLAN[frequency];
  return needs ? `${FREQUENCY_LABEL[frequency]} updates are on ${PLAN_PRICES[needs].name} ($${PLAN_PRICES[needs].monthlyUsd} a month) and above.` : "Choose how often you want updates.";
}

/**
 * Turn rate updates on (or change how often) for a saved pair. Checking now
 * gives the baseline, so a "smart" update later means a real move from what the
 * person just saw, and the first scheduled update comes after a full interval.
 */
export async function setRateAlert(workspace: Workspace, savedSearchId: string, frequency: AlertFrequency): Promise<{ ok: true; alert: RateAlertSummary; best: BestPrice } | { ok: false; error: string; limit?: true }> {
  if (!ALERT_FREQUENCIES.includes(frequency)) return { ok: false, error: "Choose daily, weekly or smart updates." };
  const db = await getDb();
  const [saved] = await db.select().from(savedSearches)
    .where(and(eq(savedSearches.id, savedSearchId), eq(savedSearches.organizationId, workspace.organizationId), PRICE_PAIR)).limit(1);
  const pair = saved ? parsePairInput(saved.query) : null;
  if (!saved || !pair) return { ok: false, error: "Save this transfer first." };
  // Fail fast before the price check; the insert re-checks under the workspace lock.
  const entitlement = await getEntitlement(workspace.organizationId);
  if (!allowedFrequencies(entitlement.plan).includes(frequency)) return { ok: false, error: frequencyLockMessage(frequency) };
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
    input: input as unknown as Record<string, unknown>, frequency,
    // The percentage-target model is gone; the column keeps the baseline so the row stays valid.
    targetAmount: best.amount, baselineAmount: best.amount, active: true,
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

export interface RateAlertRun { alerts: number; checks: number; /** Updates emailed: scheduled ones and smart ones that saw a move. */ updates: number; failedChecks: number; failedEmails: number; skipped: number; overLimit: number }

/**
 * Re-check the least recently checked alerts, one price check per distinct
 * workspace + transfer, and email each person the update they asked for: daily,
 * weekly, or smart (only when the best price moved). Stops starting new checks
 * once the time budget is spent; the rest go first next run.
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

  const run: RateAlertRun = { alerts: due.length, checks: 0, updates: 0, failedChecks: 0, failedEmails: 0, skipped: 0, overLimit };
  const mail = smtpConfigured();
  const origin = appOrigin().replace(/\/$/, "");
  for (const members of groups.values()) {
    if (Date.now() - started > (options.budgetMs ?? 240_000)) { run.skipped += members.length; continue; }
    const input = members[0]!.alert.input as unknown as PriceCheckInput;
    let result: PriceCheckResult;
    try { result = await runPriceCheck(members[0]!.alert.organizationId, input); run.checks += 1; }
    catch {
      run.failedChecks += 1;
      await db.update(rateAlerts).set({ lastCheckedAt: clock() }).where(inArray(rateAlerts.id, members.map((m) => m.alert.id)));
      continue;
    }
    for (const { alert, email, query } of members) {
      const pair = parsePairInput(query);
      const best = completePrices(result.rows, pair?.provider?.slug)[0] ?? null;
      const now = clock();
      const frequency = (ALERT_FREQUENCIES as readonly string[]).includes(alert.frequency) ? alert.frequency as AlertFrequency : "weekly";
      const update = updateDecision(frequency, { lastDigestAt: alert.lastDigestAt, lastDigestAmount: alert.lastDigestAmount }, best, now);
      let updated = false;
      if (update.send && best && pair && mail && update.reason) {
        const message = await composeRateUpdate({
          to: email, priceInput: input, result, providerSlug: pair.provider?.slug, frequency, reason: update.reason, previousAmount: alert.lastDigestAmount,
          plan: plans.get(alert.organizationId) ?? "free", origin,
          compareUrl: `${origin}${savedTransferHref(pair)}`, manageUrl: `${origin}/app/saved`,
          unsubscribeUrl: `${origin}/api/alerts/unsubscribe?token=${encodeURIComponent(alert.unsubscribeToken)}`,
        });
        if (message) {
          const sent = await sendMail(message);
          if (sent.sent) { updated = true; run.updates += 1; } else run.failedEmails += 1;
        }
      }
      const startsClock = update.baseline === true;
      // A failed or skipped email leaves the clock where it was, so the next run tries again.
      await db.update(rateAlerts).set({
        lastCheckedAt: now,
        ...(best ? { lastBestAmount: best.amount, lastBestProvider: best.providerName } : {}),
        ...(best && (updated || startsClock) ? { lastDigestAt: now, lastDigestAmount: best.amount } : {}),
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
