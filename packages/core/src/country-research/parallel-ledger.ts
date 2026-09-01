/**
 * Durable, fail-closed accounting for Parallel. A reservation is made in the
 * database before a paid POST; ambiguous failures remain reserved/uncertain
 * until reconciled, because a timeout is not proof that Parallel was free.
 */
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  getDb,
  researchBudgetAccounts,
  researchSpendLedger,
} from "@railor/database";
import { ParallelBudgetExceededError, PARALLEL_COST_USD } from "./parallel-budget.js";
import {
  ParallelNotConfiguredError,
  parallelExtract,
  parallelSearch,
  type ParallelExtractResponse,
  type ParallelSearchOptions,
  type ParallelSearchResponse,
} from "./parallel.js";

const VENDOR = "parallel";
const LEGACY_V5_KEY = "parallel:v5-reported-2026-08-28";
const LEGACY_V5_SPEND = 0.09;

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  const value = raw ? Number.parseFloat(raw) : fallback;
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

type Operation = "search" | "extract";
type Context = { country?: string | null; provider?: string | null; idempotencyKey?: string };

export interface ParallelLedgerReport {
  scopeKey: string;
  maxSpendUsd: number;
  reserveUsd: number;
  ceilingUsd: number;
  committedUsd: number;
  reservedUsd: number;
  remainingUsd: number;
  searches: number;
  extractions: number;
  deepTasks: number;
  entries: Array<{ operationType: string; mode: string; unitCount: number; estimatedUsd: number; status: string; country: string | null; provider: string | null; summary: string | null }>;
}

/** A database-backed budget for a named campaign/month; defaults preserve the V5 ledger. */
export class PersistentParallelBudget {
  readonly scopeKey: string;
  readonly maxSpendUsd: number;
  readonly reserveUsd: number;

  constructor(options: { scopeKey?: string; maxSpendUsd?: number; reserveUsd?: number } = {}) {
    this.scopeKey = options.scopeKey ?? (process.env.PARALLEL_BUDGET_SCOPE?.trim() || "railor-global");
    this.maxSpendUsd = options.maxSpendUsd ?? envFloat("PARALLEL_MAX_SPEND_USD", 20);
    this.reserveUsd = options.reserveUsd ?? envFloat("PARALLEL_RESERVE_USD", 5);
  }

  private async transaction<T>(fn: (tx: Awaited<ReturnType<typeof getDb>>) => Promise<T>): Promise<T> {
    const db = await getDb();
    // Both configured Postgres and PGlite expose Drizzle transactions. The
    // public RailorDb alias intentionally hides driver-specific methods.
    return (db as unknown as { transaction: (run: (tx: Awaited<ReturnType<typeof getDb>>) => Promise<T>) => Promise<T> }).transaction(fn);
  }

  private async ensureAccount() {
    const db = await getDb();
    await db.insert(researchBudgetAccounts).values({
      vendor: VENDOR, scopeKey: this.scopeKey,
      maxSpendUsd: String(this.maxSpendUsd), reserveUsd: String(this.reserveUsd),
    }).onConflictDoNothing({ target: [researchBudgetAccounts.vendor, researchBudgetAccounts.scopeKey] });
    const [account] = await db.select().from(researchBudgetAccounts)
      .where(and(eq(researchBudgetAccounts.vendor, VENDOR), eq(researchBudgetAccounts.scopeKey, this.scopeKey))).limit(1);
    if (!account) throw new Error("Could not initialize the Parallel budget account.");
    // Environment configuration is the explicit operator control-plane. Keep
    // historical spend intact while applying an authorized cap/reserve change.
    if (Number(account.maxSpendUsd) !== this.maxSpendUsd || Number(account.reserveUsd) !== this.reserveUsd) {
      await db.update(researchBudgetAccounts).set({
        maxSpendUsd: String(this.maxSpendUsd), reserveUsd: String(this.reserveUsd), updatedAt: new Date(),
      }).where(eq(researchBudgetAccounts.id, account.id));
      account.maxSpendUsd = String(this.maxSpendUsd);
      account.reserveUsd = String(this.reserveUsd);
    }

    // V5 was real spend but only stored in a hand-aggregated report. Import it
    // once, keyed idempotently, rather than resetting the durable balance.
    await this.transaction(async (tx) => {
      const [existing] = await tx.select({ id: researchSpendLedger.id }).from(researchSpendLedger)
        .where(eq(researchSpendLedger.idempotencyKey, LEGACY_V5_KEY)).limit(1);
      if (existing) return;
      await tx.insert(researchSpendLedger).values({
        accountId: account.id, idempotencyKey: LEGACY_V5_KEY, operationType: "legacy", mode: "v5_reported",
        unitCount: 1, estimatedUsd: String(LEGACY_V5_SPEND), status: "committed",
        summary: "Imported from railor_v5_parallel_usage_report.json; reported actual V5 spend.", finalizedAt: new Date(),
      });
      await tx.update(researchBudgetAccounts).set({
        committedUsd: sql`${researchBudgetAccounts.committedUsd} + ${LEGACY_V5_SPEND}`,
        updatedAt: new Date(),
      }).where(eq(researchBudgetAccounts.id, account.id));
    });
    return account;
  }

