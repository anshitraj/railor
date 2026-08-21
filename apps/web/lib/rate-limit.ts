import "server-only";

/**
 * In-process burst limiter for the /v1 API, keyed by API key id.
 *
 * This is a single-instance limiter: state lives in the Node process's
 * memory, so it resets on deploy and does not coordinate across multiple
 * server instances. That's a real limitation, not an oversight — a
 * distributed limiter needs a shared store (Redis, already provisioned in
 * docker-compose but not yet wired into the web app) and wiring that up is
 * out of scope here. The monthly quota check in analytics.ts is
 * database-backed and does not have this limitation.
 */
const WINDOW_MS = 10_000;
const MAX_REQUESTS_PER_WINDOW = 30;

const hits = new Map<string, number[]>();

export function checkBurstLimit(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length <= MAX_REQUESTS_PER_WINDOW;
}
