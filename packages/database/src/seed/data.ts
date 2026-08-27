/**
 * Railor demo dataset.
 *
 * Every provider here is FICTIONAL. Nothing in this file describes a real
 * financial company, and `providers.is_demo` is true for all of them so the
 * UI can label them. Evidence URLs point at demo.railor.dev, never at a real
 * company's documentation.
 *
 * The dataset is shaped so the flagship demo query —
 *   Indian-incorporated business, USDC on Base → AED bank payout in the UAE
 * — returns a realistic spread: supported, additional requirements,
 * unavailable-with-reason, and unknown.
 */
import type { PaymentMethod, ProductType } from "@railor/types";

export const countries = [
  { code: "IN", name: "India", region: "South Asia", flag: "🇮🇳", popularity: 95 },
  { code: "AE", name: "United Arab Emirates", region: "Middle East", flag: "🇦🇪", popularity: 92 },
  { code: "US", name: "United States", region: "North America", flag: "🇺🇸", popularity: 99 },
  { code: "GB", name: "United Kingdom", region: "Europe", flag: "🇬🇧", popularity: 90 },
  { code: "SG", name: "Singapore", region: "APAC", flag: "🇸🇬", popularity: 88 },
  { code: "NG", name: "Nigeria", region: "Africa", flag: "🇳🇬", popularity: 80 },
  { code: "SA", name: "Saudi Arabia", region: "Middle East", flag: "🇸🇦", popularity: 74 },
  { code: "DE", name: "Germany", region: "Europe", flag: "🇩🇪", popularity: 82 },
  { code: "FR", name: "France", region: "Europe", flag: "🇫🇷", popularity: 70 },
  { code: "NL", name: "Netherlands", region: "Europe", flag: "🇳🇱", popularity: 68 },
  { code: "BR", name: "Brazil", region: "LATAM", flag: "🇧🇷", popularity: 78 },
  { code: "MX", name: "Mexico", region: "LATAM", flag: "🇲🇽", popularity: 76 },
  { code: "KE", name: "Kenya", region: "Africa", flag: "🇰🇪", popularity: 62 },
  { code: "ZA", name: "South Africa", region: "Africa", flag: "🇿🇦", popularity: 60 },
  { code: "PH", name: "Philippines", region: "APAC", flag: "🇵🇭", popularity: 66 },
  { code: "ID", name: "Indonesia", region: "APAC", flag: "🇮🇩", popularity: 64 },
  { code: "TR", name: "Türkiye", region: "Europe", flag: "🇹🇷", popularity: 58 },
  { code: "CA", name: "Canada", region: "North America", flag: "🇨🇦", popularity: 72 },
  { code: "AU", name: "Australia", region: "APAC", flag: "🇦🇺", popularity: 65 },
  { code: "HK", name: "Hong Kong SAR", region: "APAC", flag: "🇭🇰", popularity: 71 },
  { code: "CH", name: "Switzerland", region: "Europe", flag: "🇨🇭", popularity: 63 },
  { code: "ES", name: "Spain", region: "Europe", flag: "🇪🇸", popularity: 73 },
  { code: "IT", name: "Italy", region: "Europe", flag: "🇮🇹", popularity: 71 },
  { code: "PT", name: "Portugal", region: "Europe", flag: "🇵🇹", popularity: 55 },
  { code: "IE", name: "Ireland", region: "Europe", flag: "🇮🇪", popularity: 60 },
  { code: "SE", name: "Sweden", region: "Europe", flag: "🇸🇪", popularity: 57 },
  { code: "NO", name: "Norway", region: "Europe", flag: "🇳🇴", popularity: 52 },
  { code: "DK", name: "Denmark", region: "Europe", flag: "🇩🇰", popularity: 53 },
  { code: "PL", name: "Poland", region: "Europe", flag: "🇵🇱", popularity: 56 },
  { code: "BE", name: "Belgium", region: "Europe", flag: "🇧🇪", popularity: 54 },
  { code: "QA", name: "Qatar", region: "Middle East", flag: "🇶🇦", popularity: 61 },
  { code: "KW", name: "Kuwait", region: "Middle East", flag: "🇰🇼", popularity: 54 },
  { code: "BH", name: "Bahrain", region: "Middle East", flag: "🇧🇭", popularity: 50 },
  { code: "OM", name: "Oman", region: "Middle East", flag: "🇴🇲", popularity: 48 },
  { code: "IL", name: "Israel", region: "Middle East", flag: "🇮🇱", popularity: 62 },
  { code: "EG", name: "Egypt", region: "Middle East", flag: "🇪🇬", popularity: 59 },
  { code: "JP", name: "Japan", region: "APAC", flag: "🇯🇵", popularity: 79 },
  { code: "KR", name: "South Korea", region: "APAC", flag: "🇰🇷", popularity: 75 },
  { code: "CN", name: "China", region: "APAC", flag: "🇨🇳", popularity: 77 },
  { code: "TW", name: "Taiwan", region: "APAC", flag: "🇹🇼", popularity: 63 },
  { code: "VN", name: "Vietnam", region: "APAC", flag: "🇻🇳", popularity: 61 },
  { code: "TH", name: "Thailand", region: "APAC", flag: "🇹🇭", popularity: 60 },
  { code: "MY", name: "Malaysia", region: "APAC", flag: "🇲🇾", popularity: 62 },
  { code: "PK", name: "Pakistan", region: "APAC", flag: "🇵🇰", popularity: 55 },
  { code: "BD", name: "Bangladesh", region: "APAC", flag: "🇧🇩", popularity: 52 },
  { code: "LK", name: "Sri Lanka", region: "APAC", flag: "🇱🇰", popularity: 45 },
  { code: "NZ", name: "New Zealand", region: "APAC", flag: "🇳🇿", popularity: 57 },
  { code: "GH", name: "Ghana", region: "Africa", flag: "🇬🇭", popularity: 54 },
  { code: "MA", name: "Morocco", region: "Africa", flag: "🇲🇦", popularity: 51 },
  { code: "TZ", name: "Tanzania", region: "Africa", flag: "🇹🇿", popularity: 47 },
  { code: "UG", name: "Uganda", region: "Africa", flag: "🇺🇬", popularity: 46 },
  { code: "CI", name: "Côte d'Ivoire", region: "Africa", flag: "🇨🇮", popularity: 45 },
  { code: "SN", name: "Senegal", region: "Africa", flag: "🇸🇳", popularity: 44 },
  { code: "ET", name: "Ethiopia", region: "Africa", flag: "🇪🇹", popularity: 46 },
  { code: "AR", name: "Argentina", region: "LATAM", flag: "🇦🇷", popularity: 68 },
  { code: "CO", name: "Colombia", region: "LATAM", flag: "🇨🇴", popularity: 64 },
  { code: "CL", name: "Chile", region: "LATAM", flag: "🇨🇱", popularity: 60 },
  { code: "PE", name: "Peru", region: "LATAM", flag: "🇵🇪", popularity: 55 },
] as const;

export const currencies = [
  { code: "USD", name: "US Dollar", symbol: "$", countryCode: "US", popularity: 99 },
  { code: "EUR", name: "Euro", symbol: "€", countryCode: "DE", popularity: 93 },
  { code: "GBP", name: "Pound Sterling", symbol: "£", countryCode: "GB", popularity: 85 },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", countryCode: "AE", popularity: 88 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", countryCode: "IN", popularity: 84 },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", countryCode: "NG", popularity: 74 },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", countryCode: "SG", popularity: 70 },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", countryCode: "BR", popularity: 69 },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", countryCode: "JP", popularity: 80 },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", countryCode: "CA", popularity: 65 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", countryCode: "AU", popularity: 62 },
  { code: "CHF", name: "Swiss Franc", symbol: "Fr.", countryCode: "CH", popularity: 60 },
  { code: "MXN", name: "Mexican Peso", symbol: "$", countryCode: "MX", popularity: 58 },
  { code: "ZAR", name: "South African Rand", symbol: "R", countryCode: "ZA", popularity: 50 },
  { code: "TRY", name: "Turkish Lira", symbol: "₺", countryCode: "TR", popularity: 48 },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", countryCode: "MY", popularity: 46 },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", countryCode: "ID", popularity: 44 },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", countryCode: "HK", popularity: 55 },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", countryCode: "CN", popularity: 78 },
  { code: "ILS", name: "Israeli New Shekel", symbol: "₪", countryCode: "IL", popularity: 42 },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", countryCode: "NZ", popularity: 41 },
  { code: "PLN", name: "Polish Złoty", symbol: "zł", countryCode: "PL", popularity: 40 },
  { code: "COP", name: "Colombian Peso", symbol: "$", countryCode: "CO", popularity: 39 },
  { code: "ARS", name: "Argentine Peso", symbol: "$", countryCode: "AR", popularity: 38 },
] as const;

