/**
 * Phase C, step one: cheap, no-LLM source monitoring. `source_documents`
 * already had `etag`/`lastModified`/`contentHash`/`nextCheckAt`/
 * `failureCount` columns and a provider-profile page already displays
 * "checked every {crawlFrequencyHours}h" next to a freshness badge derived
 * from `lastCheckedAt` — but nothing ever wrote to any of those columns
 * after the row was first inserted, so that display has been silently
 * frozen at ingestion time ever since. This file is what actually drives it.
 *
 * Strategy, cheapest first (never a search/LLM call for an unchanged page):
 *   conditional GET (If-None-Match / If-Modified-Since from the stored
 *   etag/lastModified) -> 304 means unchanged, stop
 *   -> otherwise hash the body and compare to the stored contentHash
 *   -> unchanged hash means unchanged, stop
 *   -> changed hash creates one change_event (kind: documentation_changed)
 *      and stops. It does NOT re-run extraction — a changed source enters
 *      review as a fact to re-verify, not an automatically-trusted new fact.
 *      That's `provider-research/ingest.ts`'s job, deliberately kept separate.
 */
import { createHash } from "node:crypto";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { changeEvents, getDb, sourceDocuments } from "@railor/database";

const hash = (v: string) => createHash("sha256").update(v).digest("hex");

export type SourceCheckOutcome = "unchanged" | "changed" | "failed" | "skipped_no_provider_for_change_event";

export interface SourceCheckResult {
  sourceDocumentId: string;
  url: string;
  outcome: SourceCheckOutcome;
  detail: string;
}

/** One document, one cheap check. Never throws — a failure is a result, not an exception, so a batch of 200 sources survives one bad URL. */
export async function checkSource(sourceDocumentId: string, now: Date = new Date()): Promise<SourceCheckResult> {
  const db = await getDb();
  const [doc] = await db.select().from(sourceDocuments).where(eq(sourceDocuments.id, sourceDocumentId)).limit(1);
  if (!doc) return { sourceDocumentId, url: "", outcome: "failed", detail: "source_documents row not found" };

  const headers: Record<string, string> = {};
  if (doc.etag) headers["if-none-match"] = doc.etag;
  if (doc.lastModified) headers["if-modified-since"] = doc.lastModified;

  let response: Response;
  try {
    response = await fetch(doc.url, { headers, signal: AbortSignal.timeout(15_000), redirect: "follow" });
  } catch (error) {
    await db.update(sourceDocuments).set({
      lastCheckedAt: now,
      nextCheckAt: new Date(now.getTime() + doc.crawlFrequencyHours * 3_600_000),
      failureCount: doc.failureCount + 1,
      lastError: error instanceof Error ? error.message : String(error),
    }).where(eq(sourceDocuments.id, doc.id));
    return { sourceDocumentId, url: doc.url, outcome: "failed", detail: error instanceof Error ? error.message : String(error) };
  }

  const nextCheckAt = new Date(now.getTime() + doc.crawlFrequencyHours * 3_600_000);

  if (response.status === 304) {
    await db.update(sourceDocuments).set({ lastCheckedAt: now, nextCheckAt, failureCount: 0, lastError: null }).where(eq(sourceDocuments.id, doc.id));
    return { sourceDocumentId, url: doc.url, outcome: "unchanged", detail: "304 Not Modified" };
  }

  if (!response.ok) {
    await db.update(sourceDocuments).set({
      lastCheckedAt: now, nextCheckAt, failureCount: doc.failureCount + 1, lastError: `HTTP ${response.status}`,
    }).where(eq(sourceDocuments.id, doc.id));
    return { sourceDocumentId, url: doc.url, outcome: "failed", detail: `HTTP ${response.status}` };
  }

  const body = await response.text();
  const newHash = hash(body);
  const newEtag = response.headers.get("etag");
  const newLastModified = response.headers.get("last-modified");
  const unchanged = doc.contentHash !== null && doc.contentHash === newHash;

  await db.update(sourceDocuments).set({
    lastCheckedAt: now,
    nextCheckAt,
    etag: newEtag ?? doc.etag,
    lastModified: newLastModified ?? doc.lastModified,
    contentHash: newHash,
    failureCount: 0,
    lastError: null,
  }).where(eq(sourceDocuments.id, doc.id));

  if (unchanged) {
    return { sourceDocumentId, url: doc.url, outcome: "unchanged", detail: "content hash matched" };
  }

  // A brand-new source (no prior contentHash) isn't a "change" — there's
  // nothing to diff against yet. Only a real hash-to-hash mismatch counts.
  if (doc.contentHash === null) {
    return { sourceDocumentId, url: doc.url, outcome: "unchanged", detail: "first check — baseline hash recorded, nothing to compare yet" };
  }

  if (!doc.providerId) {
    return { sourceDocumentId, url: doc.url, outcome: "skipped_no_provider_for_change_event", detail: "content changed but this source has no providerId — change_events requires one" };
  }

  await db.insert(changeEvents).values({
    providerId: doc.providerId,
    kind: "documentation_changed",
    field: "content_hash",
    previousValue: doc.contentHash,
    currentValue: newHash,
    summary: `${doc.title || doc.url} changed since it was last checked — re-verify before trusting any fact sourced from it.`,
    detectedAt: now,
    sourceDocumentId: doc.id,
    confidence: "0.85",
    reviewStatus: "pending",
    affects: { sourceUrl: doc.url },
  });

  return { sourceDocumentId, url: doc.url, outcome: "changed", detail: "content hash changed — change_event created, pending review" };
}

export interface CheckDueSourcesSummary {
  checked: number;
  unchanged: number;
  changed: number;
  failed: number;
  skipped: number;
  results: SourceCheckResult[];
}

/** Every source due for a check (nextCheckAt unset — never checked — or past due), bounded concurrency so this never fans out into an unbounded burst against real providers' domains. */
export async function checkDueSources(options: { limit?: number; concurrency?: number; now?: Date } = {}): Promise<CheckDueSourcesSummary> {
  const now = options.now ?? new Date();
  const concurrency = options.concurrency ?? 4;
  const db = await getDb();

  const due = await db
    .select({ id: sourceDocuments.id })
    .from(sourceDocuments)
    .where(and(eq(sourceDocuments.enabled, true), or(isNull(sourceDocuments.nextCheckAt), lte(sourceDocuments.nextCheckAt, now))))
    .limit(options.limit ?? 100);

  const results: SourceCheckResult[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < due.length) {
      const row = due[cursor++]!;
      results.push(await checkSource(row.id, now));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, due.length) }, worker));

  return {
    checked: results.length,
    unchanged: results.filter((r) => r.outcome === "unchanged").length,
    changed: results.filter((r) => r.outcome === "changed").length,
    failed: results.filter((r) => r.outcome === "failed").length,
    skipped: results.filter((r) => r.outcome === "skipped_no_provider_for_change_event").length,
    results,
  };
}
