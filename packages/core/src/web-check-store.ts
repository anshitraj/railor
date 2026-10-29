import { desc, inArray, sql } from "drizzle-orm";
import { getDb, rateLimitBuckets, webFactChecks } from "@railor/database";
import { runWebCheck, webCheckConfigured, type WebCheckClaim, type WebCheckDeps, type WebCheckResult } from "./web-check.js";

/**
 * Where web checks live between price polls: memory first, then the
 * web_fact_checks table. A price check never waits for Google — a missing
 * check is queued in the background and lands on a later poll (the widget
 * re-quotes every 20 seconds). Concurrency and a daily cap bound the cost.
 */

const HOUR = 3_600_000;
const memory = new Map<string, { value: WebCheckResult; expiresAt: number }>();
const queued = new Map<string, WebCheckClaim>();
const inflight = new Set<string>();
let running = 0;
const idleWaiters = new Set<() => void>();
const budget = { day: "", used: 0 };
/** Billing, auth or quota failures pause every check instead of failing each one. */
const outage = { until: 0 };

function isOutage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /RESOURCE_EXHAUSTED|PERMISSION_DENIED|UNAUTHENTICATED|"code":\s*(401|402|403|429)|API key not valid|credits are depleted/i.test(message);
}

function concurrency() {
  return Math.min(4, Math.max(1, Math.floor(Number(process.env.RAILOR_WEB_CHECK_CONCURRENCY) || 2)));
}

function dailyLimit() {
  const n = Number(process.env.RAILOR_WEB_CHECK_DAILY_LIMIT);
  return Number.isFinite(n) && n >= 0 ? n : 200;
}

/** Settled verdicts hold for a week; "unclear" re-checks sooner; a failed run soonest. */
export function webCheckTtlMs(result: WebCheckResult) {
  if (result.note?.startsWith("Check failed")) return 6 * HOUR;
  return result.verdict === "unclear" ? 48 * HOUR : 7 * 24 * HOUR;
}

function remember(result: WebCheckResult, expiresAt = Date.parse(result.checkedAt) + webCheckTtlMs(result)) {
  memory.set(result.key, { value: result, expiresAt });
  if (memory.size > 2_000) memory.delete(memory.keys().next().value!);
}

export async function saveWebCheck(result: WebCheckResult) {
  const expiresAt = new Date(Date.parse(result.checkedAt) + webCheckTtlMs(result));
  remember(result, expiresAt.getTime());
  const row = {
    providerSlug: result.providerSlug, kind: result.kind, statement: result.statement, verdict: result.verdict,
    quote: result.quote, sourceUrl: result.sourceUrl, sourceTitle: result.sourceTitle, official: result.official,
    searchQueries: result.searchQueries, pages: result.pages, note: result.note, model: result.model,
    checkedAt: new Date(result.checkedAt), expiresAt,
  };
  const db = await getDb();
  await db.insert(webFactChecks).values({ key: result.key, ...row }).onConflictDoUpdate({ target: webFactChecks.key, set: row });
}

function fromRow(r: typeof webFactChecks.$inferSelect): WebCheckResult {
  return {
    key: r.key, providerSlug: r.providerSlug, kind: r.kind, statement: r.statement, verdict: r.verdict, quote: r.quote,
    sourceUrl: r.sourceUrl, sourceTitle: r.sourceTitle, official: r.official, searchQueries: r.searchQueries, pages: r.pages,
    note: r.note, model: r.model, checkedAt: r.checkedAt.toISOString(),
  };
}

async function stored(keys: string[]): Promise<WebCheckResult[]> {
  const db = await getDb();
  const rows = await db.select().from(webFactChecks).where(inArray(webFactChecks.key, keys));
  const now = Date.now();
  return rows.flatMap((r) => {
    if (r.expiresAt.getTime() <= now) return [];
    const value = fromRow(r);
    remember(value, r.expiresAt.getTime());
    return [value];
  });
}

function failed(claim: WebCheckClaim, error: unknown): WebCheckResult {
  return {
    key: claim.key, providerSlug: claim.providerSlug, kind: claim.kind, statement: claim.statement, verdict: "unclear",
    quote: null, sourceUrl: null, sourceTitle: null, official: false, searchQueries: [], pages: [],
    note: "Check failed: verification is temporarily unavailable. This statement has not been verified.", model: "unknown", checkedAt: new Date().toISOString(),
  };
}

