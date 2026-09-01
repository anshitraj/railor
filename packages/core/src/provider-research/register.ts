/**
 * Registering a provider Railor has never heard of.
 *
 * The hard rule from RAILOR_BUILD_PROMPT §30 — "never invent claims about
 * real financial companies" — applies to the provider row itself, not just to
 * its capabilities. So a new provider's description is not written from
 * memory: its homepage is scraped and a one-sentence description is extracted
 * from that text, the same way every capability fact is. The only things
 * asserted without a scrape are the slug, the display name and the domain,
 * which are identity, not claims.
 *
 * Category is assigned from Railor's own taxonomy rather than extracted —
 * that's Railor classifying its dataset, not a statement about the company.
 */
import { GoogleGenAI } from "@google/genai";
import { eq } from "drizzle-orm";
import { getDb, providers } from "@railor/database";
import { COUNTRY_RESEARCH_CONFIG } from "../country-research/config.js";
import { firecrawlExtract } from "../country-research/firecrawl.js";

export interface NewProviderSpec {
  slug: string;
  name: string;
  /** Railor taxonomy label, not a claim about the company. */
  category: string;
  websiteUrl: string;
  docsUrl?: string;
}

/**
 * Real companies in the stablecoin / cross-border payments space that Railor
 * had no row for. Every entry here is identity only — name and domain. What
 * each one actually *does* comes from scraping, never from this file.
 */
export const NEW_PROVIDERS: NewProviderSpec[] = [
  { slug: "stripe", name: "Stripe", category: "Payments infrastructure", websiteUrl: "https://stripe.com", docsUrl: "https://docs.stripe.com/crypto" },
  { slug: "thunes", name: "Thunes", category: "Cross-border payments", websiteUrl: "https://www.thunes.com", docsUrl: "https://docs.thunes.com" },
  { slug: "nium", name: "Nium", category: "Cross-border payments", websiteUrl: "https://www.nium.com", docsUrl: "https://docs.nium.com" },
  { slug: "rapyd", name: "Rapyd", category: "Cross-border payments", websiteUrl: "https://www.rapyd.net", docsUrl: "https://docs.rapyd.net" },
  { slug: "dlocal", name: "dLocal", category: "Cross-border payments", websiteUrl: "https://dlocal.com", docsUrl: "https://docs.dlocal.com" },
  { slug: "zerohash", name: "Zero Hash", category: "Stablecoin infrastructure", websiteUrl: "https://zerohash.com", docsUrl: "https://docs.zerohash.com" },
  { slug: "fireblocks", name: "Fireblocks", category: "Custody", websiteUrl: "https://www.fireblocks.com", docsUrl: "https://developers.fireblocks.com" },
  { slug: "bitgo", name: "BitGo", category: "Custody", websiteUrl: "https://www.bitgo.com", docsUrl: "https://developers.bitgo.com" },
  { slug: "ramp-network", name: "Ramp Network", category: "On/off-ramp", websiteUrl: "https://ramp.network", docsUrl: "https://docs.ramp.network" },
  { slug: "banxa", name: "Banxa", category: "On/off-ramp", websiteUrl: "https://banxa.com", docsUrl: "https://docs.banxa.com" },
  { slug: "mercuryo", name: "Mercuryo", category: "On/off-ramp", websiteUrl: "https://mercuryo.io", docsUrl: "https://docs.mercuryo.io" },
  { slug: "flutterwave", name: "Flutterwave", category: "Cross-border payments", websiteUrl: "https://flutterwave.com", docsUrl: "https://developer.flutterwave.com" },
  { slug: "onafriq", name: "Onafriq", category: "Cross-border payments", websiteUrl: "https://onafriq.com" },
  { slug: "bitso", name: "Bitso", category: "On/off-ramp", websiteUrl: "https://bitso.com", docsUrl: "https://docs.bitso.com" },
  { slug: "tazapay", name: "Tazapay", category: "Cross-border payments", websiteUrl: "https://tazapay.com", docsUrl: "https://docs.tazapay.com" },
  { slug: "coins-ph", name: "Coins.ph", category: "On/off-ramp", websiteUrl: "https://coins.ph" },
  { slug: "sphere", name: "Sphere", category: "Stablecoin infrastructure", websiteUrl: "https://www.spherepay.co", docsUrl: "https://docs.spherepay.co" },
  { slug: "alchemy-pay", name: "Alchemy Pay", category: "On/off-ramp", websiteUrl: "https://alchemypay.org" },
  // Domains resolved by Tavily search, not guessed: "Mesh" is ambiguous
  // between a corporate-spend company and this crypto payments network, and
  // the wrong one would have been another beam/agora-style mis-registration.
  { slug: "eco", name: "Eco", category: "Stablecoin infrastructure", websiteUrl: "https://eco.com", docsUrl: "https://docs.eco.com" },
  { slug: "mesh", name: "Mesh", category: "Stablecoin infrastructure", websiteUrl: "https://www.meshconnect.com", docsUrl: "https://docs.meshconnect.com" },
  { slug: "anchorage", name: "Anchorage Digital", category: "Custody", websiteUrl: "https://www.anchorage.com" },
  // Removed after registration: "beam" (trybeam.com) and "agora" (agora.xyz)
  // are a construction-software company and a DAO-governance platform
  // respectively, not the stablecoin firms of the same names. Both were
  // caught by their own scraped descriptions and deleted. They stay out until
  // someone supplies a domain verified to be the right company — guessing a
  // second domain is what produced the wrong rows in the first place.
];

