import { eq } from "drizzle-orm";
import { KNOWN_PROVIDER_SITES, resolveProviderLogo, resolveRemoteLogo, type ResolvedLogo } from "@railor/core";
import { getDb, providers } from "@railor/database";

export const runtime = "nodejs";

/**
 * GET /api/logos/{slug}[?src=<allowlisted logo URL>] — a provider's own logo,
 * fetched from its website once and cached. Served from Railor's origin so a
 * page never hotlinks third-party hosts; `src` is only honoured for the
 * market-feed logo CDN (REMOTE_LOGO_HOSTS), everything else resolves by slug.
 */
interface Entry {
  logo: ResolvedLogo | null;
  at: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __railorLogoCache: Map<string, Entry> | undefined;
  // eslint-disable-next-line no-var
  var __railorLogoInflight: Map<string, Promise<ResolvedLogo | null>> | undefined;
}

const cache = (globalThis.__railorLogoCache ??= new Map());
const inflight = (globalThis.__railorLogoInflight ??= new Map());
const FOUND_TTL = 24 * 3_600_000;
const NO_LOGO = Uint8Array.from(Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"));
const MISSING_TTL = 3_600_000;

async function siteFor(slug: string): Promise<string | null> {
  if (KNOWN_PROVIDER_SITES[slug]) return KNOWN_PROVIDER_SITES[slug]!;
  const db = await getDb();
  const [row] = await db.select({ websiteUrl: providers.websiteUrl, isDemo: providers.isDemo }).from(providers).where(eq(providers.slug, slug)).limit(1);
  // Demo providers are fictional; their "websites" are not real brands.
  return row && !row.isDemo && row.websiteUrl ? row.websiteUrl : null;
}

async function resolve(slug: string, src: string | null): Promise<ResolvedLogo | null> {
  // Offline/test environments: never reach out to provider websites.
  if (process.env.RAILOR_REMOTE_LOGOS === "off") return null;
  if (src) return resolveRemoteLogo(src);
  return resolveProviderLogo(slug, await siteFor(slug));
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const src = new URL(request.url).searchParams.get("src");
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug) || (src && src.length > 300)) return new Response(null, { status: 400 });
  const key = src ? `src:${src}` : `slug:${slug}`;

  let entry = cache.get(key);
  if (!entry || Date.now() - entry.at > (entry.logo ? FOUND_TTL : MISSING_TTL)) {
    let pending = inflight.get(key);
    if (!pending) {
      pending = resolve(slug, src).catch(() => null).finally(() => inflight.delete(key));
      inflight.set(key, pending);
    }
    entry = { logo: await pending, at: Date.now() };
    if (cache.size > 800) cache.delete(cache.keys().next().value!);
    cache.set(key, entry);
  }

  const common = { "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" };
  // No logo: a transparent pixel (not a 404) so pages don't log errors; ProviderLogo shows its monogram.
  if (!entry.logo) return new Response(NO_LOGO, { headers: { ...common, "Content-Type": "image/gif", "X-Railor-Logo": "none", "Cache-Control": "public, max-age=3600" } });
  return new Response(new Uint8Array(entry.logo.body), {
    headers: {
      ...common,
      "Content-Type": entry.logo.contentType,
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
    },
  });
}