/** A single UTC-day allowance shared by all serverless instances. Fail closed. */
async function reserveDailyCheck(): Promise<boolean> {
  const limit = Math.floor(dailyLimit());
  if (!limit) return false;
  const start = Math.floor(Date.now() / (24 * HOUR)) * 24 * HOUR;
  const db = await getDb();
  const [row] = await db.insert(rateLimitBuckets).values({
    key: "web-check-global", windowStart: new Date(start), count: 1, expiresAt: new Date(start + 24 * HOUR),
  }).onConflictDoUpdate({
    target: [rateLimitBuckets.key, rateLimitBuckets.windowStart],
    set: { count: sql`${rateLimitBuckets.count} + 1` },
    setWhere: sql`${rateLimitBuckets.count} < ${limit}`,
  }).returning({ count: rateLimitBuckets.count });
  return Boolean(row && row.count <= limit);
}

/** Hosts use this promise to keep request-scoped background work alive. */
export function waitForWebChecks(): Promise<void> {
  if (!running && !queued.size) return Promise.resolve();
  return new Promise(resolve => idleWaiters.add(resolve));
}

function notifyIdle() {
  if (!running && !queued.size) {
    for (const resolve of idleWaiters) resolve();
    idleWaiters.clear();
  }
}

function pump(deps?: WebCheckDeps) {
  while (running < concurrency() && queued.size) {
    const [key, claim] = queued.entries().next().value!;
    queued.delete(key);
    inflight.add(key);
    running++;
    reserveDailyCheck().then(async (reserved) => {
      if (!reserved) {
        outage.until = (Math.floor(Date.now() / (24 * HOUR)) + 1) * 24 * HOUR;
        queued.clear();
        return;
      }
      return runWebCheck(claim, deps)
      .then(
        (result) => saveWebCheck(result).catch(() => remember(result)),
        (error) => {
          if (!isOutage(error)) return saveWebCheck(failed(claim, error)).catch(() => undefined);
          // Retried on a later poll once the pause ends; it never cost a real check.
          outage.until = Date.now() + 30 * 60_000;
          budget.used = Math.max(0, budget.used - 1);
          queued.clear();
        },
      );
    }).catch(() => {
      // A missing/failed budget table must never authorize paid API calls.
      outage.until = Date.now() + 60_000;
      queued.clear();
    })
      .finally(() => {
        running--;
        inflight.delete(key);
        pump(deps);
        notifyIdle();
      });
  }
}

/** Queues a check unless it is already queued or running, or today's budget is spent. */
function enqueue(claim: WebCheckClaim, deps?: WebCheckDeps) {
  if (queued.has(claim.key) || inflight.has(claim.key)) return true;
  if (Date.now() < outage.until) return false;
  const day = new Date().toISOString().slice(0, 10);
  if (budget.day !== day) Object.assign(budget, { day, used: 0 });
  if (budget.used >= dailyLimit()) return false;
  budget.used++;
  queued.set(claim.key, claim);
  pump(deps);
  return true;
}

/**
 * The price check's view: every check already known, plus which of the rest
 * are now running in the background. Storage errors (an unmigrated table)
 * degrade to memory only; they never fail a price check.
 */
export async function priceWebChecks(claims: WebCheckClaim[], deps?: WebCheckDeps): Promise<{ results: WebCheckResult[]; pending: Set<string>; configured: boolean; paused: boolean }> {
  const configured = deps?.model !== undefined ? Boolean(deps.model) : webCheckConfigured();
  const now = Date.now();
  const results: WebCheckResult[] = [];
  const missing: WebCheckClaim[] = [];
  for (const claim of claims) {
    const hit = memory.get(claim.key);
    if (hit && hit.expiresAt > now) results.push(hit.value);
    else missing.push(claim);
  }
  if (missing.length) results.push(...(await stored(missing.map((c) => c.key)).catch(() => [])));
  const pending = new Set<string>();
  if (configured) {
    for (const claim of missing) if (!results.some((r) => r.key === claim.key) && enqueue(claim, deps)) pending.add(claim.key);
  }
  return { results, pending, configured, paused: configured && Date.now() < outage.until };
}

/** Recent checks for review, newest first. */
export async function recentWebChecks(limit = 100): Promise<WebCheckResult[]> {
  const db = await getDb();
  const rows = await db.select().from(webFactChecks).orderBy(desc(webFactChecks.checkedAt)).limit(limit);
  return rows.map(fromRow);
}

/** Test hook: forget every cached and queued check. */
export function resetWebCheckState() {
  memory.clear();
  queued.clear();
  Object.assign(budget, { day: "", used: 0 });
  outage.until = 0;
}