/**
 * Real, named local payment rails — as opposed to paymentMethodEnum's
 * generic buckets that all of these otherwise collapse into ("PIX" and
 * "a Nigerian bank transfer" are both just `bank_transfer_local` there).
 * `category` keeps that generic bucket too, so nothing that already filters
 * by paymentMethodEnum needs to change. Real, well-documented, low-
 * confidence-risk facts (a national payment rail's name is public
 * knowledge, not a claim about what any specific provider supports) —
 * unlike provider capability rows, these don't need an evidence citation.
 * Deliberately not exhaustive: this is the set from the markets already
 * researched (India, Brazil, Mexico, Colombia, Argentina, the US, Kenya,
 * the UK, the Eurozone) plus a handful more of comparable confidence, not
 * a global sweep — see PROJECT_STATUS.md for exactly which countries in
 * the 58-country research pipeline still have no named_rails rows.
 *
 * category picks the *specific* paymentMethodEnum value where one exists
 * for this rail by name (faster_payments/sepa/ach/wire all double as
 * literal search terms — see vocab.ts's METHOD_TERMS), falling back to the
 * generic bank_transfer_local/wallet_transfer bucket otherwise — same
 * choice FedNow/RTP already made above for a "real named rail, no
 * dedicated enum value" case.
 */
export const namedRails = [
  { code: "UPI", name: "UPI", countryCode: "IN", category: "bank_transfer_local", description: "India's real-time bank-to-bank instant payment rail." },
  { code: "IMPS", name: "IMPS", countryCode: "IN", category: "bank_transfer_local", description: "India's 24/7 interbank instant payment system, predates UPI." },
  { code: "NEFT", name: "NEFT", countryCode: "IN", category: "bank_transfer_local", description: "India's batched (half-hourly) interbank transfer system." },
  { code: "RTGS", name: "RTGS", countryCode: "IN", category: "bank_transfer_local", description: "India's real-time gross settlement system for high-value transfers." },
  { code: "PIX", name: "PIX", countryCode: "BR", category: "bank_transfer_local", description: "Brazil's instant payment system, run by the central bank (BCB)." },
  { code: "TED", name: "TED", countryCode: "BR", category: "bank_transfer_local", description: "Brazil's same-day wire transfer, largely superseded by PIX for smaller amounts." },
  { code: "BOLETO", name: "Boleto Bancário", countryCode: "BR", category: "bank_transfer_local", description: "Brazil's voucher-based payment instrument, paid at a bank, ATM or app." },
  { code: "SPEI", name: "SPEI", countryCode: "MX", category: "bank_transfer_local", description: "Mexico's interbank electronic payment system, run by Banco de México." },
  { code: "PSE", name: "PSE", countryCode: "CO", category: "bank_transfer_local", description: "Colombia's online bank-debit payment rail (Pagos Seguros en Línea)." },
  { code: "TRANSFERENCIAS_3", name: "Transferencias 3.0", countryCode: "AR", category: "bank_transfer_local", description: "Argentina's interoperable instant-transfer rail across banks and wallets." },
  { code: "FEDNOW", name: "FedNow", countryCode: "US", category: "bank_transfer_local", description: "The Federal Reserve's instant payment rail, launched 2023." },
  { code: "RTP", name: "RTP", countryCode: "US", category: "bank_transfer_local", description: "The Clearing House's real-time payments network." },
  { code: "MPESA", name: "M-PESA", countryCode: "KE", category: "wallet_transfer", description: "Safaricom's mobile money service, the dominant wallet rail in Kenya." },
  { code: "AIRTEL_MONEY_KE", name: "Airtel Money", countryCode: "KE", category: "wallet_transfer", description: "Airtel's mobile money service, Kenya's second major wallet rail." },
  { code: "NIP", name: "NIP", countryCode: "NG", category: "bank_transfer_local", description: "Nigeria's NIBSS Instant Payment rail for interbank transfers." },
  { code: "PAYNOW", name: "PayNow", countryCode: "SG", category: "bank_transfer_local", description: "Singapore's peer-to-peer/business instant transfer rail, addressed by phone or ID." },
  { code: "FAST_SG", name: "FAST", countryCode: "SG", category: "bank_transfer_local", description: "Singapore's Fast and Secure Transfers interbank rail." },
  { code: "INSTAPAY", name: "InstaPay", countryCode: "PH", category: "bank_transfer_local", description: "The Philippines' real-time low-value interbank transfer rail." },
  { code: "PESONET", name: "PESONet", countryCode: "PH", category: "bank_transfer_local", description: "The Philippines' batched (same/next-day) interbank transfer rail." },

  // United Kingdom
  { code: "FASTER_PAYMENTS_GB", name: "Faster Payments", countryCode: "GB", category: "faster_payments", description: "The UK's near-instant interbank push-payment system, run by Pay.UK." },
  { code: "BACS", name: "Bacs", countryCode: "GB", category: "bank_transfer_local", description: "The UK's batched (3-day) direct-debit and direct-credit clearing system." },
  { code: "CHAPS", name: "CHAPS", countryCode: "GB", category: "wire", description: "The UK's same-day, high-value real-time gross settlement wire system." },

  // United States (FedNow/RTP already listed above)
  { code: "ACH_US", name: "ACH", countryCode: "US", category: "ach", description: "The US's batched (same/next-day) interbank clearing network, run by Nacha." },
  { code: "FEDWIRE", name: "Fedwire", countryCode: "US", category: "wire", description: "The Federal Reserve's same-day, high-value real-time gross settlement wire system." },

  // Eurozone — scoped to countries in Railor's dataset that actually settle in EUR;
  // SEPA also reaches non-Euro participants (UK, Switzerland, Nordics), but that's
  // a secondary fact this file isn't confident enough in to assert without
  // per-country verification, consistent with this dataset's "null over a shaky
  // guess" rule elsewhere.
  ...["DE", "FR", "NL", "IT", "ES", "PT", "IE", "BE"].flatMap((cc) => [
    {
      code: `SEPA_CT_${cc}`,
      name: "SEPA Credit Transfer",
      countryCode: cc,
      category: "sepa" as const,
      description: "Eurozone-wide EUR bank transfer, same or next business day, run under the SEPA scheme.",
    },
    {
      code: `SEPA_ICT_${cc}`,
      name: "SEPA Instant Credit Transfer",
      countryCode: cc,
      category: "sepa" as const,
      description: "Eurozone-wide EUR instant bank transfer (funds available within 10 seconds), run under the SEPA scheme.",
    },
  ]),
] as const;