  private async reserve(operation: Operation, mode: string, unitCount: number, estimatedUsd: number, context: Context) {
    const account = await this.ensureAccount();
    const idempotencyKey = context.idempotencyKey ?? `${VENDOR}:${this.scopeKey}:${randomUUID()}`;
    return this.transaction(async (tx) => {
      const [duplicate] = await tx.select().from(researchSpendLedger)
        .where(eq(researchSpendLedger.idempotencyKey, idempotencyKey)).limit(1);
      if (duplicate) throw new Error(`Parallel request idempotency key already exists: ${idempotencyKey}`);

      const [reserved] = await tx.update(researchBudgetAccounts).set({
        reservedUsd: sql`${researchBudgetAccounts.reservedUsd} + ${estimatedUsd}`,
        updatedAt: new Date(),
      }).where(and(
        eq(researchBudgetAccounts.id, account.id),
        sql`${researchBudgetAccounts.committedUsd} + ${researchBudgetAccounts.reservedUsd} + ${estimatedUsd} <= ${researchBudgetAccounts.maxSpendUsd} - ${researchBudgetAccounts.reserveUsd}`,
      )).returning();
      if (!reserved) {
        const [current] = await tx.select().from(researchBudgetAccounts).where(eq(researchBudgetAccounts.id, account.id)).limit(1);
        const remaining = Math.max(0, Number(current?.maxSpendUsd ?? 0) - Number(current?.reserveUsd ?? 0) - Number(current?.committedUsd ?? 0) - Number(current?.reservedUsd ?? 0));
        throw new ParallelBudgetExceededError(estimatedUsd, remaining);
      }
      const [entry] = await tx.insert(researchSpendLedger).values({
        accountId: account.id, idempotencyKey, operationType: operation, mode, unitCount,
        estimatedUsd: String(estimatedUsd), status: "reserved", country: context.country ?? null, provider: context.provider ?? null,
      }).returning();
      return entry!;
    });
  }

  private async finalize(entryId: string, estimatedUsd: number, status: "committed" | "released" | "uncertain", summary?: string, errorMessage?: string) {
    return this.transaction(async (tx) => {
      const [entry] = await tx.select().from(researchSpendLedger).where(eq(researchSpendLedger.id, entryId)).limit(1);
      if (!entry || entry.status !== "reserved") return;
      const accountDelta = status === "committed" || status === "uncertain" ? "committedUsd" : null;
      await tx.update(researchBudgetAccounts).set({
        reservedUsd: sql`${researchBudgetAccounts.reservedUsd} - ${estimatedUsd}`,
        ...(accountDelta ? { [accountDelta]: sql`${researchBudgetAccounts.committedUsd} + ${estimatedUsd}` } : {}),
        updatedAt: new Date(),
      }).where(eq(researchBudgetAccounts.id, entry.accountId));
      await tx.update(researchSpendLedger).set({ status, summary: summary ?? null, errorMessage: errorMessage ?? null, finalizedAt: new Date() })
        .where(eq(researchSpendLedger.id, entryId));
    });
  }

  async search(queries: string[], options: ParallelSearchOptions & { mode?: keyof typeof PARALLEL_COST_USD.search } = {}, context: Context = {}): Promise<ParallelSearchResponse> {
    const mode = options.mode ?? "advanced";
    const cost = PARALLEL_COST_USD.search[mode] * queries.length;
    const entry = await this.reserve("search", mode, queries.length, cost, context);
    try {
      const result = await parallelSearch(queries, options);
      await this.finalize(entry.id, cost, "committed", `${result.results.length} result(s)`);
      return result;
    } catch (error) {
      const preSend = error instanceof ParallelNotConfiguredError;
      await this.finalize(entry.id, cost, preSend ? "released" : "uncertain", undefined, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async extract(urls: string[], objective?: string, context: Context = {}): Promise<ParallelExtractResponse> {
    const cost = urls.length * PARALLEL_COST_USD.extractPerUrl;
    const entry = await this.reserve("extract", "extract", urls.length, cost, context);
    try {
      const result = await parallelExtract(urls, objective);
      await this.finalize(entry.id, cost, "committed", `${result.results.length} extracted; ${result.failedResults.length} failed`);
      return result;
    } catch (error) {
      const preSend = error instanceof ParallelNotConfiguredError;
      await this.finalize(entry.id, cost, preSend ? "released" : "uncertain", undefined, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async report(): Promise<ParallelLedgerReport> {
    const account = await this.ensureAccount();
    const db = await getDb();
    const [current] = await db.select().from(researchBudgetAccounts).where(eq(researchBudgetAccounts.id, account.id)).limit(1);
    const entries = await db.select().from(researchSpendLedger).where(eq(researchSpendLedger.accountId, account.id));
    const committed = Number(current?.committedUsd ?? 0);
    const reserved = Number(current?.reservedUsd ?? 0);
    const max = Number(current?.maxSpendUsd ?? this.maxSpendUsd);
    const reserve = Number(current?.reserveUsd ?? this.reserveUsd);
    return {
      scopeKey: this.scopeKey, maxSpendUsd: max, reserveUsd: reserve, ceilingUsd: max - reserve,
      committedUsd: committed, reservedUsd: reserved, remainingUsd: Math.max(0, max - reserve - committed - reserved),
      searches: entries.filter((e) => e.operationType === "search").length,
      extractions: entries.filter((e) => e.operationType === "extract").length,
      deepTasks: entries.filter((e) => e.operationType === "task").length,
      entries: entries.map((e) => ({ operationType: e.operationType, mode: e.mode, unitCount: e.unitCount, estimatedUsd: Number(e.estimatedUsd), status: e.status, country: e.country, provider: e.provider, summary: e.summary })),
    };
  }
}
