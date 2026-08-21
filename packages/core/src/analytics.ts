/**
 * Platform and developer-usage analytics.
 *
 * Everything here reads or aggregates `api_usage` / `api_usage_daily` /
 * `audit_logs` / `observations` / `conformance_*` / `incidents` — the tables
 * that back the developer portal's usage panel, the admin console's
 * cross-org view, and a provider's reliability data. No number here is ever
 * synthesized: an empty result means "no data yet", not zero.
 */
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import {
  apiUsage,
  apiUsageDaily,
  auditLogs,
  conformanceRuns,
  conformanceTests,
  getDb,
  incidents,
  observations,
  organizations,
  users,
} from "@railor/database";

/* -------------------------------------------------------------------------- */
/* Quota resolution                                                           */
/* -------------------------------------------------------------------------- */

/** Interim defaults until real billing/plan tiers exist (RAILOR_BUILD_PROMPT.md §32-34). */
export const DEFAULT_TEST_MONTHLY_CAP = 5000;
export const DEFAULT_LIVE_MONTHLY_CAP = 100;

export function resolveMonthlyCap(key: {
  mode: "test" | "live";
  monthlyRequestCap: number | null;
}): number {
  if (key.monthlyRequestCap !== null && key.monthlyRequestCap !== undefined) {
    return key.monthlyRequestCap;
  }
  return key.mode === "test" ? DEFAULT_TEST_MONTHLY_CAP : DEFAULT_LIVE_MONTHLY_CAP;
}

export function monthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Requests recorded for a key since `since`. Indexed on (api_key_id, created_at). */
export async function getMonthlyUsageCount(apiKeyId: string, since: Date): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(apiUsage)
    .where(and(eq(apiUsage.apiKeyId, apiKeyId), gte(apiUsage.createdAt, since)));
  return row?.n ?? 0;
}

/* -------------------------------------------------------------------------- */
/* Per-org usage (developer portal)                                           */
/* -------------------------------------------------------------------------- */

export interface EndpointUsage {
  endpoint: string;
  count: number;
  errors: number;
  p95: number;
}

/**
 * Real SQL aggregation over the last `days` — replaces the old
 * `.limit(500)` + in-memory reduce, which silently truncated once an org
 * passed 500 total requests. `p95` comes from Postgres' own
 * `percentile_cont`, not a manual sort-and-index approximation.
 */