export const blockchains = [
  { slug: "ethereum", name: "Ethereum", chainId: "1", finalitySeconds: 780, popularity: 95 },
  { slug: "base", name: "Base", chainId: "8453", finalitySeconds: 12, popularity: 92 },
  { slug: "polygon", name: "Polygon PoS", chainId: "137", finalitySeconds: 30, popularity: 80 },
  { slug: "arbitrum", name: "Arbitrum One", chainId: "42161", finalitySeconds: 15, popularity: 82 },
  { slug: "solana", name: "Solana", chainId: "solana-mainnet", finalitySeconds: 13, popularity: 88 },
  { slug: "tron", name: "Tron", chainId: "tron-mainnet", finalitySeconds: 60, popularity: 76 },
  { slug: "avalanche", name: "Avalanche C-Chain", chainId: "43114", finalitySeconds: 2, popularity: 74 },
  { slug: "optimism", name: "OP Mainnet", chainId: "10", finalitySeconds: 12, popularity: 78 },
  { slug: "bnb-chain", name: "BNB Smart Chain", chainId: "56", finalitySeconds: 3, popularity: 81 },
  { slug: "celo", name: "Celo", chainId: "42220", finalitySeconds: 12, popularity: 52 },
  { slug: "stellar", name: "Stellar", chainId: "stellar-mainnet", finalitySeconds: 5, popularity: 56 },
  { slug: "ton", name: "TON", chainId: "ton-mainnet", finalitySeconds: 5, popularity: 66 },
  // Chain IDs left null below: each network is new enough (2025 launches) that
  // Railor doesn't have a verified mainnet identifier yet — better unknown
  // than a guessed number nobody checked.
  { slug: "arc", name: "Arc", chainId: null, finalitySeconds: null, popularity: 40 },
  { slug: "plasma", name: "Plasma", chainId: null, finalitySeconds: null, popularity: 45 },
  { slug: "tempo", name: "Tempo", chainId: null, finalitySeconds: null, popularity: 35 },
] as const;

export const assets = [
  { symbol: "USDC", name: "USD Coin", kind: "stablecoin", issuer: "Demo Issuer A", peggedTo: "USD", popularity: 99 },
  { symbol: "USDT", name: "Tether USD", kind: "stablecoin", issuer: "Demo Issuer B", peggedTo: "USD", popularity: 96 },
  { symbol: "EURC", name: "Euro Coin", kind: "stablecoin", issuer: "Demo Issuer A", peggedTo: "EUR", popularity: 72 },
  { symbol: "PYUSD", name: "Demo Payments USD", kind: "stablecoin", issuer: "Demo Issuer C", peggedTo: "USD", popularity: 58 },
  { symbol: "USDe", name: "USDe", kind: "stablecoin", issuer: "Ethena Labs", peggedTo: "USD", popularity: 68 },
  { symbol: "FDUSD", name: "First Digital USD", kind: "stablecoin", issuer: "First Digital Labs", peggedTo: "USD", popularity: 55 },
  { symbol: "RLUSD", name: "Ripple USD", kind: "stablecoin", issuer: "Ripple", peggedTo: "USD", popularity: 45 },
  { symbol: "USDP", name: "Pax Dollar", kind: "stablecoin", issuer: "Paxos", peggedTo: "USD", popularity: 40 },
  { symbol: "TUSD", name: "TrueUSD", kind: "stablecoin", issuer: "Techteryx", peggedTo: "USD", popularity: 38 },
  { symbol: "GUSD", name: "Gemini Dollar", kind: "stablecoin", issuer: "Gemini", peggedTo: "USD", popularity: 30 },
  // Technically a yield-bearing tokenized treasury fund, not a strict $1 peg —
  // grouped with stablecoins because that's how the corridor search treats it.
  { symbol: "USYC", name: "US Yield Coin", kind: "stablecoin", issuer: "Hashnote (Circle)", peggedTo: "USD", popularity: 42 },
] as const;

export const assetNetworks: Array<{ asset: string; chain: string }> = [
  { asset: "USDC", chain: "ethereum" },
  { asset: "USDC", chain: "base" },
  { asset: "USDC", chain: "polygon" },
  { asset: "USDC", chain: "arbitrum" },
  { asset: "USDC", chain: "solana" },
  { asset: "USDC", chain: "avalanche" },
  { asset: "USDC", chain: "optimism" },
  { asset: "USDC", chain: "celo" },
  { asset: "USDC", chain: "stellar" },
  { asset: "USDC", chain: "arc" },
  { asset: "USDT", chain: "ethereum" },
  { asset: "USDT", chain: "tron" },
  { asset: "USDT", chain: "polygon" },
  { asset: "USDT", chain: "solana" },
  { asset: "USDT", chain: "avalanche" },
  { asset: "USDT", chain: "bnb-chain" },
  { asset: "USDT", chain: "ton" },
  { asset: "USDT", chain: "plasma" },
  { asset: "EURC", chain: "ethereum" },
  { asset: "EURC", chain: "base" },
  { asset: "EURC", chain: "avalanche" },
  { asset: "PYUSD", chain: "ethereum" },
  { asset: "PYUSD", chain: "solana" },
  { asset: "USDe", chain: "ethereum" },
  { asset: "USDe", chain: "arbitrum" },
  { asset: "FDUSD", chain: "ethereum" },
  { asset: "FDUSD", chain: "bnb-chain" },
  { asset: "RLUSD", chain: "ethereum" },
  { asset: "USDP", chain: "ethereum" },
  { asset: "TUSD", chain: "ethereum" },
  { asset: "TUSD", chain: "tron" },
  { asset: "TUSD", chain: "bnb-chain" },
  { asset: "GUSD", chain: "ethereum" },
  { asset: "USYC", chain: "ethereum" },
  { asset: "USYC", chain: "solana" },
];

/** Normalized requirement vocabulary — provider phrasings map onto these keys. */
export const requirements = [
  {
    key: "company_registration",
    kind: "kyb",
    label: "Certificate of incorporation",
    description: "Registration document issued by the company registry of the jurisdiction.",
    aliases: ["certificate of incorporation", "company registration", "registration certificate", "CoI"],
  },
  {
    key: "director_identity",
    kind: "kyb",
    label: "Director identity verification",
    description: "Government photo ID for each listed director.",
    aliases: ["director ID", "director identification", "officer identity"],
  },
  {
    key: "ubo_disclosure",
    kind: "kyb",
    label: "UBO disclosure",
    description: "Identification of every ultimate beneficial owner above the disclosure threshold.",
    aliases: ["ultimate beneficial owner", "beneficial owner", "UBO", "ownership structure"],
  },
  {
    key: "business_address_proof",
    kind: "kyb",
    label: "Proof of business address",
    description: "Utility bill, lease or registry extract no older than 90 days.",
    aliases: ["address proof", "proof of address", "registered office proof"],
  },
  {
    key: "sanctions_screening",
    kind: "kyb",
    label: "Sanctions screening",
    description: "Screening of the entity and its officers against sanctions lists.",
    aliases: ["sanctions check", "AML screening", "watchlist screening"],
  },
  {
    key: "source_of_funds",
    kind: "kyb",
    label: "Source of funds declaration",
    description: "Statement describing the origin of funds moved through the account.",
    aliases: ["SoF", "source of wealth", "funds origin"],
  },
  {
    key: "bank_statement",
    kind: "kyb",
    label: "Recent bank statement",
    description: "Corporate bank statement covering the last three months.",
    aliases: ["bank statement", "account statement"],
  },
  {
    key: "director_selfie",
    kind: "kyc",
    label: "Director liveness check",
    description: "Selfie or video liveness verification for the signing director.",
    aliases: ["selfie verification", "liveness check", "video KYC"],
  },
  {
    key: "processing_history",
    kind: "kyb",
    label: "Processing history",
    description: "Six months of prior payment processing statements.",
    aliases: ["processing statements", "volume history"],
  },
  {
    key: "licence_disclosure",
    kind: "kyb",
    label: "Regulatory licence disclosure",
    description: "Any money services or payments licence held by the entity.",
    aliases: ["licence", "regulatory permission", "MSB registration"],
  },
  {
    key: "website_review",
    kind: "kyb",
    label: "Website / product review",
    description: "Live product or website demonstrating the described use case.",
    aliases: ["product review", "website check"],
  },
  {
    key: "webhook_endpoint",
    kind: "technical",
    label: "Webhook endpoint",
    description: "HTTPS endpoint able to receive signed provider callbacks.",
    aliases: ["callback URL", "webhook URL"],
  },
] as const;

export type Availability = "supported" | "partial" | "unsupported" | "unknown";

