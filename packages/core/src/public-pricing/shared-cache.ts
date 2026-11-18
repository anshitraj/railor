// Public quotes are the same for everyone for a few seconds: share them, so a
// page polling every 20s (or many viewers of the same pair) costs the source one call.
const publicCache = new Map<string, { at: number; ttl: number; value: Promise<unknown> }>();

/**
 * One load per key per TTL, shared by every caller, including callers that
 * arrive while it is still in flight. `ttlMs` may be a function of the loaded
 * value, counted from when it arrived, so a failure can be remembered for a
 * different time than a good reading. A load that rejects is forgotten at once.
 */
export function shared<T>(key: string, ttlMs: number | ((value: T) => number), load: () => Promise<T>): Promise<T> {
  const hit = publicCache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as Promise<T>;
  const value = load();
  const entry = { at: Date.now(), ttl: typeof ttlMs === "number" ? ttlMs : Number.POSITIVE_INFINITY, value };
  publicCache.set(key, entry);
  if (typeof ttlMs === "function") {
    value.then((loaded) => {
      entry.at = Date.now();
      entry.ttl = ttlMs(loaded);
    }, () => undefined);
  }
  value.catch(() => {
    if (publicCache.get(key) === entry) publicCache.delete(key);
  });
  if (publicCache.size > 500) publicCache.delete(publicCache.keys().next().value!);
  return value;
}

/** For tests: forget every shared public value. */
export function clearSharedCache() {
  publicCache.clear();
}
