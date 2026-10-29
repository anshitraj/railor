/**
 * Browser-side call to /api/search. The endpoint answers with a result on success, but rate limits (429), a
 * rejected origin (403) or a server error (5xx) answer with something else. Callers get a message to show,
 * never a half-shaped object to crash on.
 */
export type SearchCall<T> = { ok: true; data: T } | { ok: false; message: string; timedOut?: boolean };

/**
 * `signal` lets the caller give up on a search that is not answering: that is reported as `timedOut`, with a
 * message to show, instead of leaving the caller waiting for good.
 */
export async function postSearch<T extends { interpretation?: unknown }>(body: unknown, options: { signal?: AbortSignal } = {}): Promise<SearchCall<T>> {
  try {
    const response = await fetch("/api/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: options.signal });
    if (response.status === 429) return { ok: false, message: "You're searching a little fast. Try again in a minute." };
    const json = (await response.json().catch(() => null)) as T | null;
    if (!response.ok || !json || typeof json !== "object" || !json.interpretation) return { ok: false, message: "Search is unavailable right now. Please try again." };
    return { ok: true, data: json };
  } catch {
    if (options.signal?.aborted) return { ok: false, timedOut: true, message: "Checking is taking longer than usual. Try again in a moment." };
    return { ok: false, message: "Couldn't reach Railor. Check your connection and try again." };
  }
}