export async function getUsageByEndpoint(
  organizationId: string,
  days = 30,
): Promise<EndpointUsage[]> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({
      endpoint: apiUsage.endpoint,
      count: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where ${apiUsage.status} >= 400)::int`,
      p95: sql<number>`coalesce(round(percentile_cont(0.95) within group (
        order by ${apiUsage.latencyMs}
      ) filter (where ${apiUsage.latencyMs} is not null)), 0)::int`,
    })
    .from(apiUsage)
    .where(and(eq(apiUsage.organizationId, organizationId), gte(apiUsage.createdAt, since)))
    .groupBy(apiUsage.endpoint)
    .orderBy(sql`count(*) desc`);
  return rows;
}

export interface DailyUsagePoint {
  day: string; // YYYY-MM-DD, UTC
  count: number;
  errors: number;
}

/**
 * `days` of daily totals for the chart in the developer portal. History
 * comes from the `api_usage_daily` rollup; today (not yet rolled up) is
 * computed live from the raw table and merged in.
 */
export async function getUsageDailySeries(
  organizationId: string,
  days = 30,
): Promise<DailyUsagePoint[]> {
  const db = await getDb();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const since = new Date(todayStart.getTime() - (days - 1) * 86_400_000);

  const [rolled, [live]] = await Promise.all([
    db
      .select({
        day: apiUsageDaily.day,
        count: sql<number>`sum(${apiUsageDaily.requestCount})::int`,
        errors: sql<number>`sum(${apiUsageDaily.errorCount})::int`,
      })
      .from(apiUsageDaily)
      .where(and(eq(apiUsageDaily.organizationId, organizationId), gte(apiUsageDaily.day, since)))
      .groupBy(apiUsageDaily.day),
    db
      .select({
        count: sql<number>`count(*)::int`,
        errors: sql<number>`count(*) filter (where ${apiUsage.status} >= 400)::int`,
      })
      .from(apiUsage)
      .where(and(eq(apiUsage.organizationId, organizationId), gte(apiUsage.createdAt, todayStart))),
  ]);

  const byDay = new Map(rolled.map((r) => [r.day.toISOString().slice(0, 10), r]));
  const todayKey = todayStart.toISOString().slice(0, 10);
  if (live && (live.count > 0 || !byDay.has(todayKey))) {
    byDay.set(todayKey, { day: todayStart, count: live.count, errors: live.errors });
  }

  const out: DailyUsagePoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(todayStart.getTime() - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    const entry = byDay.get(key);
    out.push({ day: key, count: entry?.count ?? 0, errors: entry?.errors ?? 0 });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Rollup + retention                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Aggregates every `api_usage` row for the given UTC day into
 * `api_usage_daily` (upsert, safe to re-run). Call once per day, after the
 * day has fully elapsed — see `/api/internal/usage-rollup`.
 */
export async function rollupApiUsageDay(day: Date): Promise<{ day: string; rowsWritten: number }> {
  const db = await getDb();
  const dayStart = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const grouped = await db
    .select({
      organizationId: apiUsage.organizationId,
      apiKeyId: apiUsage.apiKeyId,
      endpoint: apiUsage.endpoint,
      requestCount: sql<number>`count(*)::int`,
      errorCount: sql<number>`count(*) filter (where ${apiUsage.status} >= 400)::int`,
      latencySumMs: sql<number>`coalesce(sum(${apiUsage.latencyMs}), 0)::int`,
      latencySampleCount: sql<number>`count(${apiUsage.latencyMs})::int`,
      latencyMaxMs: sql<number | null>`max(${apiUsage.latencyMs})`,
    })
    .from(apiUsage)
    .where(and(gte(apiUsage.createdAt, dayStart), lt(apiUsage.createdAt, dayEnd)))
    .groupBy(apiUsage.organizationId, apiUsage.apiKeyId, apiUsage.endpoint);

  for (const row of grouped) {
    if (!row.organizationId || !row.apiKeyId) continue; // recordUsage() always sets both; defensive only.
    await db
      .insert(apiUsageDaily)
      .values({ ...row, day: dayStart })
      .onConflictDoUpdate({
        target: [
          apiUsageDaily.organizationId,
          apiUsageDaily.apiKeyId,
          apiUsageDaily.endpoint,
          apiUsageDaily.day,
        ],
        set: {
          requestCount: row.requestCount,
          errorCount: row.errorCount,
          latencySumMs: row.latencySumMs,
          latencySampleCount: row.latencySampleCount,
          latencyMaxMs: row.latencyMaxMs,
          updatedAt: new Date(),
        },
      });
  }

  return { day: dayStart.toISOString().slice(0, 10), rowsWritten: grouped.length };
}

/** Deletes raw `api_usage` rows older than `olderThanDays`. Run after rollup. */
export async function pruneApiUsage(olderThanDays = 14): Promise<{ deleted: number; cutoff: string }> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  const deleted = await db
    .delete(apiUsage)
    .where(lt(apiUsage.createdAt, cutoff))
    .returning({ id: apiUsage.id });
  return { deleted: deleted.length, cutoff: cutoff.toISOString() };
}

/* -------------------------------------------------------------------------- */
/* Platform-wide (admin console)                                              */
/* -------------------------------------------------------------------------- */

export interface OrgUsageRow {
  organizationId: string;
  organizationName: string;
  count: number;
  errors: number;
  lastRequestAt: Date;
}

/** Cross-org usage, most active first — the admin "API usage" view. */
export async function getPlatformUsageSummary(days = 30, limit = 20): Promise<OrgUsageRow[]> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({
      organizationId: apiUsage.organizationId,
      organizationName: organizations.name,
      count: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where ${apiUsage.status} >= 400)::int`,
      // Raw sql<Date> aggregates aren't decoded through drizzle's column-level
      // timestamp parsing (only mapped columns get that) — PGlite in
      // particular returns this as a string, not a Date. Convert explicitly.
      lastRequestAt: sql<string>`max(${apiUsage.createdAt})`,
    })
    .from(apiUsage)
    .innerJoin(organizations, eq(apiUsage.organizationId, organizations.id))
    .where(gte(apiUsage.createdAt, since))
    .groupBy(apiUsage.organizationId, organizations.name)
    .orderBy(sql`count(*) desc`)
    .limit(limit);
  // The inner join guarantees organizationId is set on every matched row.
  return rows.map((r) => ({ ...r, organizationId: r.organizationId!, lastRequestAt: new Date(r.lastRequestAt) }));
}

