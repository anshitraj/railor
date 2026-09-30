import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Outbound-request guards shared by every place Railor fetches a URL it did
 * not hard-code (customer webhook endpoints, provider logos). A hostname is
 * checked literally and after DNS resolution, redirects are followed only
 * hop by hop through the same check, and responses are size-capped.
 */

export function isPrivateAddress(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  const version = isIP(h);
  if (version === 4) {
    const [a, b] = h.split(".").map(Number) as [number, number];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (version === 6) {
    // IPv4-mapped (::ffff:10.0.0.1; URL parsing rewrites it as ::ffff:a00:1).
    const dotted = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return isPrivateAddress(dotted[1]!);
    const hex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const hi = parseInt(hex[1]!, 16);
      const lo = parseInt(hex[2]!, 16);
      return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || h === "::";
  }
  return false;
}

/** True when the URL's host is, or resolves to, a private/loopback address. Unresolvable hosts are left to fail on fetch. */
export async function resolvesPrivately(url: string): Promise<boolean> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return isPrivateAddress(host);
  if (isPrivateAddress(host)) return true;
  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    return addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

export class GuardedFetchError extends Error {}

/**
 * GET a public HTTPS URL: every hop (redirects included, at most `maxRedirects`)
 * must be HTTPS and publicly routed, the body is read up to `maxBytes`, and
 * the whole exchange is bounded by `timeoutMs`.
 */
export async function guardedGet(
  rawUrl: string,
  options: { maxBytes: number; timeoutMs?: number; maxRedirects?: number; accept?: string } ,
): Promise<{ url: string; contentType: string; body: Buffer }> {
  let url = rawUrl;
  const deadline = AbortSignal.timeout(options.timeoutMs ?? 6_000);
  for (let hop = 0; hop <= (options.maxRedirects ?? 3); hop++) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new GuardedFetchError("Only public HTTPS URLs are fetched.");
    if (await resolvesPrivately(url)) throw new GuardedFetchError("Refusing to fetch a private network address.");
    const response = await fetch(url, {
      redirect: "manual",
      signal: deadline,
      headers: { "User-Agent": "RailorBot/1.0 (+https://railor.dev)", Accept: options.accept ?? "*/*" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new GuardedFetchError(`Redirect without a location (HTTP ${response.status}).`);
      url = new URL(location, url).toString();
      continue;
    }
    if (!response.ok) throw new GuardedFetchError(`HTTP ${response.status}`);
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > options.maxBytes) throw new GuardedFetchError("Response too large.");
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > options.maxBytes) {
          await reader.cancel();
          throw new GuardedFetchError("Response too large.");
        }
        chunks.push(value);
      }
    }
    return { url, contentType: (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase(), body: Buffer.concat(chunks) };
  }
  throw new GuardedFetchError("Too many redirects.");
}
