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
  { code: "MX", name: "Mexico", terms: ["mexico", "mexican"], defaultCurrency: "MXN" },
  { code: "KE", name: "Kenya", terms: ["kenya", "kenyan", "nairobi"], defaultCurrency: "USD" },
  { code: "ZA", name: "South Africa", terms: ["south africa", "south african"], defaultCurrency: "ZAR" },
  { code: "PH", name: "Philippines", terms: ["philippines", "filipino", "manila"], defaultCurrency: "USD" },
  { code: "ID", name: "Indonesia", terms: ["indonesia", "indonesian", "jakarta"], defaultCurrency: "IDR" },
  { code: "TR", name: "Türkiye", terms: ["turkey", "türkiye", "turkish"], defaultCurrency: "TRY" },
  { code: "CA", name: "Canada", terms: ["canada", "canadian"], defaultCurrency: "CAD" },
  { code: "AU", name: "Australia", terms: ["australia", "australian"], defaultCurrency: "AUD" },
  { code: "HK", name: "Hong Kong SAR", terms: ["hong kong", "hongkong", "hk"], defaultCurrency: "USD" },
  { code: "CH", name: "Switzerland", terms: ["switzerland", "swiss", "zurich"], defaultCurrency: "CHF" },
  { code: "ES", name: "Spain", terms: ["spain", "spanish", "madrid", "españa"], defaultCurrency: "EUR" },
  { code: "IT", name: "Italy", terms: ["italy", "italian", "rome", "italia"], defaultCurrency: "EUR" },
  { code: "PT", name: "Portugal", terms: ["portugal", "portuguese", "lisbon"], defaultCurrency: "EUR" },
  { code: "IE", name: "Ireland", terms: ["ireland", "irish", "dublin"], defaultCurrency: "EUR" },
  { code: "BE", name: "Belgium", terms: ["belgium", "belgian", "brussels"], defaultCurrency: "EUR" },
  { code: "SE", name: "Sweden", terms: ["sweden", "swedish", "stockholm"], defaultCurrency: "USD" },
  { code: "NO", name: "Norway", terms: ["norway", "norwegian", "oslo"], defaultCurrency: "USD" },
  { code: "DK", name: "Denmark", terms: ["denmark", "danish", "copenhagen"], defaultCurrency: "USD" },
  { code: "PL", name: "Poland", terms: ["poland", "polish", "warsaw"], defaultCurrency: "USD" },
  { code: "QA", name: "Qatar", terms: ["qatar", "qatari", "doha"], defaultCurrency: "USD" },
  { code: "KW", name: "Kuwait", terms: ["kuwait", "kuwaiti"], defaultCurrency: "USD" },
  { code: "BH", name: "Bahrain", terms: ["bahrain", "bahraini", "manama"], defaultCurrency: "USD" },
  { code: "OM", name: "Oman", terms: ["oman", "omani", "muscat"], defaultCurrency: "USD" },
  { code: "IL", name: "Israel", terms: ["israel", "israeli", "tel aviv"], defaultCurrency: "USD" },
  { code: "EG", name: "Egypt", terms: ["egypt", "egyptian", "cairo"], defaultCurrency: "USD" },
  { code: "JP", name: "Japan", terms: ["japan", "japanese", "tokyo"], defaultCurrency: "JPY" },
  { code: "KR", name: "South Korea", terms: ["south korea", "korea", "korean", "seoul"], defaultCurrency: "USD" },
  { code: "CN", name: "China", terms: ["china", "chinese", "beijing", "shanghai"], defaultCurrency: "USD" },
  { code: "TW", name: "Taiwan", terms: ["taiwan", "taiwanese", "taipei"], defaultCurrency: "USD" },
  { code: "VN", name: "Vietnam", terms: ["vietnam", "vietnamese", "hanoi", "ho chi minh"], defaultCurrency: "USD" },
  { code: "TH", name: "Thailand", terms: ["thailand", "thai", "bangkok"], defaultCurrency: "USD" },
  { code: "MY", name: "Malaysia", terms: ["malaysia", "malaysian", "kuala lumpur"], defaultCurrency: "MYR" },
  { code: "PK", name: "Pakistan", terms: ["pakistan", "pakistani", "karachi"], defaultCurrency: "USD" },
  { code: "BD", name: "Bangladesh", terms: ["bangladesh", "bangladeshi", "dhaka"], defaultCurrency: "USD" },
  { code: "LK", name: "Sri Lanka", terms: ["sri lanka", "sri lankan", "colombo"], defaultCurrency: "USD" },
  { code: "NZ", name: "New Zealand", terms: ["new zealand", "kiwi", "auckland"], defaultCurrency: "USD" },
  { code: "GH", name: "Ghana", terms: ["ghana", "ghanaian", "accra"], defaultCurrency: "USD" },
  { code: "MA", name: "Morocco", terms: ["morocco", "moroccan", "casablanca"], defaultCurrency: "USD" },
  { code: "TZ", name: "Tanzania", terms: ["tanzania", "tanzanian", "dar es salaam"], defaultCurrency: "USD" },
  { code: "UG", name: "Uganda", terms: ["uganda", "ugandan", "kampala"], defaultCurrency: "USD" },
  { code: "CI", name: "Côte d'Ivoire", terms: ["ivory coast", "côte d'ivoire", "cote d'ivoire", "abidjan"], defaultCurrency: "USD" },
  { code: "SN", name: "Senegal", terms: ["senegal", "senegalese", "dakar"], defaultCurrency: "USD" },
  { code: "ET", name: "Ethiopia", terms: ["ethiopia", "ethiopian", "addis ababa"], defaultCurrency: "USD" },
  { code: "AR", name: "Argentina", terms: ["argentina", "argentine", "buenos aires"], defaultCurrency: "USD" },
  { code: "CO", name: "Colombia", terms: ["colombia", "colombian", "bogota"], defaultCurrency: "USD" },
  { code: "CL", name: "Chile", terms: ["chile", "chilean", "santiago"], defaultCurrency: "USD" },
  { code: "PE", name: "Peru", terms: ["peru", "peruvian", "lima"], defaultCurrency: "USD" },
];