export interface AuditLogRow {
  id: string;
  action: string;
  target: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  actorEmail: string | null;
  organizationName: string | null;
}

/** Recent admin actions. `audit_logs` was write-only until this — nothing read it back. */
export async function getAuditLog(limit = 50): Promise<AuditLogRow[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      target: auditLogs.target,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      actorEmail: users.email,
      organizationName: organizations.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorId, users.id))
    .leftJoin(organizations, eq(auditLogs.organizationId, organizations.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
  return rows;
}

/* -------------------------------------------------------------------------- */
/* Observations (provider reliability)                                        */
/* -------------------------------------------------------------------------- */

export interface ObservationSummary {
  sampleSize: number;
  successRate: number;
  p50SettlementMs: number | null;
  p95SettlementMs: number | null;
  lastObservedAt: Date | null;
}

/** Null when Railor has never actually observed this provider — never a guessed number. */
export async function getObservationSummary(providerId: string): Promise<ObservationSummary | null> {
  const db = await getDb();
  const [row] = await db
    .select({
      sampleSize: sql<number>`count(*)::int`,
      successCount: sql<number>`count(*) filter (where ${observations.success} = true)::int`,
      p50: sql<number | null>`percentile_cont(0.5) within group (
        order by ${observations.settlementMs}
      ) filter (where ${observations.settlementMs} is not null)`,
      p95: sql<number | null>`percentile_cont(0.95) within group (
        order by ${observations.settlementMs}
      ) filter (where ${observations.settlementMs} is not null)`,
      // See getPlatformUsageSummary's comment: raw sql<Date> aggregates skip
      // drizzle's column-level timestamp decoding, so this comes back as a
      // string (on PGlite) rather than a Date. Convert explicitly below.
      lastObservedAt: sql<string | null>`max(${observations.observedAt})`,
    })
    .from(observations)
    .where(eq(observations.providerId, providerId));

  if (!row || row.sampleSize === 0) return null;
  return {
    sampleSize: row.sampleSize,
    successRate: row.successCount / row.sampleSize,
    p50SettlementMs: row.p50 !== null ? Math.round(row.p50) : null,
    p95SettlementMs: row.p95 !== null ? Math.round(row.p95) : null,
    lastObservedAt: row.lastObservedAt !== null ? new Date(row.lastObservedAt) : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Conformance + incidents (provider reliability)                             */
/* -------------------------------------------------------------------------- */

export interface ConformanceRow {
  kind: string;
  label: string;
  status: string;
  detail: string | null;
  ranAt: Date | null;
}

/** Every cataloged test for a provider, each with its most recent run (or `not_tested`). */
export async function getConformanceSummary(providerId: string): Promise<ConformanceRow[]> {
  const db = await getDb();
  const tests = await db
    .select()
    .from(conformanceTests)
    .where(and(eq(conformanceTests.providerId, providerId), eq(conformanceTests.enabled, true)));
  if (!tests.length) return [];

  const testIds = tests.map((t) => t.id);
  const runs = await db
    .select()
    .from(conformanceRuns)
    .where(inArray(conformanceRuns.testId, testIds))
    .orderBy(desc(conformanceRuns.ranAt));

  const latestByTest = new Map<string, (typeof runs)[number]>();
  for (const run of runs) if (!latestByTest.has(run.testId)) latestByTest.set(run.testId, run);

  return tests.map((t) => {
    const run = latestByTest.get(t.id);
    return {
      kind: t.kind,
      label: t.label,
      status: run?.status ?? "not_tested",
      detail: run?.detail ?? null,
      ranAt: run?.ranAt ?? null,
    };
  });
}

/** Incidents in the last `days`, most recent first. */
export async function getRecentIncidents(providerId: string, days = 30, limit = 10) {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86_400_000);
  return db
    .select()
    .from(incidents)
    .where(and(eq(incidents.providerId, providerId), gte(incidents.startedAt, since)))
    .orderBy(desc(incidents.startedAt))
    .limit(limit);
}
