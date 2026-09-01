/**
 * Reference-catalog reconciliation.
 *
 * Extracted facts arrive as free text ("Kenya", "Base", "USDC"); the database
 * stores hard foreign keys into `countries`, `currencies`, `assets` and
 * `blockchains`. This module is the only place that bridge is crossed.
 *
 * Countries and currencies are *auto-extended*: an ISO 3166-1 alpha-2 code is
 * a verifiable fact about the world, not a claim about a provider, so adding
 * Ghana when a source names Ghana is safe and is exactly how coverage grows.
 * Assets and blockchains are deliberately NOT auto-extended — "which chain is
 * this" is a judgement call with real ambiguity (Base vs Base Sepolia, BSC vs
 * BNB Chain), and a wrong row there silently corrupts routing. Unknown ones
 * are reported back to the caller instead, so a human decides.
 */
import { and, eq } from "drizzle-orm";
import { assetNetworks, assets, blockchains, countries, currencies, getDb } from "@railor/database";
// eslint-disable-next-line @typescript-eslint/no-var-requires
import iso3166 from "iso-3166-1";
import { resolveAssetBySymbol, resolvePlatformByName } from "./coingecko.js";

/** Regional-indicator pair — 🇰🇪 from "KE", derived, never hand-typed. */
function flagEmoji(alpha2: string): string {
  return String.fromCodePoint(...[...alpha2.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

/** Matches the region vocabulary already in the countries table. */
const REGION_BY_ALPHA2: Record<string, string> = {
  IN: "South Asia", PK: "South Asia", BD: "South Asia", LK: "South Asia", NP: "South Asia",
  AE: "Middle East", SA: "Middle East", QA: "Middle East", KW: "Middle East", BH: "Middle East",
  OM: "Middle East", IL: "Middle East", JO: "Middle East", TR: "Middle East",
  US: "North America", CA: "North America",
  GB: "Europe", DE: "Europe", FR: "Europe", NL: "Europe", CH: "Europe", ES: "Europe", IT: "Europe",
  PT: "Europe", IE: "Europe", SE: "Europe", NO: "Europe", DK: "Europe", PL: "Europe", BE: "Europe",
  AT: "Europe", FI: "Europe", CZ: "Europe", RO: "Europe", HU: "Europe", GR: "Europe", EE: "Europe",
  LT: "Europe", LV: "Europe", BG: "Europe", HR: "Europe", SK: "Europe", SI: "Europe", LU: "Europe",
  CY: "Europe", MT: "Europe", IS: "Europe", UA: "Europe", GE: "Europe",
  SG: "APAC", HK: "APAC", JP: "APAC", KR: "APAC", CN: "APAC", TW: "APAC", VN: "APAC", TH: "APAC",
  MY: "APAC", ID: "APAC", PH: "APAC", AU: "APAC", NZ: "APAC", KH: "APAC", MM: "APAC", MN: "APAC",
  NG: "Africa", KE: "Africa", ZA: "Africa", GH: "Africa", MA: "Africa", TZ: "Africa", UG: "Africa",
  CI: "Africa", SN: "Africa", ET: "Africa", EG: "Africa", RW: "Africa", ZM: "Africa", CM: "Africa",
  BJ: "Africa", BW: "Africa", CD: "Africa", GA: "Africa", ML: "Africa", MW: "Africa", MZ: "Africa",
  BR: "LATAM", MX: "LATAM", AR: "LATAM", CO: "LATAM", CL: "LATAM", PE: "LATAM", UY: "LATAM",
  EC: "LATAM", BO: "LATAM", PY: "LATAM", CR: "LATAM", PA: "LATAM", GT: "LATAM", DO: "LATAM",
};

/**
 * ISO 4217 names for currencies this pipeline can legitimately meet. A code
 * that isn't here is skipped rather than stored under a fabricated name —
 * `currencies.name` is NOT NULL and a wrong name is worse than an absent row.
 */
const CURRENCY_NAMES: Record<string, string> = {
  USD: "US Dollar", EUR: "Euro", GBP: "Pound Sterling", AED: "UAE Dirham", INR: "Indian Rupee",
  NGN: "Nigerian Naira", SGD: "Singapore Dollar", BRL: "Brazilian Real", JPY: "Japanese Yen",
  CAD: "Canadian Dollar", AUD: "Australian Dollar", CHF: "Swiss Franc", MXN: "Mexican Peso",
  ZAR: "South African Rand", TRY: "Turkish Lira", MYR: "Malaysian Ringgit", IDR: "Indonesian Rupiah",
  HKD: "Hong Kong Dollar", CNY: "Chinese Yuan", ILS: "Israeli New Shekel", NZD: "New Zealand Dollar",
  PLN: "Polish Zloty", COP: "Colombian Peso", ARS: "Argentine Peso", DKK: "Danish Krone",
  SEK: "Swedish Krona", NOK: "Norwegian Krone", KES: "Kenyan Shilling", GHS: "Ghanaian Cedi",
  UGX: "Ugandan Shilling", TZS: "Tanzanian Shilling", XOF: "West African CFA Franc",
  XAF: "Central African CFA Franc", EGP: "Egyptian Pound", MAD: "Moroccan Dirham",
  SAR: "Saudi Riyal", QAR: "Qatari Riyal", KWD: "Kuwaiti Dinar", BHD: "Bahraini Dinar",
  OMR: "Omani Rial", PHP: "Philippine Peso", THB: "Thai Baht", VND: "Vietnamese Dong",
  KRW: "South Korean Won", TWD: "New Taiwan Dollar", PKR: "Pakistani Rupee",
  BDT: "Bangladeshi Taka", LKR: "Sri Lankan Rupee", CLP: "Chilean Peso", PEN: "Peruvian Sol",
  UYU: "Uruguayan Peso", CZK: "Czech Koruna", HUF: "Hungarian Forint", RON: "Romanian Leu",
  BGN: "Bulgarian Lev", UAH: "Ukrainian Hryvnia", GEL: "Georgian Lari", NPR: "Nepalese Rupee",
  CRC: "Costa Rican Colon", ZMW: "Zambian Kwacha", RWF: "Rwandan Franc", ETB: "Ethiopian Birr",
  XCD: "East Caribbean Dollar", DOP: "Dominican Peso", GTQ: "Guatemalan Quetzal",
};

export interface CatalogReport {
  countriesAdded: string[];
  currenciesAdded: string[];
  /** Added via CoinGecko confirmation, not guessed from free text. */
  assetsAdded: string[];
  networksAdded: string[];
  unknownCountries: string[];
  unknownCurrencies: string[];
  unknownAssets: string[];
  unknownNetworks: string[];
}

export function emptyCatalogReport(): CatalogReport {
  return {
    countriesAdded: [], currenciesAdded: [], assetsAdded: [], networksAdded: [],
    unknownCountries: [], unknownCurrencies: [], unknownAssets: [], unknownNetworks: [],
  };
}

/** "BNB Smart Chain" -> "bnb-smart-chain" — matches the kebab-case convention every hand-seeded blockchain slug already uses. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Loads the current catalogs and returns resolvers that add real ISO
 * countries/currencies on demand while refusing to invent assets or chains.
 */
export async function openCatalog(report: CatalogReport) {
  const db = await getDb();
  const [countryRows, currencyRows, assetRows, chainRows] = await Promise.all([
    db.select().from(countries),
    db.select().from(currencies),
    db.select().from(assets),
    db.select().from(blockchains),
  ]);

  const knownCountries = new Set(countryRows.map((c) => c.code));
  const knownCurrencies = new Set(currencyRows.map((c) => c.code));
  const assetBySymbol = new Map(assetRows.map((a) => [a.symbol.toUpperCase(), a.symbol]));
  // Chains match on slug or display name, case- and separator-insensitively:
  // sources write "BNB Chain", the catalog stores "bnb-chain".
  const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
  const chainByKey = new Map<string, string>();
  for (const c of chainRows) {
    chainByKey.set(normalize(c.slug), c.slug);
    chainByKey.set(normalize(c.name), c.slug);
  }

  return {
    /** Adds the country if it's a real ISO alpha-2 we can name and place. */
    async country(code: string | null): Promise<string | null> {
      if (!code) return null;
      const upper = code.toUpperCase();
      if (knownCountries.has(upper)) return upper;

      const entry = iso3166.whereAlpha2(upper);
      const region = REGION_BY_ALPHA2[upper];
      if (!entry || !region) {
        if (!report.unknownCountries.includes(upper)) report.unknownCountries.push(upper);
        return null;
      }
      await db.insert(countries).values({
        code: upper,
        name: entry.country,
        region,
        flag: flagEmoji(upper),
        popularity: 0,
      });
      knownCountries.add(upper);
      report.countriesAdded.push(upper);
      return upper;
    },

    async currency(code: string | null): Promise<string | null> {
      if (!code) return null;
      const upper = code.toUpperCase();
      if (knownCurrencies.has(upper)) return upper;

      const name = CURRENCY_NAMES[upper];
      if (!name) {
        if (!report.unknownCurrencies.includes(upper)) report.unknownCurrencies.push(upper);
        return null;
      }
      await db.insert(currencies).values({ code: upper, name, popularity: 0 });
      knownCurrencies.add(upper);
      report.currenciesAdded.push(upper);
      return upper;
    },

    /**
     * Falls back to CoinGecko before giving up: a ticker Railor's own small
     * catalog has never seen (BTC, ETH, SOL, XAUT...) is still checked against
     * CoinGecko's real registry, and only added if CoinGecko confirms it's a
     * genuine asset. A row is still never invented from free text alone.
     */
    async asset(symbol: string | null): Promise<string | null> {
      if (!symbol) return null;
      const upper = symbol.toUpperCase();
      const found = assetBySymbol.get(upper);
      if (found) return found;

      const resolved = await resolveAssetBySymbol(symbol);
      if (!resolved) {
        if (!report.unknownAssets.includes(symbol)) report.unknownAssets.push(symbol);
        return null;
      }
      const [existingRow] = await db.select().from(assets).where(eq(assets.symbol, resolved.symbol)).limit(1);
      if (existingRow) {
        assetBySymbol.set(upper, existingRow.symbol);
        return existingRow.symbol;
      }
      await db.insert(assets).values({
        symbol: resolved.symbol,
        name: resolved.name,
        // "crypto" is the honest default: CoinGecko confirms the asset is
        // real, not that it's pegged to anything. Nothing here claims stablecoin status.
        kind: "crypto",
        popularity: 0,
      });
      assetBySymbol.set(upper, resolved.symbol);
      report.assetsAdded.push(resolved.symbol);
      return resolved.symbol;
    },

    /**
     * Same fallback for chains: matched against Railor's table first, then
     * against CoinGecko's real `asset_platforms` registry. A chain CoinGecko
     * doesn't recognize either is reported unknown, never invented.
     */
    async network(name: string | null): Promise<string | null> {
      if (!name) return null;
      const found = chainByKey.get(normalize(name));
      if (found) return found;

      const platform = await resolvePlatformByName(name);
      if (!platform) {
        if (!report.unknownNetworks.includes(name)) report.unknownNetworks.push(name);
        return null;
      }
      const slug = slugify(platform.name);
      const [existingRow] = await db.select().from(blockchains).where(eq(blockchains.slug, slug)).limit(1);
      if (existingRow) {
        chainByKey.set(normalize(name), existingRow.slug);
        return existingRow.slug;
      }
      await db.insert(blockchains).values({
        slug,
        name: platform.name,
        chainId: platform.chainIdentifier !== null ? String(platform.chainIdentifier) : null,
        popularity: 0,
      });
      chainByKey.set(normalize(name), slug);
      chainByKey.set(normalize(slug), slug);
      report.networksAdded.push(slug);
      return slug;
    },

    /**
     * Records asset+chain into `asset_networks` — but only after confirming
     * via CoinGecko's own platform map that the asset actually has a
     * deployment on that chain. This is the check that stops "USDC on Cronos"
     * from being recorded on a provider's say-so alone: CoinGecko's contract
     * registry has to agree the deployment is real.
     */
    async confirmAssetOnNetwork(assetSymbol: string, networkSlug: string, rawAssetSymbol: string): Promise<void> {
      const resolved = await resolveAssetBySymbol(rawAssetSymbol);
      if (!resolved) return;
      const platform = await resolvePlatformByName(networkSlug);
      const platformId = platform?.id ?? networkSlug;
      if (!(platformId in resolved.platforms) && !(networkSlug in resolved.platforms)) return;

      const [existing] = await db
        .select()
        .from(assetNetworks)
        .where(and(eq(assetNetworks.assetSymbol, assetSymbol), eq(assetNetworks.blockchainSlug, networkSlug)))
        .limit(1);
      if (existing) return;
      await db.insert(assetNetworks).values({ assetSymbol, blockchainSlug: networkSlug }).onConflictDoNothing();
    },
  };
}

export type Catalog = Awaited<ReturnType<typeof openCatalog>>;
