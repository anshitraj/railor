/**
 * Lexicon used by the deterministic interpreter.
 *
 * Kept as data rather than regex soup so the same table drives the parser,
 * the picker suggestions and the "did you mean" hints in the UI.
 */

export interface CountryTerm {
  code: string;
  name: string;
  /** Words that mean "a company incorporated there" or the place itself. */
  terms: string[];
  defaultCurrency: string;
}

export const COUNTRY_TERMS: CountryTerm[] = [
  { code: "IN", name: "India", terms: ["india", "indian", "bharat"], defaultCurrency: "INR" },
  {
    code: "AE",
    name: "United Arab Emirates",
    terms: ["uae", "u.a.e", "united arab emirates", "emirati", "dubai", "abu dhabi", "emirates"],
    defaultCurrency: "AED",
  },
  { code: "US", name: "United States", terms: ["us", "u.s.", "usa", "united states", "american", "america"], defaultCurrency: "USD" },
  { code: "GB", name: "United Kingdom", terms: ["uk", "u.k.", "united kingdom", "britain", "british", "england", "london"], defaultCurrency: "GBP" },
  { code: "SG", name: "Singapore", terms: ["singapore", "singaporean"], defaultCurrency: "SGD" },
  { code: "NG", name: "Nigeria", terms: ["nigeria", "nigerian", "lagos"], defaultCurrency: "NGN" },
  { code: "SA", name: "Saudi Arabia", terms: ["saudi", "saudi arabia", "ksa", "riyadh"], defaultCurrency: "USD" },
  { code: "DE", name: "Germany", terms: ["germany", "german", "berlin"], defaultCurrency: "EUR" },
  { code: "FR", name: "France", terms: ["france", "french", "paris"], defaultCurrency: "EUR" },
  { code: "NL", name: "Netherlands", terms: ["netherlands", "dutch", "amsterdam", "holland"], defaultCurrency: "EUR" },
  { code: "BR", name: "Brazil", terms: ["brazil", "brazilian", "brasil"], defaultCurrency: "BRL" },
  { code: "MX", name: "Mexico", terms: ["mexico", "mexican"], defaultCurrency: "USD" },
  { code: "KE", name: "Kenya", terms: ["kenya", "kenyan", "nairobi"], defaultCurrency: "USD" },
  { code: "ZA", name: "South Africa", terms: ["south africa", "south african"], defaultCurrency: "USD" },
  { code: "PH", name: "Philippines", terms: ["philippines", "filipino", "manila"], defaultCurrency: "USD" },
  { code: "ID", name: "Indonesia", terms: ["indonesia", "indonesian", "jakarta"], defaultCurrency: "USD" },
  { code: "TR", name: "Türkiye", terms: ["turkey", "türkiye", "turkish"], defaultCurrency: "USD" },
  { code: "CA", name: "Canada", terms: ["canada", "canadian"], defaultCurrency: "USD" },
  { code: "AU", name: "Australia", terms: ["australia", "australian"], defaultCurrency: "USD" },
  { code: "HK", name: "Hong Kong SAR", terms: ["hong kong", "hongkong", "hk"], defaultCurrency: "USD" },
  { code: "CH", name: "Switzerland", terms: ["switzerland", "swiss", "zurich"], defaultCurrency: "EUR" },
];

/** Regional shorthands founders actually type. */
export const REGION_TERMS: Array<{ terms: string[]; countries: string[]; label: string }> = [
  { terms: ["gcc", "gulf"], countries: ["AE", "SA"], label: "GCC" },
  { terms: ["mena"], countries: ["AE", "SA"], label: "MENA" },
  { terms: ["eu", "europe", "european", "eea"], countries: ["DE", "FR", "NL"], label: "Europe" },
  { terms: ["apac", "asia pacific", "southeast asia", "sea"], countries: ["SG", "PH", "ID", "HK", "AU"], label: "APAC" },
  { terms: ["latam", "latin america"], countries: ["BR", "MX"], label: "LATAM" },
  { terms: ["africa", "african"], countries: ["NG", "KE", "ZA"], label: "Africa" },
];

export const CURRENCY_TERMS: Array<{ code: string; terms: string[] }> = [
  { code: "AED", terms: ["aed", "dirham", "dirhams"] },
  { code: "INR", terms: ["inr", "rupee", "rupees", "₹"] },
  { code: "USD", terms: ["usd", "dollar", "dollars", "us dollars"] },
  { code: "EUR", terms: ["eur", "euro", "euros", "€"] },
  { code: "GBP", terms: ["gbp", "pound", "pounds", "sterling", "£"] },
  { code: "NGN", terms: ["ngn", "naira", "₦"] },
  { code: "SGD", terms: ["sgd", "singapore dollar"] },
  { code: "BRL", terms: ["brl", "real", "reais"] },
];

