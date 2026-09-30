import { GuardedFetchError, guardedGet } from "./net-guard.js";

/**
 * Provider logos, taken from each provider's own website (its declared icons:
 * SVG icon, apple-touch-icon, then favicon) rather than a third-party logo
 * service — so a logo is always the brand's own published mark, and viewing
 * a provider page never leaks to an outside logo host.
 */

export interface ResolvedLogo {
  contentType: string;
  body: Buffer;
  sourceUrl: string;
}

const IMAGE_TYPES = new Set(["image/svg+xml", "image/png", "image/jpeg", "image/webp", "image/gif", "image/x-icon", "image/vnd.microsoft.icon"]);

/** Providers Railor prices or connects that may not have a registry row yet. */
export const KNOWN_PROVIDER_SITES: Record<string, string> = {
  wise: "https://wise.com",
  airwallex: "https://www.airwallex.com",
  payzoll: "https://payzoll.finance",
  skydo: "https://www.skydo.com",
  circle: "https://www.circle.com",
  bridge: "https://www.bridge.xyz",
  nium: "https://www.nium.com",
  moonpay: "https://www.moonpay.com",
  coinbase: "https://www.coinbase.com",
  paxos: "https://paxos.com",
};

/**
 * Where a provider's declared icon is too small to render crisply, its own
 * higher-resolution mark — each one referenced from that provider's homepage.
 */
export const PROVIDER_LOGO_OVERRIDES: Record<string, string> = {
  // skydo.com declares a 32px favicon; its homepage uses this 234px mark.
  skydo: "https://skydo-public-documents.s3.ap-south-1.amazonaws.com/SkydoLogo/SkydoLogoShort.png",
};

/** Hosts whose logo URLs Railor will proxy as-is (the market comparison feed's own logo CDN). */
export const REMOTE_LOGO_HOSTS = new Set(["dq8dwmysp7hk1.cloudfront.net", "wise.com"]);

interface IconCandidate {
  href: string;
  score: number;
}

/** Ranks the icons a homepage declares: vector first, then the largest raster. */
export function iconCandidates(html: string, pageUrl: string): IconCandidate[] {
  const out: IconCandidate[] = [];
  const head = html.slice(0, 200_000);
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const attr = (name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(2).find((v) => v !== undefined);
    const rel = (attr("rel") ?? "").toLowerCase();
    const href = attr("href");
    if (!href || !/(^|\s)(icon|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/.test(rel) || rel.includes("mask-icon")) continue;
    let absolute: string;
    try {
      absolute = new URL(href.replace(/&amp;/g, "&"), pageUrl).toString();
    } catch {
      continue;
    }
    if (absolute.startsWith("data:")) continue;
    const type = (attr("type") ?? "").toLowerCase();
    const sizes = (attr("sizes") ?? "").toLowerCase();
    // Declared size, else one embedded in the file name (android_chrome_192x192.png).
    const size = Math.max(0, ...sizes.split(/\s+/).map((s) => Number(s.split("x")[0]) || 0)) || Number(absolute.match(/(\d{2,3})x/)?.[1] ?? 0);
    const isSvg = type.includes("svg") || /\.svg(\?|$)/i.test(absolute);
    // Sites mislabel PNGs as image/x-icon (wise.com does), so the extension wins.
    const isIco = /\.ico(\?|$)/i.test(absolute) || (type === "image/x-icon" && !/\.(png|svg)(\?|$)/i.test(absolute));
    const score = isSvg ? 1_000 : isIco ? 16 : rel.includes("apple-touch-icon") ? Math.max(size, 180) : size || 32;
    out.push({ href: absolute, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Pixel width of a PNG or the largest image in an ICO; null when the format doesn't say. */
export function rasterWidth(body: Buffer): number | null {
  if (body.length > 24 && body.readUInt32BE(0) === 0x89504e47) return body.readUInt32BE(16);
  if (body.length > 6 && body.readUInt16LE(0) === 0 && body.readUInt16LE(2) === 1) {
    const count = Math.min(body.readUInt16LE(4), 32);
    let max = 0;
    for (let i = 0; i < count && 6 + i * 16 < body.length; i++) max = Math.max(max, body[6 + i * 16]! || 256);
    return max;
  }
  return null;
}

async function fetchImage(url: string, timeoutMs = 6_000): Promise<ResolvedLogo | null> {
  try {
    const { contentType, body, url: finalUrl } = await guardedGet(url, { maxBytes: 400_000, accept: "image/*", timeoutMs });
    const type = contentType || (/\.ico(\?|$)/i.test(finalUrl) ? "image/x-icon" : "");
    const sniffedSvg = body.subarray(0, 512).toString("utf8").includes("<svg");
    const resolvedType = IMAGE_TYPES.has(type) ? type : sniffedSvg ? "image/svg+xml" : /\.ico(\?|$)/i.test(finalUrl) ? "image/x-icon" : "";
    if (!resolvedType || body.length < 64) return null;
    return { contentType: resolvedType, body, sourceUrl: finalUrl };
  } catch (error) {
    if (error instanceof GuardedFetchError) return null;
    return null;
  }
}

/**
 * The best icon a site declares for itself, or null: an SVG as soon as one is
 * found, otherwise the largest raster (stopping early at 96px+). Bounded to
 * ~10 seconds in total however slow the site is.
 */
export async function resolveSiteLogo(siteUrl: string): Promise<ResolvedLogo | null> {
  const deadline = Date.now() + 10_000;
  let origin: string;
  try {
    const parsed = new URL(siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`);
    parsed.protocol = "https:";
    origin = parsed.origin;
  } catch {
    return null;
  }
  const candidates: IconCandidate[] = [];
  try {
    const page = await guardedGet(`${origin}/`, { maxBytes: 2_000_000, accept: "text/html", timeoutMs: 5_000 });
    candidates.push(...iconCandidates(page.body.toString("utf8"), page.url));
  } catch {
    /* fall through to the conventional paths */
  }
  candidates.push({ href: `${origin}/apple-touch-icon.png`, score: 179 }, { href: `${origin}/favicon.svg`, score: 999 }, { href: `${origin}/favicon.ico`, score: 15 });
  const ordered = [...new Map(candidates.sort((a, b) => b.score - a.score).map((c) => [c.href, c])).values()].slice(0, 7);
  let fallback: { logo: ResolvedLogo; width: number } | null = null;
  for (const candidate of ordered) {
    const remaining = deadline - Date.now();
    if (remaining < 500) break;
    const logo = await fetchImage(candidate.href, Math.min(remaining, 5_000));
    if (!logo) continue;
    if (logo.contentType === "image/svg+xml") return logo;
    const width = rasterWidth(logo.body) ?? 64;
    if (width >= 96) return logo;
    if (!fallback || width > fallback.width) fallback = { logo, width };
  }
  return fallback?.logo ?? null;
}

/** A logo URL from an allowlisted feed host (see REMOTE_LOGO_HOSTS), fetched through the same guard. */
export async function resolveRemoteLogo(url: string): Promise<ResolvedLogo | null> {
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    host = parsed.hostname;
  } catch {
    return null;
  }
  if (!REMOTE_LOGO_HOSTS.has(host)) return null;
  return fetchImage(url);
}

/** A provider's logo: its first-party override when one exists, else the best icon its site declares. */
export async function resolveProviderLogo(slug: string, siteUrl: string | null): Promise<ResolvedLogo | null> {
  const override = PROVIDER_LOGO_OVERRIDES[slug];
  if (override) {
    const logo = await fetchImage(override);
    if (logo) return logo;
  }
  return siteUrl ? resolveSiteLogo(siteUrl) : null;
}