export interface ProviderSpec {
  slug: string;
  name: string;
  category: string;
  description: string;
  headquarters: string;
  licensingSummary: string;
  hasApi: boolean;
  hasSandbox: boolean;
  hasWebhooks: boolean;
  sdkLanguages: string[];
  advertisedSettlement: string;
  onboardingDays: number;
  products: Array<{ product: ProductType; name: string; description: string }>;
  /** Entity jurisdictions whose *businesses* this provider can onboard. */
  entity: { supported: string[]; partial?: string[]; unsupported?: string[] };
  customerTypes: Array<"business" | "individual">;
  assets: string[];
  networks: string[];
  /** Payout corridors: destination country → currencies + methods. */
  payouts: Array<{
    country: string;
    currencies: string[];
    methods: PaymentMethod[];
    availability?: Availability;
    note?: string;
  }>;
  requirements: Array<{ key: string; mandatory?: boolean; note?: string; entityCountry?: string }>;
  fees: Array<{ product: string; currency?: string; percentBps?: number; fixed?: number; fixedCurrency?: string; fxSpreadBps?: number; summary: string }>;
  limits: Array<{ product: string; currency: string; min?: number; max?: number; monthly?: number; summary: string }>;
  sources: Array<{ url: string; title: string; type: string; requiresJs?: boolean }>;
  /** Hours since now that this provider's data was last verified. */
  verifiedHoursAgo: number;
}

const D = "https://demo.railor.dev/sources";