/** Regional shorthands founders actually type. */
export const REGION_TERMS: Array<{ terms: string[]; countries: string[]; label: string }> = [
  { terms: ["gcc", "gulf"], countries: ["AE", "SA", "QA", "KW", "BH", "OM"], label: "GCC" },
  { terms: ["mena"], countries: ["AE", "SA", "QA", "KW", "BH", "OM", "EG"], label: "MENA" },
  {
    terms: ["eu", "europe", "european", "eea"],
    countries: ["DE", "FR", "NL", "ES", "IT", "PT", "IE", "BE", "SE", "NO", "DK", "PL"],
    label: "Europe",
  },
  {
    terms: ["apac", "asia pacific", "southeast asia", "sea"],
    countries: ["SG", "PH", "ID", "HK", "AU", "JP", "KR", "CN", "TW", "VN", "TH", "MY", "PK", "BD", "LK", "NZ"],
    label: "APAC",
  },
  { terms: ["latam", "latin america"], countries: ["BR", "MX", "AR", "CO", "CL", "PE"], label: "LATAM" },
  { terms: ["africa", "african"], countries: ["NG", "KE", "ZA", "GH", "MA", "TZ", "UG", "CI", "SN", "ET"], label: "Africa" },
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
  { code: "JPY", terms: ["jpy", "yen", "japanese yen", "¥"] },
  { code: "CAD", terms: ["cad", "canadian dollar"] },
  { code: "AUD", terms: ["aud", "australian dollar", "aussie dollar"] },
  { code: "CHF", terms: ["chf", "swiss franc", "franc"] },
  { code: "MXN", terms: ["mxn", "mexican peso", "peso"] },
  { code: "ZAR", terms: ["zar", "south african rand", "rand"] },
  { code: "TRY", terms: ["try", "turkish lira", "lira"] },
  { code: "MYR", terms: ["myr", "malaysian ringgit", "ringgit"] },
  { code: "IDR", terms: ["idr", "indonesian rupiah", "rupiah"] },
];