const DESCRIPTION_PROMPT = `You are writing ONE factual sentence describing what a payments company does, using ONLY the supplied text from its own homepage.

Rules:
- Use only what the supplied text says. Never use your own knowledge of this company.
- One sentence, at most 220 characters, plain declarative English.
- Describe what the company offers. Do not use marketing superlatives ("leading", "best-in-class", "revolutionary") even if the source does.
- If the supplied text does not make clear what the company does, reply with exactly: UNKNOWN`;

async function describeFromHomepage(name: string, content: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: COUNTRY_RESEARCH_CONFIG.extractionTimeoutMs } });

  const response = await ai.models.generateContent({
    model: process.env.COUNTRY_RESEARCH_LLM_MODEL?.trim() || "gemini-3.1-pro-preview",
    contents: [{ role: "user", parts: [{ text: `Company: ${name}\n\nHomepage text:\n${content.slice(0, 12_000)}` }] }],
    config: { systemInstruction: DESCRIPTION_PROMPT, temperature: 0 },
  });

  const text = response.text?.trim();
  if (!text || text === "UNKNOWN") return null;
  return text.slice(0, 400);
}

export interface RegisterResult {
  slug: string;
  status: "created" | "already_exists" | "skipped_no_content" | "skipped_no_description";
  description?: string;
}

/**
 * Creates the provider row, with a description derived from its live homepage.
 * A provider whose homepage can't be scraped, or whose text doesn't say what
 * it does, is skipped rather than registered on a guessed description.
 */
export async function registerProvider(spec: NewProviderSpec): Promise<RegisterResult> {
  const db = await getDb();
  const [existing] = await db.select().from(providers).where(eq(providers.slug, spec.slug)).limit(1);
  if (existing) return { slug: spec.slug, status: "already_exists" };

  const scraped = await firecrawlExtract([spec.websiteUrl]);
  const page = scraped.results[0];
  if (!page) return { slug: spec.slug, status: "skipped_no_content" };

  const description = await describeFromHomepage(spec.name, page.rawContent);
  if (!description) return { slug: spec.slug, status: "skipped_no_description" };

  await db.insert(providers).values({
    slug: spec.slug,
    name: spec.name,
    isDemo: false,
    category: spec.category,
    description,
    websiteUrl: spec.websiteUrl,
    docsUrl: spec.docsUrl ?? null,
    // Everything below stays at its honest default until research establishes it.
    apiAccess: "unknown",
    hasApi: false,
    hasSandbox: false,
  });

  return { slug: spec.slug, status: "created", description };
}