export const providerSpecs: ProviderSpec[] = [
  {
    slug: "northwind-rails",
    name: "Northwind Rails",
    category: "Payments infrastructure",
    description:
      "Demo provider. Stablecoin-to-fiat payout infrastructure covering the Gulf, South Asia and Western Europe, with virtual accounts and a documented REST API.",
    headquarters: "AE",
    licensingSummary: "Operates via sponsor banks in AE and NL; EMI licence held by group entity in NL.",
    hasApi: true,
    hasSandbox: true,
    hasWebhooks: true,
    sdkLanguages: ["TypeScript", "Python", "Go"],
    advertisedSettlement: "Under 10 minutes for AED payouts",
    onboardingDays: 9,
    products: [
      { product: "off_ramp", name: "Stablecoin off-ramp", description: "USDC/USDT converted and paid out to local bank accounts." },
      { product: "payout", name: "Local bank payouts", description: "Local rails in AE, IN, GB, DE." },
      { product: "virtual_account", name: "Named virtual accounts", description: "Multi-currency named accounts for collections." },
    ],
    entity: { supported: ["IN", "AE", "SG", "GB", "US", "DE", "NL"], partial: ["NG"], unsupported: ["TR"] },
    customerTypes: ["business"],
    assets: ["USDC", "USDT", "EURC"],
    networks: ["ethereum", "base", "polygon", "arbitrum"],
    payouts: [
      { country: "AE", currencies: ["AED"], methods: ["bank_transfer_local", "bank_transfer_swift"] },
      { country: "IN", currencies: ["INR"], methods: ["bank_transfer_local"], availability: "partial", note: "INR payouts require an additional purpose-code declaration per transaction." },
      { country: "GB", currencies: ["GBP"], methods: ["faster_payments"] },
      { country: "DE", currencies: ["EUR"], methods: ["sepa"] },
      { country: "SG", currencies: ["SGD"], methods: ["bank_transfer_local"] },
    ],
    requirements: [
      { key: "company_registration" },
      { key: "director_identity" },
      { key: "ubo_disclosure" },
      { key: "business_address_proof" },
      { key: "sanctions_screening" },
      { key: "source_of_funds" },
      { key: "webhook_endpoint", mandatory: false },
    ],
    fees: [
      { product: "off_ramp", currency: "AED", percentBps: 45, fxSpreadBps: 25, summary: "0.45% + 25bps FX spread on AED settlement" },
      { product: "payout", currency: "GBP", fixed: 0.4, fixedCurrency: "GBP", summary: "£0.40 per Faster Payments payout" },
    ],
    limits: [
      { product: "off_ramp", currency: "USD", min: 100, max: 250000, monthly: 5000000, summary: "$100 min · $250k per payout · $5m monthly" },
    ],
    sources: [
      { url: `${D}/northwind/coverage`, title: "Northwind Rails — country coverage", type: "official_docs" },
      { url: `${D}/northwind/onboarding`, title: "Northwind Rails — business onboarding requirements", type: "official_docs" },
      { url: `${D}/northwind/pricing`, title: "Northwind Rails — pricing", type: "pricing" },
      { url: `${D}/northwind/status`, title: "Northwind Rails — status", type: "status_page" },
    ],
    verifiedHoursAgo: 2,
  },
  {
    slug: "meridian-pay",
    name: "Meridian Pay",
    category: "Cross-border payouts",
    description:
      "Demo provider. Corridor-focused payout network with deep GCC and African coverage, onboarding businesses through a regional sponsor structure.",
    headquarters: "GB",
    licensingSummary: "FCA-authorised payment institution (demo); GCC coverage via partner banks.",
    hasApi: true,
    hasSandbox: true,
    hasWebhooks: true,
    sdkLanguages: ["TypeScript", "Python"],
    advertisedSettlement: "Same business day",
    onboardingDays: 14,
    products: [
      { product: "off_ramp", name: "Off-ramp", description: "Stablecoin settlement into fiat payouts." },
      { product: "payout", name: "Payouts", description: "Local and SWIFT payouts across 40 demo markets." },
    ],
    entity: { supported: ["GB", "AE", "SG", "US", "DE", "ZA"], partial: ["IN"], unsupported: [] },
    customerTypes: ["business"],
    assets: ["USDC", "USDT"],
    networks: ["ethereum", "base", "tron", "solana"],
    payouts: [
      { country: "AE", currencies: ["AED"], methods: ["bank_transfer_local"] },
      { country: "NG", currencies: ["NGN"], methods: ["bank_transfer_local"] },
      { country: "KE", currencies: ["USD"], methods: ["bank_transfer_local"] },
      { country: "ZA", currencies: ["USD"], methods: ["bank_transfer_swift"] },
      { country: "GB", currencies: ["GBP"], methods: ["faster_payments"] },
    ],
    requirements: [
      { key: "company_registration" },
      { key: "director_identity" },
      { key: "ubo_disclosure" },
      { key: "sanctions_screening" },
      { key: "bank_statement", note: "Required for entities incorporated in India.", entityCountry: "IN" },
      { key: "processing_history", mandatory: false },
    ],
    fees: [
      { product: "off_ramp", currency: "AED", percentBps: 60, fxSpreadBps: 35, summary: "0.60% + 35bps FX spread" },
    ],
    limits: [
      { product: "payout", currency: "USD", min: 250, max: 100000, monthly: 2000000, summary: "$250 min · $100k per payout · $2m monthly" },
    ],
    sources: [
      { url: `${D}/meridian/coverage`, title: "Meridian Pay — supported corridors", type: "official_docs" },
      { url: `${D}/meridian/kyb`, title: "Meridian Pay — KYB checklist", type: "help_center" },
      { url: `${D}/meridian/api`, title: "Meridian Pay — API reference", type: "api" },
    ],
    verifiedHoursAgo: 26,
  },
  {
    slug: "corvus-financial",
    name: "Corvus Financial",
    category: "Banking-as-a-service",
    description:
      "Demo provider. Virtual accounts, collections and card issuing for European and Gulf entities. Does not currently onboard entities incorporated in India.",
    headquarters: "NL",
    licensingSummary: "EMI licence (demo) covering EEA; UAE coverage via partner bank.",
    hasApi: true,
    hasSandbox: true,
    hasWebhooks: true,
    sdkLanguages: ["TypeScript", "Java"],
    advertisedSettlement: "Instant within network, T+1 external",
    onboardingDays: 21,
    products: [
      { product: "virtual_account", name: "Virtual accounts", description: "Named IBANs in EUR, GBP, AED." },
      { product: "card_issuing", name: "Card issuing", description: "Virtual and physical commercial cards." },
      { product: "payout", name: "Payouts", description: "SEPA, Faster Payments and AED local rails." },
    ],
    entity: { supported: ["NL", "DE", "FR", "GB", "AE"], partial: [], unsupported: ["IN", "NG", "TR"] },
    customerTypes: ["business"],
    assets: ["USDC", "EURC"],
    networks: ["ethereum", "base"],
    payouts: [
      { country: "AE", currencies: ["AED"], methods: ["bank_transfer_local"] },
      { country: "DE", currencies: ["EUR"], methods: ["sepa"] },
      { country: "FR", currencies: ["EUR"], methods: ["sepa"] },
      { country: "GB", currencies: ["GBP"], methods: ["faster_payments"] },
    ],
    requirements: [
      { key: "company_registration" },
      { key: "director_identity" },
      { key: "ubo_disclosure" },
      { key: "business_address_proof" },
      { key: "licence_disclosure", mandatory: false },
      { key: "website_review" },
    ],
    fees: [
      { product: "virtual_account", currency: "EUR", fixed: 25, fixedCurrency: "EUR", summary: "€25 per named account per month" },
    ],
    limits: [
      { product: "payout", currency: "EUR", min: 1, max: 500000, summary: "€1 min · €500k per payout" },
    ],
    sources: [
      { url: `${D}/corvus/eligibility`, title: "Corvus Financial — entity eligibility", type: "official_docs" },
      { url: `${D}/corvus/products`, title: "Corvus Financial — product overview", type: "official_docs" },
    ],
    verifiedHoursAgo: 6,
  },
  {
    slug: "atlas-ramp",
    name: "Atlas Ramp",
    category: "On/off-ramp",
    description:
      "Demo provider. Consumer and business ramps with broad network coverage and a self-serve sandbox.",
    headquarters: "US",
    licensingSummary: "US MSB registration (demo) plus state licences; EU coverage via partner.",
    hasApi: true,
    hasSandbox: true,
    hasWebhooks: true,
    sdkLanguages: ["TypeScript", "Python", "Ruby"],
    advertisedSettlement: "Minutes for on-ramp, T+1 for off-ramp",
    onboardingDays: 5,
    products: [
      { product: "on_ramp", name: "On-ramp", description: "Card and bank funding into stablecoins." },
      { product: "off_ramp", name: "Off-ramp", description: "Stablecoin to bank account." },
    ],
    entity: { supported: ["US", "GB", "SG", "AE", "IN", "BR", "MX"], partial: [], unsupported: [] },
    customerTypes: ["business", "individual"],
    assets: ["USDC", "USDT", "PYUSD"],
    networks: ["ethereum", "base", "polygon", "solana", "arbitrum"],
    payouts: [
      { country: "US", currencies: ["USD"], methods: ["ach", "wire"] },
      { country: "BR", currencies: ["BRL"], methods: ["bank_transfer_local"] },
      { country: "MX", currencies: ["USD"], methods: ["bank_transfer_local"] },
      { country: "GB", currencies: ["GBP"], methods: ["faster_payments"] },
      { country: "AE", currencies: ["AED"], methods: ["bank_transfer_local"], availability: "partial", note: "AED payouts are in limited release; corporate accounts are reviewed case by case." },
    ],
    requirements: [
      { key: "company_registration" },
      { key: "director_identity" },
      { key: "sanctions_screening" },
      { key: "director_selfie" },
    ],
    fees: [
      { product: "on_ramp", currency: "USD", percentBps: 90, summary: "0.90% on card-funded on-ramp" },
      { product: "off_ramp", currency: "USD", percentBps: 35, summary: "0.35% on off-ramp" },
    ],
    limits: [
      { product: "on_ramp", currency: "USD", min: 20, max: 50000, monthly: 1000000, summary: "$20 min · $50k per order · $1m monthly" },
    ],
    sources: [
      { url: `${D}/atlas/docs`, title: "Atlas Ramp — documentation", type: "official_docs" },
      { url: `${D}/atlas/limits`, title: "Atlas Ramp — limits", type: "official_docs" },
      { url: `${D}/atlas/status`, title: "Atlas Ramp — status page", type: "status_page" },
    ],
    verifiedHoursAgo: 3,
  },
  {
    slug: "kestrel-payments",
    name: "Kestrel Payments",
    category: "Payouts",
    description:
      "Demo provider. Asia-Pacific payout specialist with Indian entity onboarding and INR/SGD local rails.",
    headquarters: "SG",
    licensingSummary: "MAS major payment institution (demo).",
    hasApi: true,
    hasSandbox: false,
    hasWebhooks: true,
    sdkLanguages: ["TypeScript"],
    advertisedSettlement: "Within 2 hours on APAC corridors",
    onboardingDays: 11,
    products: [
      { product: "payout", name: "Payouts", description: "Local payouts across APAC." },
      { product: "off_ramp", name: "Off-ramp", description: "USDC/USDT into local currency." },
    ],
    entity: { supported: ["SG", "IN", "HK", "AU", "PH", "ID"], partial: [], unsupported: ["NG"] },
    customerTypes: ["business"],
    assets: ["USDC", "USDT"],
    networks: ["ethereum", "polygon", "tron", "solana"],
    payouts: [
      { country: "IN", currencies: ["INR"], methods: ["bank_transfer_local"] },
      { country: "SG", currencies: ["SGD"], methods: ["bank_transfer_local"] },
      { country: "PH", currencies: ["USD"], methods: ["bank_transfer_local"] },
      { country: "ID", currencies: ["USD"], methods: ["bank_transfer_local"] },
      { country: "AE", currencies: ["AED"], methods: ["bank_transfer_swift"], availability: "partial", note: "AED is reachable over SWIFT only; local AED rails are not supported." },
    ],
    requirements: [
      { key: "company_registration" },
      { key: "director_identity" },
      { key: "ubo_disclosure" },
      { key: "source_of_funds" },
      { key: "processing_history" },
    ],
    fees: [
      { product: "payout", currency: "INR", percentBps: 40, fxSpreadBps: 45, summary: "0.40% + 45bps FX on INR" },
    ],
    limits: [
      { product: "payout", currency: "USD", min: 50, max: 75000, summary: "$50 min · $75k per payout" },
    ],
    sources: [
      { url: `${D}/kestrel/coverage`, title: "Kestrel Payments — corridor coverage", type: "official_docs" },
      { url: `${D}/kestrel/kyb`, title: "Kestrel Payments — onboarding", type: "help_center" },
    ],
    verifiedHoursAgo: 30,
  },
  {
    slug: "verdant-rails",
    name: "Verdant Rails",
    category: "Stablecoin infrastructure",
    description:
      "Demo provider. Wallet and settlement infrastructure with treasury tooling; payouts delivered through partner networks.",
    headquarters: "US",
    licensingSummary: "Partner-led licensing; no direct payout licence (demo).",
    hasApi: true,
    hasSandbox: true,
    hasWebhooks: false,
    sdkLanguages: ["TypeScript", "Python"],
    advertisedSettlement: "Network settlement only",
    onboardingDays: 7,
    products: [
      { product: "wallet", name: "Wallet infrastructure", description: "Programmable custodial wallets." },
      { product: "treasury", name: "Treasury", description: "Stablecoin treasury operations and sweeps." },
    ],
    entity: { supported: ["US", "SG", "AE", "GB", "IN"], partial: [], unsupported: [] },
    customerTypes: ["business"],
    assets: ["USDC", "USDT", "EURC", "PYUSD"],
    networks: ["ethereum", "base", "polygon", "arbitrum", "solana", "tron"],
    payouts: [],
    requirements: [
      { key: "company_registration" },
      { key: "director_identity" },
      { key: "sanctions_screening" },
    ],
    fees: [
      { product: "wallet", currency: "USD", percentBps: 10, summary: "0.10% on wallet transfer volume" },
    ],
    limits: [
      { product: "treasury", currency: "USD", min: 1, summary: "$1 min · no published maximum" },
    ],
    sources: [
      { url: `${D}/verdant/docs`, title: "Verdant Rails — developer documentation", type: "official_docs" },
    ],
    verifiedHoursAgo: 50,
  },
  {
    slug: "sablefin",
    name: "Sablefin",
    category: "Card issuing",
    description:
      "Demo provider. Commercial card programmes for Gulf and European entities, funded from stablecoin balances.",
    headquarters: "AE",
    licensingSummary: "Card programme run under a demo sponsor bank in AE; BIN sponsorship in EEA.",
    hasApi: true,
    hasSandbox: true,
    hasWebhooks: true,
    sdkLanguages: ["TypeScript"],
    advertisedSettlement: "Authorisation instant; settlement T+2",
    onboardingDays: 25,
    products: [
      { product: "card_issuing", name: "Card issuing", description: "Virtual and physical commercial cards." },
      { product: "card_funding", name: "Stablecoin card funding", description: "USDC balance funds card spend." },
    ],
    entity: { supported: ["AE", "SA", "GB", "DE"], partial: ["IN"], unsupported: [] },
    customerTypes: ["business"],
    assets: ["USDC"],
    networks: ["ethereum", "base", "polygon"],
    payouts: [{ country: "AE", currencies: ["AED"], methods: ["card"] }],
    requirements: [
      { key: "company_registration" },
      { key: "director_identity" },
      { key: "ubo_disclosure" },
      { key: "business_address_proof" },
      { key: "licence_disclosure" },
      { key: "website_review" },
      { key: "director_selfie", note: "Required for entities outside the GCC.", entityCountry: "IN" },
    ],
    fees: [
      { product: "card_issuing", currency: "AED", fixed: 15, fixedCurrency: "AED", summary: "AED 15 per issued card per month" },
    ],
    limits: [
      { product: "card_funding", currency: "USD", max: 100000, monthly: 1500000, summary: "$100k per load · $1.5m monthly" },
    ],
    sources: [
      { url: `${D}/sablefin/programme`, title: "Sablefin — card programme overview", type: "official_docs" },
      { url: `${D}/sablefin/eligibility`, title: "Sablefin — eligibility", type: "official_docs" },
    ],
    verifiedHoursAgo: 12,
  },
  {
    slug: "halcyon-clearing",
    name: "Halcyon Clearing",
    category: "Settlement",
    description:
      "Demo provider. Institutional settlement and FX with SWIFT reach; higher minimums, slower onboarding.",
    headquarters: "CH",
    licensingSummary: "Institutional settlement entity (demo).",
    hasApi: true,
    hasSandbox: false,
    hasWebhooks: false,
    sdkLanguages: [],
    advertisedSettlement: "T+1 for major corridors",
    onboardingDays: 45,
    products: [
      { product: "payout", name: "Institutional payouts", description: "High-value SWIFT payouts." },
      { product: "off_ramp", name: "Off-ramp", description: "Institutional stablecoin conversion." },
    ],
    entity: { supported: ["GB", "DE", "NL", "AE", "SG", "US"], partial: [], unsupported: ["IN", "NG", "PH"] },
    customerTypes: ["business"],
    assets: ["USDC", "USDT", "EURC"],
    networks: ["ethereum"],
    payouts: [
      { country: "AE", currencies: ["AED", "USD"], methods: ["bank_transfer_swift"] },
      { country: "DE", currencies: ["EUR"], methods: ["sepa", "bank_transfer_swift"] },
      { country: "US", currencies: ["USD"], methods: ["wire"] },
    ],
    requirements: [
      { key: "company_registration" },
      { key: "ubo_disclosure" },
      { key: "source_of_funds" },
      { key: "processing_history" },
      { key: "licence_disclosure" },
      { key: "bank_statement" },
    ],
    fees: [
      { product: "payout", currency: "USD", fixed: 25, fixedCurrency: "USD", fxSpreadBps: 15, summary: "$25 per payout + 15bps FX" },
    ],
    limits: [
      { product: "payout", currency: "USD", min: 25000, summary: "$25,000 minimum per instruction" },
    ],
    sources: [
      { url: `${D}/halcyon/terms`, title: "Halcyon Clearing — client terms", type: "terms" },
      { url: `${D}/halcyon/coverage`, title: "Halcyon Clearing — coverage", type: "official_docs" },
    ],
    verifiedHoursAgo: 96,
  },
  {
    slug: "orbita-money",
    name: "Orbita Money",
    category: "Remittances",
    description:
      "Demo provider. Consumer-first remittance network; business onboarding is limited to a small number of jurisdictions.",
    headquarters: "GB",
    licensingSummary: "Consumer remittance licences (demo) across GB, EEA and PH.",
    hasApi: true,
    hasSandbox: true,
    hasWebhooks: true,
    sdkLanguages: ["TypeScript", "Python"],
    advertisedSettlement: "Under 30 minutes",
    onboardingDays: 6,
    products: [
      { product: "payout", name: "Payouts", description: "Consumer payouts including cash pickup." },
      { product: "off_ramp", name: "Off-ramp", description: "Stablecoin to local currency." },
    ],
    entity: { supported: ["GB", "PH"], partial: [], unsupported: ["IN", "AE", "US"] },
    customerTypes: ["individual", "business"],
    assets: ["USDT", "USDC"],
    networks: ["tron", "polygon", "solana"],
    payouts: [
      { country: "PH", currencies: ["USD"], methods: ["bank_transfer_local", "cash_pickup"] },
      { country: "NG", currencies: ["NGN"], methods: ["bank_transfer_local"] },
      { country: "KE", currencies: ["USD"], methods: ["wallet_transfer"] },
      { country: "IN", currencies: ["INR"], methods: ["bank_transfer_local"] },
    ],
    requirements: [
      { key: "company_registration" },
      { key: "director_identity" },
      { key: "director_selfie" },
    ],
    fees: [
      { product: "payout", currency: "INR", percentBps: 55, fxSpreadBps: 60, summary: "0.55% + 60bps FX on INR" },
    ],
    limits: [
      { product: "payout", currency: "USD", min: 10, max: 5000, monthly: 50000, summary: "$10 min · $5k per payout · $50k monthly" },
    ],
    sources: [
      { url: `${D}/orbita/business`, title: "Orbita Money — business accounts", type: "help_center" },
      { url: `${D}/orbita/coverage`, title: "Orbita Money — where we send", type: "official_docs" },
    ],
    verifiedHoursAgo: 40,
  },
  {
    slug: "ironwood-settlement",
    name: "Ironwood Settlement",
    category: "Payments infrastructure",
    description:
      "Demo provider. Gulf-focused settlement with local AED rails and business onboarding across the GCC and South Asia.",
    headquarters: "AE",
    licensingSummary: "ADGM-registered (demo) with local bank partnership for AED settlement.",
    hasApi: true,
    hasSandbox: true,
    hasWebhooks: true,
    sdkLanguages: ["TypeScript", "Python"],
    advertisedSettlement: "AED payouts within 4 hours",
    onboardingDays: 12,
    products: [
      { product: "off_ramp", name: "Off-ramp", description: "USDC settlement into AED and USD." },
      { product: "payout", name: "Local payouts", description: "AED local transfers and SAR via partner." },
      { product: "virtual_account", name: "Virtual accounts", description: "AED and USD collection accounts." },
    ],
    entity: { supported: ["AE", "SA", "IN", "SG", "GB"], partial: [], unsupported: [] },
    customerTypes: ["business"],
    assets: ["USDC", "USDT"],
    networks: ["ethereum", "base", "arbitrum", "tron"],
    payouts: [
      { country: "AE", currencies: ["AED", "USD"], methods: ["bank_transfer_local", "bank_transfer_swift"] },
      { country: "SA", currencies: ["USD"], methods: ["bank_transfer_swift"] },
      { country: "IN", currencies: ["INR"], methods: ["bank_transfer_local"], availability: "partial", note: "INR payouts supported for goods and services invoices only." },
    ],
    requirements: [
      { key: "company_registration" },
      { key: "director_identity" },
      { key: "ubo_disclosure" },
      { key: "business_address_proof" },
      { key: "sanctions_screening" },
      { key: "source_of_funds" },
      { key: "website_review", mandatory: false },
    ],
    fees: [
      { product: "off_ramp", currency: "AED", percentBps: 38, fxSpreadBps: 20, summary: "0.38% + 20bps FX spread on AED" },
      { product: "virtual_account", currency: "AED", fixed: 0, fixedCurrency: "AED", summary: "No monthly fee on AED collection accounts" },
    ],
    limits: [
      { product: "off_ramp", currency: "USD", min: 500, max: 500000, monthly: 10000000, summary: "$500 min · $500k per payout · $10m monthly" },
    ],
    sources: [
      { url: `${D}/ironwood/coverage`, title: "Ironwood Settlement — coverage and corridors", type: "official_docs" },
      { url: `${D}/ironwood/onboarding`, title: "Ironwood Settlement — onboarding requirements", type: "official_docs" },
      { url: `${D}/ironwood/pricing`, title: "Ironwood Settlement — pricing", type: "pricing" },
      { url: `${D}/ironwood/api`, title: "Ironwood Settlement — API reference", type: "api" },
    ],
    verifiedHoursAgo: 1,
  },
  {
    slug: "cobalt-ramp",
    name: "Cobalt Ramp",
    category: "On/off-ramp",
    description:
      "Demo provider. Africa-focused ramps with NGN and KES coverage and business onboarding in Nigeria and Kenya.",
    headquarters: "NG",
    licensingSummary: "Local licences in NG and KE (demo).",
    hasApi: true,
    hasSandbox: true,
    hasWebhooks: true,
    sdkLanguages: ["TypeScript", "Python"],
    advertisedSettlement: "Under 15 minutes on NGN",
    onboardingDays: 8,
    products: [
      { product: "on_ramp", name: "On-ramp", description: "NGN and KES into stablecoins." },
      { product: "off_ramp", name: "Off-ramp", description: "Stablecoins into local bank accounts." },
      { product: "collection", name: "Collections", description: "Local collections in NGN." },
    ],
    entity: { supported: ["NG", "KE", "ZA", "GB"], partial: ["IN"], unsupported: [] },
    customerTypes: ["business", "individual"],
    assets: ["USDT", "USDC"],
    networks: ["tron", "polygon", "solana", "base"],
    payouts: [
      { country: "NG", currencies: ["NGN"], methods: ["bank_transfer_local"] },
      { country: "KE", currencies: ["USD"], methods: ["wallet_transfer", "bank_transfer_local"] },
      { country: "ZA", currencies: ["USD"], methods: ["bank_transfer_local"] },
    ],
    requirements: [
      { key: "company_registration" },
      { key: "director_identity" },
      { key: "sanctions_screening" },
      { key: "bank_statement" },
    ],
    fees: [
      { product: "off_ramp", currency: "NGN", percentBps: 75, fxSpreadBps: 90, summary: "0.75% + 90bps FX on NGN" },
    ],
    limits: [
      { product: "off_ramp", currency: "USD", min: 25, max: 30000, monthly: 400000, summary: "$25 min · $30k per payout · $400k monthly" },
    ],
    sources: [
      { url: `${D}/cobalt/docs`, title: "Cobalt Ramp — documentation", type: "official_docs" },
      { url: `${D}/cobalt/limits`, title: "Cobalt Ramp — limits and fees", type: "pricing" },
    ],
    verifiedHoursAgo: 18,
  },
  {
    slug: "lyra-cards",
    name: "Lyra Cards",
    category: "Card issuing",
    description:
      "Demo provider. Virtual card issuing for consumer and business programmes in Europe and APAC.",
    headquarters: "SG",
    licensingSummary: "Programme manager under demo BIN sponsors in SG and EEA.",
    hasApi: true,
    hasSandbox: true,
    hasWebhooks: true,
    sdkLanguages: ["TypeScript"],
    advertisedSettlement: "Card settlement T+2",
    onboardingDays: 18,
    products: [
      { product: "card_issuing", name: "Virtual cards", description: "Instant virtual card issuance." },
      { product: "card_funding", name: "Card funding", description: "Fiat and stablecoin funding." },
    ],
    entity: { supported: ["SG", "HK", "AU", "DE", "NL"], partial: [], unsupported: ["IN", "AE"] },
    customerTypes: ["business", "individual"],
    assets: ["USDC"],
    networks: ["ethereum", "polygon"],
    payouts: [],
    requirements: [
      { key: "company_registration" },
      { key: "director_identity" },
      { key: "ubo_disclosure" },
      { key: "website_review" },
    ],
    fees: [
      { product: "card_issuing", currency: "SGD", fixed: 2, fixedCurrency: "SGD", summary: "S$2 per virtual card" },
    ],
    limits: [
      { product: "card_funding", currency: "USD", max: 25000, summary: "$25k per funding instruction" },
    ],
    sources: [
      { url: `${D}/lyra/docs`, title: "Lyra Cards — issuing documentation", type: "official_docs" },
    ],
    verifiedHoursAgo: 60,
  },
  {
    slug: "solstice-treasury",
    name: "Solstice Treasury",
    category: "Treasury",
    description:
      "Demo provider. Corporate stablecoin treasury, yield routing and multi-entity cash visibility.",
    headquarters: "US",
    licensingSummary: "Treasury software with partner custody (demo).",
    hasApi: true,
    hasSandbox: true,
    hasWebhooks: true,
    sdkLanguages: ["TypeScript", "Python"],
    advertisedSettlement: "Internal transfers instant",
    onboardingDays: 10,
    products: [
      { product: "treasury", name: "Treasury", description: "Balance management across entities." },
      { product: "wallet", name: "Wallets", description: "Custodial wallets per entity." },
    ],
    entity: { supported: ["US", "GB", "SG", "AE", "IN", "DE"], partial: [], unsupported: [] },
    customerTypes: ["business"],
    assets: ["USDC", "USDT", "EURC"],
    networks: ["ethereum", "base", "arbitrum", "solana"],
    payouts: [],
    requirements: [
      { key: "company_registration" },
      { key: "director_identity" },
      { key: "ubo_disclosure" },
      { key: "source_of_funds" },
    ],
    fees: [
      { product: "treasury", currency: "USD", percentBps: 5, summary: "5bps on average balance" },
    ],
    limits: [
      { product: "treasury", currency: "USD", min: 100000, summary: "$100k minimum balance" },
    ],
    sources: [
      { url: `${D}/solstice/docs`, title: "Solstice Treasury — product documentation", type: "official_docs" },
    ],
    verifiedHoursAgo: 72,
  },
  {
    slug: "tessellate-payments",
    name: "Tessellate Payments",
    category: "Collections",
    description:
      "Demo provider. Local collections and reconciliation across LATAM and Europe with stablecoin settlement.",
    headquarters: "BR",
    licensingSummary: "Local payment institution registrations (demo) in BR and MX.",
    hasApi: true,
    hasSandbox: true,
    hasWebhooks: true,
    sdkLanguages: ["TypeScript", "Python"],
    advertisedSettlement: "Collections settle same day",
    onboardingDays: 16,
    products: [
      { product: "collection", name: "Local collections", description: "PIX and local bank collections." },
      { product: "off_ramp", name: "Off-ramp", description: "Stablecoin settlement of collected balances." },
      { product: "virtual_account", name: "Virtual accounts", description: "BRL and MXN collection accounts." },
    ],
    entity: { supported: ["BR", "MX", "US", "DE", "GB"], partial: [], unsupported: ["IN", "NG"] },
    customerTypes: ["business"],
    assets: ["USDC", "USDT"],
    networks: ["ethereum", "polygon", "solana"],
    payouts: [
      { country: "BR", currencies: ["BRL"], methods: ["bank_transfer_local"] },
      { country: "MX", currencies: ["USD"], methods: ["bank_transfer_local"] },
      { country: "DE", currencies: ["EUR"], methods: ["sepa"] },
    ],
    requirements: [
      { key: "company_registration" },
      { key: "director_identity" },
      { key: "ubo_disclosure" },
      { key: "processing_history" },
      { key: "webhook_endpoint" },
    ],
    fees: [
      { product: "collection", currency: "BRL", percentBps: 110, summary: "1.10% on local collections" },
    ],
    limits: [
      { product: "collection", currency: "USD", max: 200000, summary: "$200k per collection batch" },
    ],
    sources: [
      { url: `${D}/tessellate/docs`, title: "Tessellate Payments — documentation", type: "official_docs" },
      { url: `${D}/tessellate/pricing`, title: "Tessellate Payments — pricing", type: "pricing" },
    ],
    verifiedHoursAgo: 34,
  },
  {
    slug: "marlin-accounts",
    name: "Marlin Accounts",
    category: "Virtual accounts",
    description:
      "Demo provider. Multi-currency named virtual accounts for businesses, with limited published payout coverage.",
    headquarters: "GB",
    licensingSummary: "Account issuance through demo partner banks in GB and EEA.",
    hasApi: true,
    hasSandbox: false,
    hasWebhooks: true,
    sdkLanguages: ["TypeScript"],
    advertisedSettlement: "Not published",
    onboardingDays: 20,
    products: [
      { product: "virtual_account", name: "Named virtual accounts", description: "GBP, EUR, USD, AED accounts." },
      { product: "collection", name: "Collections", description: "Inbound collections into named accounts." },
    ],
    entity: { supported: ["GB", "DE", "NL", "SG"], partial: ["AE", "IN"], unsupported: [] },
    customerTypes: ["business"],
    assets: ["USDC"],
    networks: ["ethereum"],
    payouts: [
      { country: "GB", currencies: ["GBP"], methods: ["faster_payments"] },
      { country: "DE", currencies: ["EUR"], methods: ["sepa"] },
    ],
    requirements: [
      { key: "company_registration" },
      { key: "director_identity" },
      { key: "ubo_disclosure" },
      { key: "business_address_proof" },
      { key: "bank_statement" },
    ],
    fees: [
      { product: "virtual_account", currency: "GBP", fixed: 15, fixedCurrency: "GBP", summary: "£15 per account per month" },
    ],
    limits: [
      { product: "collection", currency: "GBP", max: 1000000, summary: "£1m per inbound transfer" },
    ],
    sources: [
      { url: `${D}/marlin/accounts`, title: "Marlin Accounts — product page", type: "official_docs" },
    ],
    verifiedHoursAgo: 200,
  },
];