export const ASSET_TERMS: Array<{ symbol: string; terms: string[] }> = [
  { symbol: "USDC", terms: ["usdc", "usd coin"] },
  { symbol: "USDT", terms: ["usdt", "tether"] },
  { symbol: "EURC", terms: ["eurc", "euro coin"] },
  { symbol: "PYUSD", terms: ["pyusd"] },
  { symbol: "USDG", terms: ["usdg", "global dollar"] },
  { symbol: "GHO", terms: ["gho", "aave gho"] },
  { symbol: "USDS", terms: ["usds", "sky usd", "sky protocol"] },
  { symbol: "USDe", terms: ["usde", "ethena"] },
  { symbol: "FDUSD", terms: ["fdusd", "first digital usd"] },
  { symbol: "RLUSD", terms: ["rlusd", "ripple usd"] },
  { symbol: "USDP", terms: ["usdp", "pax dollar", "paxos standard"] },
  { symbol: "TUSD", terms: ["tusd", "trueusd"] },
  { symbol: "GUSD", terms: ["gusd", "gemini dollar"] },
  { symbol: "USYC", terms: ["usyc", "us yield coin", "hashnote"] },
];

export const NETWORK_TERMS: Array<{ slug: string; terms: string[] }> = [
  { slug: "base", terms: ["base"] },
  { slug: "ethereum", terms: ["ethereum", "eth mainnet", "erc-20", "erc20"] },
  { slug: "polygon", terms: ["polygon", "matic"] },
  { slug: "arbitrum", terms: ["arbitrum", "arb"] },
  { slug: "solana", terms: ["solana", "spl"] },
  { slug: "tron", terms: ["tron", "trc-20", "trc20"] },
  { slug: "avalanche", terms: ["avalanche", "avax", "c-chain"] },
  { slug: "optimism", terms: ["optimism", "op mainnet", "op stack"] },
  { slug: "bnb-chain", terms: ["bnb chain", "bnb smart chain", "bsc", "binance smart chain", "bep-20", "bep20"] },
  { slug: "celo", terms: ["celo"] },
  { slug: "stellar", terms: ["stellar", "xlm"] },
  { slug: "ton", terms: ["ton", "the open network", "toncoin"] },
  { slug: "arc", terms: ["arc"] },
  { slug: "plasma", terms: ["plasma"] },
  { slug: "tempo", terms: ["tempo"] },
  { slug: "algorand", terms: ["algorand", "algo"] },
  { slug: "aptos", terms: ["aptos"] },
  { slug: "bitcoin", terms: ["bitcoin", "btc", "omni"] },
  { slug: "codex", terms: ["codex"] },
  { slug: "cronos", terms: ["cronos"] },
  { slug: "edge-chain", terms: ["edge chain"] },
  { slug: "eos", terms: ["eos"] },
  { slug: "hedera", terms: ["hedera", "hbar"] },
  { slug: "hyperevm", terms: ["hyperevm", "hyper evm"] },
  { slug: "injective", terms: ["injective"] },
  { slug: "ink", terms: ["ink"] },
  { slug: "kava", terms: ["kava"] },
  { slug: "linea", terms: ["linea"] },
  { slug: "monad", terms: ["monad"] },
  { slug: "morph", terms: ["morph"] },
  { slug: "near", terms: ["near"] },
  { slug: "noble", terms: ["noble"] },
  { slug: "pharos", terms: ["pharos"] },
  { slug: "plume", terms: ["plume"] },
  { slug: "polkadot", terms: ["polkadot", "polka"] },
  { slug: "robinhood-chain", terms: ["robinhood chain"] },
  { slug: "sei", terms: ["sei"] },
  { slug: "sonic", terms: ["sonic"] },
  { slug: "sui", terms: ["sui"] },
  { slug: "tezos", terms: ["tezos"] },
  { slug: "unichain", terms: ["unichain"] },
  { slug: "world-chain", terms: ["world chain"] },
  { slug: "xdc", terms: ["xdc"] },
  { slug: "xrpl", terms: ["xrpl", "xrp ledger"] },
  { slug: "xrpl-evm", terms: ["xrpl evm"] },
  { slug: "zksync", terms: ["zksync", "zk sync"] },
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

/**
 * Specific named rails — UPI, CHAPS, Pix — as opposed to METHOD_TERMS'
 * generic buckets that all of these otherwise collapse into. Matching a
 * term here ADDS a `namedRail` token; it never replaces the generic
 * `paymentMethod` match ("sepa" still sets paymentMethod:"sepa" *and*, with
 * a qualifier, namedRail:"SEPA_ICT_DE" — independent facts, independent
 * fields, exactly per named_rails' own doc comment.
 *
 * Deliberately excludes terms too short or too generic to trust as a rail
 * name rather than an unrelated word: bare "rtp" (broadcast/gaming
 * acronym), "pse"/"nip" (2-3 letters, high false-positive rate), "swish"
 * (ordinary English word), "pay now" (generic CTA phrase — "paynow" as one
 * word is fine). Codes must exist in packages/database/src/seed/data.ts's
 * `namedRails` array or this is a dangling reference nothing can resolve.
 */
export const NAMED_RAIL_TERMS: Array<{ code: string; terms: string[] }> = [
  { code: "UPI", terms: ["upi"] },
  { code: "IMPS", terms: ["imps"] },
  { code: "NEFT", terms: ["neft"] },
  { code: "PIX", terms: ["pix"] },
  { code: "BOLETO", terms: ["boleto"] },
  { code: "SPEI", terms: ["spei"] },
  { code: "FEDNOW", terms: ["fednow", "fed now"] },
  { code: "CHAPS", terms: ["chaps"] },
  { code: "BACS", terms: ["bacs"] },
  { code: "FASTER_PAYMENTS_GB", terms: ["faster payments", "fps"] },
  { code: "MPESA", terms: ["m-pesa", "mpesa"] },
  { code: "AIRTEL_MONEY_KE", terms: ["airtel money"] },
  { code: "PAYSHAP", terms: ["payshap", "pay shap"] },
  { code: "ZENGIN", terms: ["zengin"] },
  { code: "INTERAC_E_TRANSFER", terms: ["interac e-transfer", "interac"] },
  { code: "PAYNOW", terms: ["paynow"] },
  { code: "INSTAPAY", terms: ["instapay"] },
  { code: "PESONET", terms: ["pesonet"] },
];

/**
 * SEPA's two rails are the same country-by-country problem as everything
 * else in named_rails (SEPA_ICT_DE and SEPA_ICT_FR are different rows, same
 * as how UPI and PIX are), except a person typing "SEPA Instant" never
 * names the country — it has to come from whatever country the rest of the
 * query already resolved. `qualifierTerms` alone (no country in the same
 * query) intentionally resolves to nothing rather than guessing a Eurozone
 * country: an unresolvable SEPA_ICT reference is worse than an honest miss.
 */
export const SEPA_RAIL_TEMPLATES: Array<{ suffix: "ICT" | "CT"; qualifierTerms: string[] }> = [
  { suffix: "ICT", qualifierTerms: ["sepa instant", "sepa inst", "instant sepa"] },
  { suffix: "CT", qualifierTerms: ["sepa credit transfer", "sepa credit", "regular sepa", "standard sepa"] },
];
/** Countries named_rails actually has a SEPA_ICT_{cc}/SEPA_CT_{cc} pair for. */
export const SEPA_RAIL_COUNTRIES = ["DE", "FR", "NL", "IT", "ES", "PT", "IE", "BE"];

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