export const ASSET_TERMS: Array<{ symbol: string; terms: string[] }> = [
  { symbol: "USDC", terms: ["usdc", "usd coin"] },
  { symbol: "USDT", terms: ["usdt", "tether"] },
  { symbol: "EURC", terms: ["eurc", "euro coin"] },
  { symbol: "PYUSD", terms: ["pyusd"] },
];

export const NETWORK_TERMS: Array<{ slug: string; terms: string[] }> = [
  { slug: "base", terms: ["base"] },
  { slug: "ethereum", terms: ["ethereum", "eth mainnet", "erc-20", "erc20"] },
  { slug: "polygon", terms: ["polygon", "matic"] },
  { slug: "arbitrum", terms: ["arbitrum", "arb"] },
  { slug: "solana", terms: ["solana", "spl"] },
  { slug: "tron", terms: ["tron", "trc-20", "trc20"] },
];

export const PRODUCT_TERMS: Array<{ product: string; terms: string[]; label: string }> = [
  { product: "off_ramp", terms: ["off-ramp", "off ramp", "offramp", "cash out", "settle to fiat", "convert to fiat"], label: "Off-ramp" },
  { product: "on_ramp", terms: ["on-ramp", "on ramp", "onramp", "buy stablecoin", "fund with card"], label: "On-ramp" },
  { product: "payout", terms: ["payout", "payouts", "pay out", "disbursement", "send to bank", "bank transfer", "remittance"], label: "Payouts" },
  { product: "collection", terms: ["collection", "collections", "collect payments", "accept payments"], label: "Collections" },
  { product: "virtual_account", terms: ["virtual account", "virtual accounts", "named account", "iban"], label: "Virtual accounts" },
  { product: "card_issuing", terms: ["card issuing", "issue cards", "virtual card", "virtual cards", "card program", "card programme", "debit card"], label: "Card issuing" },
  { product: "card_funding", terms: ["card funding", "fund cards"], label: "Card funding" },
  { product: "wallet", terms: ["wallet infrastructure", "custodial wallet", "wallets"], label: "Wallets" },
  { product: "treasury", terms: ["treasury", "cash management"], label: "Treasury" },
  { product: "kyc_kyb", terms: ["kyc", "kyb", "verification"], label: "KYC / KYB" },
];

export const METHOD_TERMS: Array<{ method: string; terms: string[]; label: string }> = [
  { method: "bank_transfer_local", terms: ["local bank", "local rails", "local transfer", "local payout", "bank account", "bank payout", "bank transfer"], label: "Local bank transfer" },
  { method: "bank_transfer_swift", terms: ["swift"], label: "SWIFT" },
  { method: "sepa", terms: ["sepa"], label: "SEPA" },
  { method: "faster_payments", terms: ["faster payments", "fps"], label: "Faster Payments" },
  { method: "ach", terms: ["ach"], label: "ACH" },
  { method: "wire", terms: ["wire", "fedwire"], label: "Wire" },
  { method: "card", terms: ["card rails"], label: "Card" },
  { method: "wallet_transfer", terms: ["mobile money", "wallet transfer", "m-pesa"], label: "Mobile wallet" },
  { method: "cash_pickup", terms: ["cash pickup", "cash payout"], label: "Cash pickup" },
];

export const BUSINESS_TERMS = [
  "business",
  "businesses",
  "company",
  "companies",
  "corporate",
  "b2b",
  "startup",
  "entity",
  "supplier",
  "vendor",
  "merchant",
  "ltd",
  "llc",
  "pvt",
];

export const INDIVIDUAL_TERMS = [
  "individual",
  "individuals",
  "consumer",
  "consumers",
  "personal",
  "retail user",
  "end user",
  "customers who are individuals",
];

/** Words that mark the phrase after them as the destination side. */
export const DESTINATION_MARKERS = ["to", "into", "receiving", "receives", "recipient", "beneficiary", "payout in", "settle in", "paid in"];
/** Words that mark the phrase after them as the origin/entity side. */
export const ORIGIN_MARKERS = ["from", "incorporated in", "registered in", "based in", "our company in", "entity in"];
