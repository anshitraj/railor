/**
 * URL dedup — pulled out as its own pure, testable unit rather than left
 * inline in ingest.ts. Normalizes away the trailing-slash / http-vs-https
 * variance that would otherwise let the same page count as two sources.
 */

/** Strips the fragment and a trailing slash, lowercases the host — not a full canonicalizer, just enough to catch the common duplicate shapes. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.protocol}//${u.hostname.toLowerCase()}${path}${u.search}`;
  } catch {
    return url.trim();
  }
}

/** Keeps the first occurrence of each normalized URL. */
export function dedupeByUrl<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = normalizeUrl(item.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