/**
 * Historical change events. `provider` is a slug.
 * `hoursAgo` places them across the last two weeks so the change feed,
 * the timeline on provider profiles and the monitoring digest all have data.
 */
export const changeEvents = [
  {
    provider: "corvus-financial",
    kind: "coverage_changed",
    field: "entity_country.IN.business",
    previousValue: "supported",
    currentValue: "unsupported",
    summary:
      "Corvus Financial removed Indian-incorporated businesses from its corporate onboarding list.",
    hoursAgo: 15 * 24,
    confidence: 0.97,
    reviewStatus: "approved",
    affects: { entityCountry: "IN", customerType: "business" },
  },
  {
    provider: "ironwood-settlement",
    kind: "product_launched",
    field: "product.virtual_account",
    previousValue: null,
    currentValue: "supported",
    summary: "Ironwood Settlement launched AED and USD collection accounts.",
    hoursAgo: 2,
    confidence: 0.95,
    reviewStatus: "approved",
    affects: { destinationCountry: "AE" },
  },
  {
    provider: "meridian-pay",
    kind: "requirement_changed",
    field: "requirement.bank_statement.IN",
    previousValue: "not required",
    currentValue: "required for IN entities",
    summary:
      "Meridian Pay now requires a three-month corporate bank statement from Indian-incorporated entities.",
    hoursAgo: 7,
    confidence: 0.93,
    reviewStatus: "approved",
    affects: { entityCountry: "IN" },
  },
  {
    provider: "atlas-ramp",
    kind: "coverage_changed",
    field: "payout.AE.AED",
    previousValue: "unsupported",
    currentValue: "partial",
    summary: "Atlas Ramp opened AED payouts in limited release for reviewed corporate accounts.",
    hoursAgo: 30,
    confidence: 0.88,
    reviewStatus: "approved",
    affects: { destinationCountry: "AE", destinationCurrency: "AED" },
  },
  {
    provider: "verdant-rails",
    kind: "api_changed",
    field: "api.webhooks",
    previousValue: "webhooks available",
    currentValue: "webhooks deprecated",
    summary: "Verdant Rails deprecated its webhook API in favour of polling endpoints.",
    hoursAgo: 26,
    confidence: 0.91,
    reviewStatus: "approved",
    affects: {},
  },
  {
    provider: "kestrel-payments",
    kind: "limit_changed",
    field: "limit.payout.max",
    previousValue: "50000",
    currentValue: "75000",
    summary: "Kestrel Payments raised its per-payout maximum from $50,000 to $75,000.",
    hoursAgo: 54,
    confidence: 0.9,
    reviewStatus: "approved",
    affects: {},
  },
  {
    provider: "cobalt-ramp",
    kind: "pricing_changed",
    field: "fee.off_ramp.NGN",
    previousValue: "0.60% + 70bps FX",
    currentValue: "0.75% + 90bps FX",
    summary: "Cobalt Ramp increased NGN off-ramp pricing.",
    hoursAgo: 80,
    confidence: 0.89,
    reviewStatus: "approved",
    affects: { destinationCountry: "NG", destinationCurrency: "NGN" },
  },
  {
    provider: "halcyon-clearing",
    kind: "service_degraded",
    field: "status.settlement",
    previousValue: "operational",
    currentValue: "degraded",
    summary: "Halcyon Clearing reported delayed SWIFT settlement on Gulf corridors.",
    hoursAgo: 9,
    confidence: 0.98,
    reviewStatus: "approved",
    affects: { destinationCountry: "AE" },
  },
  {
    provider: "lyra-cards",
    kind: "coverage_changed",
    field: "entity_country.AE.business",
    previousValue: "partial",
    currentValue: "unsupported",
    summary: "Lyra Cards stopped onboarding UAE-incorporated businesses to its issuing programme.",
    hoursAgo: 120,
    confidence: 0.86,
    reviewStatus: "approved",
    affects: { entityCountry: "AE" },
  },
  {
    provider: "northwind-rails",
    kind: "documentation_changed",
    field: "docs.onboarding",
    previousValue: "hash:9c1f",
    currentValue: "hash:2ab7",
    summary:
      "Northwind Rails rewrote its onboarding documentation; requirement wording changed but the underlying checklist did not.",
    hoursAgo: 46,
    confidence: 0.72,
    reviewStatus: "approved",
    affects: {},
  },
  {
    provider: "marlin-accounts",
    kind: "documentation_changed",
    field: "docs.coverage",
    previousValue: "hash:41aa",
    currentValue: "hash:77de",
    summary:
      "Marlin Accounts changed its product page; Railor could not determine whether AED coverage changed.",
    hoursAgo: 5,
    confidence: 0.44,
    reviewStatus: "pending",
    affects: { destinationCountry: "AE" },
  },
  {
    provider: "tessellate-payments",
    kind: "product_removed",
    field: "product.payout.MX",
    previousValue: "supported",
    currentValue: "unsupported",
    summary: "Tessellate Payments withdrew MXN payouts pending a partner change.",
    hoursAgo: 200,
    confidence: 0.9,
    reviewStatus: "approved",
    affects: { destinationCountry: "MX" },
  },
];

/** A pending, conflicting claim so the review queue and conflict UI have data. */
export const conflictExample = {
  provider: "marlin-accounts",
  field: "payout.AE.AED",
  sources: [
    { title: "Marlin Accounts — product page", claim: "AED payouts available", type: "official_docs" },
    { title: "Marlin Accounts — help centre", claim: "AED payouts not currently offered", type: "help_center" },
  ],
};
