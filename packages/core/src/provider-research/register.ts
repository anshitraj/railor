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
  // "zerohash" (no hyphen) was a dead duplicate entry that pre-dated this
  // file's actual use and had never been run. The real row is "zero-hash"
  // (packages/database/src/seed/zerohash-cpn-ae-route.ts), which already
  // carries real routes/evidence — do not re-add "zerohash" here.
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

  // Provider-universe expansion batch: discovered via the Fireblocks Network
  // for Payments directory (fireblocks.com/platforms/fireblocks-network/directory),
  // the Stellar Anchor Directory (anchors.stellar.org), and the explicit
  // named-infrastructure list from the expansion brief. Every domain below
  // was verified by search before being added here, not guessed — several of
  // these names collide with unrelated companies (a news blog at
  // thecowriereport.com is not the Cowrie anchor; the real one is Cowrie
  // Integrated Systems at cowriesys.com, confirmed via Circle's own alliance
  // directory at partners.circle.com/partner/cowrie-integrated-systems).
  { slug: "openpayd", name: "OpenPayd", category: "Banking infrastructure", websiteUrl: "https://www.openpayd.com", docsUrl: "https://apidocs.openpayd.com/" },
  { slug: "banking-circle", name: "Banking Circle", category: "Banking infrastructure", websiteUrl: "https://www.bankingcircle.com" },
  { slug: "currencycloud", name: "Currencycloud", category: "FX / liquidity infrastructure", websiteUrl: "https://www.currencycloud.com" },
  { slug: "visa-direct", name: "Visa Direct", category: "Payment network", websiteUrl: "https://www.visa.com/en-us/products/visa-direct", docsUrl: "https://developer.visa.com/capabilities/visa_direct" },
  { slug: "mastercard-move", name: "Mastercard Move", category: "Payment network", websiteUrl: "https://www.mastercard.com/us/en/business/payments/mastercard-move.html", docsUrl: "https://developer.mastercard.com/product/move/" },
  { slug: "moneygram", name: "MoneyGram", category: "Cross-border payments", websiteUrl: "https://www.moneygram.com", docsUrl: "https://developer.moneygram.com" },
  // Alfred is ambiguous by name alone; the Fireblocks Network directory tile
  // links to alfredpay.io, "Stablecoin Payment Infrastructure for Latin America".
  { slug: "alfred", name: "Alfred", category: "Stablecoin infrastructure", websiteUrl: "https://alfredpay.io" },
  { slug: "b2c2", name: "B2C2", category: "FX / liquidity infrastructure", websiteUrl: "https://www.b2c2.com" },
  { slug: "mobee", name: "Mobee", category: "On/off-ramp", websiteUrl: "https://mobee.com/en" },
  { slug: "n-exchange", name: "n.exchange", category: "On/off-ramp", websiteUrl: "https://n.exchange" },
  { slug: "scrypt", name: "SCRYPT", category: "Custody", websiteUrl: "https://scrypt.swiss" },
  { slug: "cowrie", name: "Cowrie Integrated Systems", category: "Cross-border payments", websiteUrl: "https://www.cowriesys.com" },
  { slug: "clickpesa", name: "ClickPesa", category: "Mobile money", websiteUrl: "https://clickpesa.com" },
  { slug: "anclap", name: "Anclap", category: "On/off-ramp", websiteUrl: "https://www.anclap.com" },
  { slug: "vibrant", name: "Vibrant", category: "Stablecoin infrastructure", websiteUrl: "https://vibrantapp.com" },

  // Global provider & competitor intelligence expansion batch: discovered via
  // Mastercard's Crypto Partner Program partner list (100+ names, filtered
  // down to entities that actually move money — blockchains, pure custody/
  // signing infra, and pure compliance tooling from that list are excluded
  // per the brief's own classification rule) and Meld's network-integrations
  // page. Every domain verified by search before being added, same
  // discipline as the earlier "zerohash"/beam/agora lessons - "Fuze" in
  // particular collides with an unrelated telecom of the same name; the real
  // one is the MENA stablecoin-infra company at fuze.finance.
  { slug: "dtcpay", name: "dtcpay", category: "Stablecoin payments", websiteUrl: "https://www.dtcpay.com" },
  { slug: "lirium", name: "Lirium", category: "Stablecoin infrastructure", websiteUrl: "https://www.lirium.com" },
  { slug: "parfin", name: "Parfin", category: "Institutional crypto infrastructure", websiteUrl: "https://parfin.io" },
  { slug: "fuze", name: "Fuze", category: "Stablecoin infrastructure", websiteUrl: "https://fuze.finance" },
  { slug: "stablecore", name: "Stablecore", category: "Stablecoin infrastructure", websiteUrl: "https://stablecore.com" },
  { slug: "1money", name: "1Money", category: "Stablecoin payment network", websiteUrl: "https://www.1money.com" },
  { slug: "thredd", name: "Thredd", category: "Card issuing / processing", websiteUrl: "https://www.thredd.ai" },
  { slug: "pomelo-la", name: "Pomelo", category: "Card issuing / processing", websiteUrl: "https://www.pomelo.la/en" },
  { slug: "kulipa", name: "Kulipa", category: "Card issuing / processing", websiteUrl: "https://kulipa.xyz" },
  { slug: "episode-six", name: "Episode Six", category: "Card issuing / processing", websiteUrl: "https://episodesix.com" },
  { slug: "moorwand", name: "Moorwand", category: "Card issuing / processing", websiteUrl: "https://moorwand.com" },
  { slug: "highnote", name: "Highnote", category: "Card issuing / processing", websiteUrl: "https://highnote.com" },
  { slug: "monavate", name: "Monavate", category: "Banking infrastructure", websiteUrl: "https://www.monavate.com" },
  { slug: "paycaddy", name: "PayCaddy", category: "Card issuing / processing", websiteUrl: "https://paycaddy.com" },
  { slug: "baanx", name: "Baanx", category: "Card issuing / processing", websiteUrl: "https://www.baanx.com" },
  { slug: "immersve", name: "Immersve", category: "Card issuing / processing", websiteUrl: "https://immersve.com" },
  { slug: "unlimit", name: "Unlimit", category: "Cross-border payments", websiteUrl: "https://www.unlimit.com" },
  { slug: "cross-river", name: "Cross River Bank", category: "Banking infrastructure", websiteUrl: "https://www.crossriver.com" },
  { slug: "cbw-bank", name: "CBW Bank", category: "Banking infrastructure", websiteUrl: "https://www.cbw.bank" },
  { slug: "webbank", name: "WebBank", category: "Banking infrastructure", websiteUrl: "https://webbank.com" },
  { slug: "peoples-group", name: "Peoples Group", category: "Banking infrastructure", websiteUrl: "https://peoplesgroup.com" },
  { slug: "koywe", name: "Koywe", category: "Stablecoin infrastructure", websiteUrl: "https://www.koywe.com" },
  { slug: "opendue", name: "Due", category: "Cross-border payments", websiteUrl: "https://www.opendue.com" },
  { slug: "fonbnk", name: "Fonbnk", category: "Stablecoin infrastructure", websiteUrl: "https://fonbnk.com" },
  { slug: "guardarian", name: "Guardarian", category: "On/off-ramp", websiteUrl: "https://guardarian.com" },
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
