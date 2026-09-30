import "server-only";

/**
 * Per-instance stale-while-revalidate cache for shared, slow-to-compute and
 * rarely-changing reads (provider summaries, reference data, the change feed).
 * A fresh value is served from memory; a stale one is served immediately while
 * one background refresh runs; nothing blocks on the database twice. Values
 * keep their real types (Dates stay Dates) — unlike a serializing data cache.
 * Mutations that change the data call `invalidate(tag)`.
 */
interface Entry {
  value: unknown;
  at: number;
  ttl: number;
  tags: string[];
  refreshing?: Promise<unknown>;
}

declare global {
  // eslint-disable-next-line no-var
  var __railorCache: Map<string, Entry> | undefined;
  // eslint-disable-next-line no-var
  var __railorInflight: Map<string, Promise<unknown>> | undefined;
}

const store = (globalThis.__railorCache ??= new Map());
const inflight = (globalThis.__railorInflight ??= new Map());
const MAX_ENTRIES = 500;

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, tags: string[] = []): Promise<T> {
  const entry = store.get(key);
  const now = Date.now();
  if (entry && now - entry.at < entry.ttl) return entry.value as T;
  if (entry) {
    // Stale: answer now, refresh once in the background.
    if (!entry.refreshing) {
      entry.refreshing = load()
        .then((value) => store.set(key, { value, at: Date.now(), ttl: ttlMs, tags }))
        .catch(() => undefined)
        .finally(() => {
          const current = store.get(key);
          if (current) current.refreshing = undefined;
        });
    }
    return entry.value as T;
  }
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const promise = load()
    .then((value) => {
      if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value!);
      store.set(key, { value, at: Date.now(), ttl: ttlMs, tags });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

/** Drops every entry carrying `tag` on this instance (other instances age out by TTL). */
export function invalidate(tag: string) {
  for (const [key, entry] of store) if (entry.tags.includes(tag)) store.delete(key);
}
