/**
 * Phase F: real conformance checks — safe, non-money observations of whether
 * Railor's integration with a provider actually works, replacing what used
 * to be a one-off script (378 real `conformance_runs` rows already on the
 * real database, last run 2026-08-28, prove the intended behavior — this
 * file is that behavior made a permanent, re-runnable, committed module,
 * with the stale "V1" wording those old rows carry corrected).
 *
 * Section 22 of the product directive, applied honestly given what Railor
 * can actually reach right now:
 *   - docs_parity / status_endpoint: a real, robots.txt-respecting GET
 *     against the provider's own docsUrl/statusPageUrl. pass (2xx) / fail
 *     (reachable but errored) / access_required (robots.txt disallows it) /
 *     not_tested (no URL on record at all — never guessed).
 *   - authentication: only ever real. If some organization has a live
 *     provider_connections row for this provider, its adapter's own
 *     testConnection() is called for real (never fabricated) — the check
 *     answers "does Railor's integration correctly authenticate against
 *     this provider's real API," which is true or false independent of
 *     which org's real credentials proved it, so no org identity is stored
 *     or exposed. Otherwise: access_required.
 *   - every other kind (quote_api, quote_schema, idempotency,
 *     beneficiary_validation, asset_network_availability, response_schema,
 *     sandbox_reachable, webhook_*): these need a live connected account to
 *     test safely without moving money — access_required until one exists.
 *     "Do not initiate financial transactions merely for a health test."
 */
import { and, eq } from "drizzle-orm";
import { conformanceRuns, conformanceTests, getDb, providers } from "@railor/database";
import { getAdapter } from "./adapters.js";

type ConformanceStatus = "pass" | "fail" | "warning" | "not_tested" | "access_required";

/** Looks up real, decrypted credentials for any organization that has connected this provider. Injected because credential decryption owns its key in apps/web, not @railor/core — omitting it leaves every authentication-kind check honestly access_required. */
export type ConformanceCredentialLookup = (providerId: string, providerSlug: string) => Promise<Record<string, string> | null>;

export interface RunConformanceChecksOptions {
  limit?: number;
  concurrency?: number;
  getConnectionCredentials?: ConformanceCredentialLookup;
}

export interface RunConformanceChecksSummary {
  checked: number;
  byStatus: Record<ConformanceStatus, number>;
}

interface CheckOutcome {
  status: ConformanceStatus;
  detail: string;
  latencyMs?: number;
}

/** A body is never read — only status and headers are needed, and a provider's docs/status page can be large. */
async function probeUrl(url: string): Promise<CheckOutcome> {
  const allowed = await robotsAllow(url);
  if (!allowed) return { status: "access_required", detail: "robots.txt disallows fetching this source" };

  const started = Date.now();
  try {
    const response = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(15_000) });
    const latencyMs = Date.now() - started;
    const body = await response.text();
    if (!response.ok) return { status: "fail", detail: `HTTP ${response.status}`, latencyMs };
    return { status: "pass", detail: `HTTP ${response.status}, ${body.length} bytes`, latencyMs };
  } catch (error) {
    return { status: "fail", detail: error instanceof Error ? error.message : String(error), latencyMs: Date.now() - started };
  }
}

/** Simplified but real robots.txt check: disallowed only when a User-agent: * block blanket-disallows the whole site or this exact path. Never fetched again per-check — one lookup per probe, since a missing/unreachable robots.txt means "no restriction stated," not "assume blocked." */
async function robotsAllow(targetUrl: string): Promise<boolean> {
  let origin: string;
  try {
    origin = new URL(targetUrl).origin;
  } catch {
    return true;
  }
  try {
    const response = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return true;
    const body = await response.text();
    const targetPath = new URL(targetUrl).pathname;

    let inWildcardBlock = false;
    for (const rawLine of body.split("\n")) {
      const line = rawLine.split("#")[0]!.trim();
      if (!line) continue;
      const [rawKey, ...rest] = line.split(":");
      const key = rawKey!.trim().toLowerCase();
      const value = rest.join(":").trim();
      if (key === "user-agent") {
        inWildcardBlock = value === "*";
        continue;
      }
      if (!inWildcardBlock || key !== "disallow" || !value) continue;
      if (value === "/" || targetPath.startsWith(value)) return false;
    }
    return true;
  } catch {
    return true;
  }
}

export async function runConformanceChecks(options: RunConformanceChecksOptions = {}): Promise<RunConformanceChecksSummary> {
  const db = await getDb();
  const tests = await db
    .select({
      id: conformanceTests.id,
      kind: conformanceTests.kind,
      providerId: conformanceTests.providerId,
      providerSlug: providers.slug,
      docsUrl: providers.docsUrl,
      statusPageUrl: providers.statusPageUrl,
    })
    .from(conformanceTests)
    .innerJoin(providers, eq(conformanceTests.providerId, providers.id))
    // Demo providers are fabricated (fake docs URLs, fake companies) — never
    // spend a real network call or a real conformance_runs row on one. Same
    // class of bug Phase A fixed for search; caught here by an actual run
    // hitting demo.railor.dev's fake docs URLs before this filter existed.
    .where(and(eq(conformanceTests.enabled, true), eq(providers.isDemo, false)))
    .limit(options.limit ?? 500);

  type Test = (typeof tests)[number];

  async function checkOne(test: Test): Promise<CheckOutcome> {
    try {
      if (test.kind === "docs_parity") {
        return test.docsUrl ? await probeUrl(test.docsUrl) : { status: "not_tested", detail: "no docs_url on record" };
      }
      if (test.kind === "status_endpoint") {
        return test.statusPageUrl ? await probeUrl(test.statusPageUrl) : { status: "not_tested", detail: "no status_page_url on record" };
      }
      if (test.kind === "authentication") {
        const credentials = await options.getConnectionCredentials?.(test.providerId, test.providerSlug);
        if (!credentials) {
          return { status: "access_required", detail: "no connected provider_connections account on file to authenticate with yet" };
        }
        const adapter = getAdapter(test.providerSlug);
        if (!adapter) return { status: "access_required", detail: "no adapter registered for this provider" };
        const result = await adapter.testConnection(credentials);
        return { status: result.ok ? "pass" : "fail", detail: result.detail };
      }
      return { status: "access_required", detail: "needs a live connected provider account to test safely without moving money — none on file yet" };
    } catch (error) {
      // One misbehaving adapter or credential lookup must never abort every
      // other provider's check in this batch — see checkSource in
      // source-monitor.ts for the same "never throws" contract.
      return { status: "fail", detail: error instanceof Error ? error.message : String(error) };
    }
  }

  const byStatus: Record<ConformanceStatus, number> = { pass: 0, fail: 0, warning: 0, not_tested: 0, access_required: 0 };

  // Bounded concurrency: most rows resolve instantly (access_required, no
  // network call), but docs_parity/status_endpoint make real outbound HTTP
  // calls with their own timeouts — running hundreds of tests one at a time
  // would make a single slow real endpoint stall the whole batch.
  const concurrency = options.concurrency ?? 6;
  let cursor = 0;
  async function worker() {
    while (cursor < tests.length) {
      const test = tests[cursor++]!;
      const outcome = await checkOne(test);
      await db.insert(conformanceRuns).values({
        testId: test.id,
        status: outcome.status,
        detail: outcome.detail,
        latencyMs: outcome.latencyMs,
      });
      byStatus[outcome.status]++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tests.length) }, worker));

  return { checked: tests.length, byStatus };
}
