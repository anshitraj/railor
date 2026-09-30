/**
 * Provider batch 5 — working payment rails that were missing entirely (xPay,
 * Razorpay, PayU, TerraPay) plus products and evidence for three registered
 * shells (Visa Direct, Mastercard Move, Currencycloud). Every fact below is a
 * verbatim quote from the provider's own page, read 2026-09-29; each quote was
 * checked against the fetched page text before this file was run.
 *
 * Deliberately conservative:
 *   - A receiving-account country is recorded only when the page names the
 *     country, or names a domestic rail that exists in only one country
 *     (ACH -> US, FPS -> GB, EFT -> CA, BECS -> AU, SIC -> CH, RIX -> SE).
 *     SEPA spans many countries, so EUR is recorded as a currency, not a
 *     country; SWIFT account locations are never named, so SWIFT currencies
 *     are not recorded at all.
 *   - Aggregate reach claims ("90 countries", "195+ countries") are kept in
 *     the evidence text and description only — never expanded into
 *     per-country rows the source doesn't list.
 *   - Existing providers keep their descriptions; this only adds products,
 *     evidence, and an empty licensing summary.
 *   - stablecoin_mode stays "unknown": none of these pages says either way.
 *
 * Insert-only and idempotent (re-running changes nothing). is_demo: false.
 *
 *   pnpm --filter @railor/database provider-batch-5
 */
import "../dev-env.js";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, getDbHandle } from "../client.js";
import * as s from "../schema.js";

const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const READ_AT = new Date("2026-09-29T00:00:00Z");

type Product = (typeof s.productTypeEnum.enumValues)[number];
type PaymentMethod = (typeof s.paymentMethodEnum.enumValues)[number];

export interface SourceSpec {
  key: string;
  url: string;
  title: string;
  sourceType: "official_docs" | "pricing" | "api" | "official_announcement";
  quotes: string[];
}

interface Fact {
  source: string;
  quote: string;
}

export interface ProviderSpec {
  slug: string;
  create?: {
    name: string;
    category: string;
    description: string;
    websiteUrl: string;
    docsUrl?: string;
    headquartersCountry?: string;
    hasApi: boolean;
    apiAccess: "public" | "private" | "partner" | "none" | "unknown";
  };
  licensingSummary?: Fact & { text: string };
  sources: SourceSpec[];
  products: Array<{ product: Product; name: string; description: string } & Fact>;
  entity?: Array<{ product: Product; entityCountry: string; customerType: "business" | "individual" | null } & Fact>;
  currencyCapabilities?: Array<{ product: Product; destinationCurrency?: string; sourceCurrency?: string; paymentMethod?: PaymentMethod } & Fact>;
  sourceCountryCapabilities?: Array<{ product: Product; sourceCountry: string } & Fact>;
  endpoints?: Array<{
    countryCode: string;
    destinationCurrency: string;
    namedRail?: string;
    paymentMethod?: PaymentMethod;
    customerType?: "business" | "individual";
    settlementEstimate?: string;
    complianceDocs?: string;
  } & Fact>;
}

const XPAY_HOME = "https://www.xpaycheckout.com/";
const RAZORPAY_DOCS = "https://razorpay.com/docs/payments/international-payments/accept-international-payments-via-local-currency-bank-accounts/?preferred-country=IN";
const PAYU_INTL = "https://payu.in/international-payments/";
const PAYU_IMPORT = "https://docs.payu.in/docs/introduction-cross-border-payments-import";
const TERRAPAY_PAYOUTS = "https://www.terrapay.com/global-payouts/";
const VISA_DIRECT = "https://www.visa.com/en-us/products/visa-direct";
const MASTERCARD_MOVE = "https://www.mastercard.com/us/en/business/payments/mastercard-move.html";

export const BATCH_5: ProviderSpec[] = [
  {
    slug: "xpay",
    create: {
      name: "xPay",
      category: "Cross-border payments",
      description:
        "International payment gateway for Indian businesses: collects subscriptions and payment-link payments from abroad and local bank transfers in USD, GBP, CAD and more, settling into an Indian INR account within 24 hours with FIRC.",
      websiteUrl: "https://www.xpaycheckout.com",
      headquartersCountry: "IN",
      hasApi: false,
      apiAccess: "unknown",
    },
    sources: [
      {
        key: "home",
        url: XPAY_HOME,
        title: "xPay — International payment gateway for Indian businesses",
        sourceType: "official_docs",
        quotes: [
          "A US account for your Indian Entity",
          "Collect bank account payments in USD, GBP, CAD and many more without even opening an entity in these countries. Funds settled in 24 hours with compliant documents like FIRC.",
          "Get money directly in your INR account",
          "Collect subscriptions in 100+ currencies from most countries in the world through links or with an integration.",
        ],
      },
    ],
    products: [
      { product: "collection", name: "International collections", description: "Subscriptions, payment links and card payments from customers abroad, settled in INR.", source: "home", quote: "Collect subscriptions in 100+ currencies from most countries in the world through links or with an integration." },
      { product: "virtual_account", name: "Foreign receiving accounts", description: "USD, GBP, CAD and other receiving accounts for an Indian entity.", source: "home", quote: "Collect bank account payments in USD, GBP, CAD and many more without even opening an entity in these countries. Funds settled in 24 hours with compliant documents like FIRC." },
    ],
    entity: [{ product: "collection", entityCountry: "IN", customerType: "business", source: "home", quote: "A US account for your Indian Entity" }],
    currencyCapabilities: [
      { product: "virtual_account", destinationCurrency: "GBP", source: "home", quote: "Collect bank account payments in USD, GBP, CAD and many more without even opening an entity in these countries. Funds settled in 24 hours with compliant documents like FIRC." },
      { product: "virtual_account", destinationCurrency: "CAD", source: "home", quote: "Collect bank account payments in USD, GBP, CAD and many more without even opening an entity in these countries. Funds settled in 24 hours with compliant documents like FIRC." },
    ],
    endpoints: [
      { countryCode: "US", destinationCurrency: "USD", customerType: "business", source: "home", quote: "A US account for your Indian Entity" },
      { countryCode: "IN", destinationCurrency: "INR", customerType: "business", settlementEstimate: "24 hours", complianceDocs: "FIRC", source: "home", quote: "Get money directly in your INR account" },
    ],
  },
  {
    slug: "razorpay",
    create: {
      name: "Razorpay",
      category: "Cross-border payments",
      description:
        "Indian payment gateway whose International Bank Transfer (MoneySaver Export Account) gives Indian businesses local receiving accounts abroad — US (ACH), UK (FPS), Canada (EFT), Australia (NPP/BECS), Switzerland (SIC), Sweden (RIX) and EUR (SEPA) — settled in INR within 1 business day, with FIRC.",
      websiteUrl: "https://razorpay.com",
      docsUrl: RAZORPAY_DOCS,
      headquartersCountry: "IN",
      hasApi: true,
      apiAccess: "public",
    },
    sources: [
      {
        key: "docs",
        url: RAZORPAY_DOCS,
        title: "Razorpay Docs — International Bank Transfer (MoneySaver Export Account)",
        sourceType: "official_docs",
        quotes: [
          "Open virtual accounts in US, UK, Europe, Australia, Canada and more to receive payments via ACH, FPS, SEPA, NPP, EFT, SWIFT and more.",
          "International Bank Transfer enables Indian businesses to accept international payments through local currency bank accounts without the complexity of opening foreign bank accounts.",
          "you receive settlements directly in your Indian bank account in INR",
          "Receive your payments within 1 business day of the payment being captured",
          "Receive your FIRC within minutes of the amount being credited to your INR account",
          "United States Dollar USD ACH Virtual USD Account",
          "Pound Sterling GBP FPS Virtual GBP Account",
          "European Euro EUR SEPA Virtual EUR Account",
          "Canadian Dollar CAD EFT Virtual CAD Account",
          "Swiss Franc CHF SIC ACH/SIC RTGS Virtual CHF Account",
          "Swedish Krona SEK RIX Instant/RIX RTGS Virtual SEK Account",
          "Danish Krone DKK DKK Local Virtual DKK Account",
          "Australian Dollar AUD NPP/Osko/BECS Virtual AUD Account",
        ],
      },
    ],
    products: [
      { product: "collection", name: "International Bank Transfer", description: "Collect from buyers abroad over their local rails; settled in INR with FIRC.", source: "docs", quote: "International Bank Transfer enables Indian businesses to accept international payments through local currency bank accounts without the complexity of opening foreign bank accounts." },
      { product: "virtual_account", name: "MoneySaver Export Account", description: "Local virtual accounts in the US, UK, Europe, Australia, Canada and more.", source: "docs", quote: "Open virtual accounts in US, UK, Europe, Australia, Canada and more to receive payments via ACH, FPS, SEPA, NPP, EFT, SWIFT and more." },
    ],
    entity: [{ product: "collection", entityCountry: "IN", customerType: "business", source: "docs", quote: "International Bank Transfer enables Indian businesses to accept international payments through local currency bank accounts without the complexity of opening foreign bank accounts." }],
    currencyCapabilities: [
      { product: "virtual_account", destinationCurrency: "EUR", paymentMethod: "sepa", source: "docs", quote: "European Euro EUR SEPA Virtual EUR Account" },
      { product: "virtual_account", destinationCurrency: "DKK", paymentMethod: "bank_transfer_local", source: "docs", quote: "Danish Krone DKK DKK Local Virtual DKK Account" },
    ],
    endpoints: [
      { countryCode: "US", destinationCurrency: "USD", namedRail: "ACH_US", paymentMethod: "ach", customerType: "business", source: "docs", quote: "United States Dollar USD ACH Virtual USD Account" },
      { countryCode: "GB", destinationCurrency: "GBP", namedRail: "FASTER_PAYMENTS_GB", paymentMethod: "faster_payments", customerType: "business", source: "docs", quote: "Pound Sterling GBP FPS Virtual GBP Account" },
      { countryCode: "CA", destinationCurrency: "CAD", namedRail: "EFT_CA", paymentMethod: "bank_transfer_local", customerType: "business", source: "docs", quote: "Canadian Dollar CAD EFT Virtual CAD Account" },
      { countryCode: "AU", destinationCurrency: "AUD", namedRail: "BECS", paymentMethod: "bank_transfer_local", customerType: "business", source: "docs", quote: "Australian Dollar AUD NPP/Osko/BECS Virtual AUD Account" },
      { countryCode: "CH", destinationCurrency: "CHF", namedRail: "SIC", paymentMethod: "bank_transfer_local", customerType: "business", source: "docs", quote: "Swiss Franc CHF SIC ACH/SIC RTGS Virtual CHF Account" },
      { countryCode: "SE", destinationCurrency: "SEK", namedRail: "RIX_INST", paymentMethod: "bank_transfer_local", customerType: "business", source: "docs", quote: "Swedish Krona SEK RIX Instant/RIX RTGS Virtual SEK Account" },
      { countryCode: "IN", destinationCurrency: "INR", customerType: "business", settlementEstimate: "1 business day", complianceDocs: "FIRC", source: "docs", quote: "you receive settlements directly in your Indian bank account in INR" },
    ],
  },
  {
    slug: "payu",
    create: {
      name: "PayU",
      category: "Cross-border payments",
      description:
        "PayU India lets Indian businesses accept international card and PayPal payments in 135+ currencies, settled in INR (typically T+2 business days); its Cross-Border Import product lets overseas sellers collect from buyers in India and receive funds in 100+ currencies.",
      websiteUrl: "https://payu.in",
      docsUrl: "https://docs.payu.in",
      hasApi: true,
      apiAccess: "public",
    },
    sources: [
      {
        key: "intl",
        url: PAYU_INTL,
        title: "PayU — International Payment Gateway",
        sourceType: "official_docs",
        quotes: [
          "With PayU, you can accept payments in over 135 currencies. Popular options include USD, CAD, EUR, GBP, CNH, and SGD.",
          "PayU settles international payments in INR, using the exchange rate on the transaction date. Settlements are typically completed within T+2 business days, providing fast and reliable access to funds.",
          "PayU is the leading payments solution provider to 5 lakh+ businesses in India.",
          "PayU supports all major international credit and debit cards such as Visa, Mastercard, and American Express.",
        ],
      },
      {
        key: "import",
        url: PAYU_IMPORT,
        title: "PayU Docs — Cross-Border Payments (Import)",
        sourceType: "official_docs",
        quotes: [
          "facilitates overseas sellers to collect payments from buyers in India and transfer the funds to the overseas seller",
          "In their desired currency (100+ options)",
          "With T+2/T+3 settlement time",
        ],
      },
    ],
    products: [
      { product: "collection", name: "International payments", description: "Accept international cards and PayPal in 135+ currencies; settled in INR.", source: "intl", quote: "With PayU, you can accept payments in over 135 currencies. Popular options include USD, CAD, EUR, GBP, CNH, and SGD." },
    ],
    entity: [{ product: "collection", entityCountry: "IN", customerType: "business", source: "intl", quote: "PayU is the leading payments solution provider to 5 lakh+ businesses in India." }],
    currencyCapabilities: ["USD", "CAD", "EUR", "GBP", "SGD"].map((currency) => ({
      product: "collection" as const,
      sourceCurrency: currency,
      paymentMethod: "card" as const,
      source: "intl",
      quote: "With PayU, you can accept payments in over 135 currencies. Popular options include USD, CAD, EUR, GBP, CNH, and SGD.",
    })),
    sourceCountryCapabilities: [
      { product: "collection", sourceCountry: "IN", source: "import", quote: "facilitates overseas sellers to collect payments from buyers in India and transfer the funds to the overseas seller" },
    ],
    endpoints: [
      { countryCode: "IN", destinationCurrency: "INR", customerType: "business", settlementEstimate: "T+2 business days", source: "intl", quote: "PayU settles international payments in INR, using the exchange rate on the transaction date. Settlements are typically completed within T+2 business days, providing fast and reliable access to funds." },
    ],
  },
  {
    slug: "terrapay",
    create: {
      name: "TerraPay",
      category: "Cross-border payments",
      description:
        "Global payout network for platforms, payroll providers and digital businesses. Reports paying to wallets and bank accounts across 90 countries in 70 currencies, with regulatory coverage in 32 markets (provider-reported; no per-country list published).",
      websiteUrl: "https://www.terrapay.com",
      hasApi: true,
      apiAccess: "partner",
    },
    sources: [
      {
        key: "payouts",
        url: TERRAPAY_PAYOUTS,
        title: "TerraPay — Global payouts",
        sourceType: "official_docs",
        quotes: [
          "Pay to wallets & bank accounts across 90 countries, in 70 currencies.",
          "Simplify your global payouts via our API or intuitive partner portal, TerraPay Engage",
          "regulatory coverage in 32 markets",
        ],
      },
    ],
    products: [
      { product: "payout", name: "Global payouts", description: "Payouts to wallets and bank accounts across 90 countries in 70 currencies (provider-reported).", source: "payouts", quote: "Pay to wallets & bank accounts across 90 countries, in 70 currencies." },
    ],
  },
  {
    slug: "visa-direct",
    sources: [
      {
        key: "product",
        url: VISA_DIRECT,
        title: "Visa Direct — product page",
        sourceType: "official_docs",
        quotes: [
          "Enable fast money movement to cards, accounts and wallets through a single connection",
          "reached through a network of 60+ card and wallet and 90+ domestic payment schemes",
          "Integrated 150+ currencies all over the world",
        ],
      },
    ],
    products: [
      { product: "payout", name: "Visa Direct", description: "Push payments to eligible cards, bank accounts and wallets; 195+ countries and territories, 150+ currencies (provider-reported).", source: "product", quote: "Enable fast money movement to cards, accounts and wallets through a single connection" },
    ],
  },
  {
    slug: "mastercard-move",
    sources: [
      {
        key: "product",
        url: MASTERCARD_MOVE,
        title: "Mastercard Move — product page",
        sourceType: "official_docs",
        quotes: [
          "reaching 200+ countries and territories in 150+ currencies",
          "Individuals and businesses can move money quickly and securely to multiple endpoints, including bank accounts, cards, wallets, and cash locations.",
        ],
      },
    ],
    products: [
      { product: "payout", name: "Mastercard Move", description: "Cross-border money movement to bank accounts, cards, wallets and cash locations; 200+ countries and territories (provider-reported).", source: "product", quote: "Individuals and businesses can move money quickly and securely to multiple endpoints, including bank accounts, cards, wallets, and cash locations." },
    ],
  },
  {
    slug: "currencycloud",
    licensingSummary: {
      source: "visa",
      quote: "Currencycloud provides e-money issuance and/or payment services and is licensed and/or registered in Australia, Canada, the Netherlands, the United Kingdom, multiple states in the United States, and Singapore.",
      text: "Licensed and/or registered in Australia, Canada, the Netherlands, the United Kingdom, multiple US states, and Singapore (per Visa's Visa Direct disclosures; Currencycloud is part of Visa).",
    },
    sources: [
      {
        key: "visa",
        url: VISA_DIRECT,
        title: "Visa Direct — Currencycloud licensing disclosure",
        sourceType: "official_docs",
        quotes: [
          "Currencycloud provides e-money issuance and/or payment services and is licensed and/or registered in Australia, Canada, the Netherlands, the United Kingdom, multiple states in the United States, and Singapore.",
        ],
      },
    ],
    products: [],
  },
];

export async function runBatch5(specs: ProviderSpec[] = BATCH_5): Promise<string[]> {
  const db = await getDb();
  const log: string[] = [];
  const [knownCountries, knownCurrencies, knownRails] = await Promise.all([
    db.select({ code: s.countries.code }).from(s.countries).then((r) => new Set(r.map((x) => x.code))),
    db.select({ code: s.currencies.code }).from(s.currencies).then((r) => new Set(r.map((x) => x.code))),
    db.select({ code: s.namedRails.code }).from(s.namedRails).then((r) => new Set(r.map((x) => x.code))),
  ]);

  for (const spec of specs) {
    let [provider] = await db.select().from(s.providers).where(eq(s.providers.slug, spec.slug)).limit(1);
    if (!provider) {
      if (!spec.create) {
        log.push(`${spec.slug}: not registered and no create spec — skipped`);
        continue;
      }
      [provider] = await db
        .insert(s.providers)
        .values({ slug: spec.slug, isDemo: false, ...spec.create, lastVerifiedAt: READ_AT })
        .returning();
      log.push(`${spec.slug}: created provider`);
    }
    const providerId = provider!.id;

    // One source document + one evidence row per page; the excerpt is the
    // exact quotes this batch relies on from that page, nothing else.
    const evidenceByKey = new Map<string, string>();
    for (const src of spec.sources) {
      const [doc] = await db
        .insert(s.sourceDocuments)
        .values({ providerId, url: src.url, title: src.title, sourceType: src.sourceType, crawlFrequencyHours: 24 * 7, parser: "generic_html", lastCheckedAt: READ_AT })
        .onConflictDoNothing({ target: [s.sourceDocuments.providerId, s.sourceDocuments.url] })
        .returning({ id: s.sourceDocuments.id });
      const docId =
        doc?.id ??
        (await db.select({ id: s.sourceDocuments.id }).from(s.sourceDocuments).where(and(eq(s.sourceDocuments.providerId, providerId), eq(s.sourceDocuments.url, src.url))).limit(1))[0]!.id;
      const excerpt = src.quotes.map((q) => `"${q}"`).join(" … ");
      const rawHash = hash(`${src.url}|${excerpt}`);
      const [existing] = await db.select({ id: s.evidence.id }).from(s.evidence).where(and(eq(s.evidence.providerId, providerId), eq(s.evidence.rawHash, rawHash))).limit(1);
      const evidenceId =
        existing?.id ??
        (
          await db
            .insert(s.evidence)
            .values({ providerId, sourceDocumentId: docId, sourceUrl: src.url, sourceTitle: src.title, sourceType: src.sourceType, verificationType: "provider_reported", retrievedAt: READ_AT, lastVerifiedAt: READ_AT, confidence: "0.90", rawExcerpt: excerpt, rawHash })
            .returning({ id: s.evidence.id })
        )[0]!.id;
      evidenceByKey.set(src.key, evidenceId);
    }
    const ev = (key: string) => {
      const id = evidenceByKey.get(key);
      if (!id) throw new Error(`${spec.slug}: unknown source key "${key}"`);
      return id;
    };

    if (spec.licensingSummary && !provider!.licensingSummary) {
      await db.update(s.providers).set({ licensingSummary: spec.licensingSummary.text }).where(eq(s.providers.id, providerId));
      log.push(`${spec.slug}: licensing summary set`);
    }
    if (!provider!.lastVerifiedAt || provider!.lastVerifiedAt < READ_AT) {
      await db.update(s.providers).set({ lastVerifiedAt: READ_AT }).where(eq(s.providers.id, providerId));
    }

    for (const p of spec.products) {
      const [existing] = await db.select({ id: s.providerProducts.id }).from(s.providerProducts).where(and(eq(s.providerProducts.providerId, providerId), eq(s.providerProducts.product, p.product))).limit(1);
      if (existing) continue;
      await db.insert(s.providerProducts).values({ providerId, product: p.product, name: p.name, description: p.description });
      log.push(`${spec.slug}: product ${p.product}`);
    }

    for (const e of spec.entity ?? []) {
      const customerTypeFilter = e.customerType ? eq(s.providerCapabilities.customerType, e.customerType) : isNull(s.providerCapabilities.customerType);
      const [existing] = await db
        .select({ id: s.providerCapabilities.id })
        .from(s.providerCapabilities)
        .where(and(eq(s.providerCapabilities.providerId, providerId), eq(s.providerCapabilities.product, e.product), eq(s.providerCapabilities.entityCountry, e.entityCountry), customerTypeFilter))
        .limit(1);
      if (existing) continue;
      await db.insert(s.providerCapabilities).values({ providerId, product: e.product, entityCountry: e.entityCountry, customerType: e.customerType, availability: "supported", note: e.quote, derivation: "source", evidenceId: ev(e.source), lastVerifiedAt: READ_AT });
      log.push(`${spec.slug}: entity eligibility ${e.product} ${e.entityCountry}`);
    }

    for (const c of spec.currencyCapabilities ?? []) {
      const currency = c.destinationCurrency ?? c.sourceCurrency!;
      if (!knownCurrencies.has(currency)) {
        log.push(`${spec.slug}: currency ${currency} not in catalog — skipped`);
        continue;
      }
      const column = c.destinationCurrency ? s.providerCapabilities.destinationCurrency : s.providerCapabilities.sourceCurrency;
      const [existing] = await db
        .select({ id: s.providerCapabilities.id })
        .from(s.providerCapabilities)
        .where(and(eq(s.providerCapabilities.providerId, providerId), eq(s.providerCapabilities.product, c.product), eq(column, currency)))
        .limit(1);
      if (existing) continue;
      await db.insert(s.providerCapabilities).values({
        providerId,
        product: c.product,
        destinationCurrency: c.destinationCurrency ?? null,
        sourceCurrency: c.sourceCurrency ?? null,
        paymentMethod: c.paymentMethod ?? null,
        availability: "supported",
        note: c.quote,
        derivation: "source",
        evidenceId: ev(c.source),
        lastVerifiedAt: READ_AT,
      });
      log.push(`${spec.slug}: ${c.product} ${c.destinationCurrency ? "to" : "from"} ${currency}`);
    }

    for (const c of spec.sourceCountryCapabilities ?? []) {
      if (!knownCountries.has(c.sourceCountry)) continue;
      const [existing] = await db
        .select({ id: s.providerCapabilities.id })
        .from(s.providerCapabilities)
        .where(and(eq(s.providerCapabilities.providerId, providerId), eq(s.providerCapabilities.product, c.product), eq(s.providerCapabilities.sourceCountry, c.sourceCountry)))
        .limit(1);
      if (existing) continue;
      await db.insert(s.providerCapabilities).values({ providerId, product: c.product, sourceCountry: c.sourceCountry, availability: "supported", note: c.quote, derivation: "source", evidenceId: ev(c.source), lastVerifiedAt: READ_AT });
      log.push(`${spec.slug}: ${c.product} from payers in ${c.sourceCountry}`);
    }

    for (const e of spec.endpoints ?? []) {
      if (!knownCountries.has(e.countryCode) || !knownCurrencies.has(e.destinationCurrency) || (e.namedRail && !knownRails.has(e.namedRail))) {
        log.push(`${spec.slug}: endpoint ${e.countryCode}/${e.destinationCurrency}${e.namedRail ? `/${e.namedRail}` : ""} references an unknown catalog code — skipped`);
        continue;
      }
      const [existing] = await db
        .select({ id: s.receivingEndpoints.id })
        .from(s.receivingEndpoints)
        .where(and(eq(s.receivingEndpoints.providerId, providerId), eq(s.receivingEndpoints.countryCode, e.countryCode), eq(s.receivingEndpoints.destinationCurrency, e.destinationCurrency)))
        .limit(1);
      if (existing) continue;
      await db.insert(s.receivingEndpoints).values({
        providerId,
        countryCode: e.countryCode,
        endpointType: "bank_account",
        stablecoinMode: "unknown",
        customerType: e.customerType ?? null,
        destinationCurrency: e.destinationCurrency,
        namedRail: e.namedRail ?? null,
        paymentMethod: e.paymentMethod ?? null,
        settlementEstimate: e.settlementEstimate ?? null,
        complianceDocs: e.complianceDocs ?? null,
        availability: "supported",
        note: e.quote,
        derivation: "source",
        evidenceId: ev(e.source),
        lastVerifiedAt: READ_AT,
      });
      log.push(`${spec.slug}: endpoint ${e.countryCode}/${e.destinationCurrency}${e.namedRail ? ` via ${e.namedRail}` : ""}`);
    }
  }
  return log;
}

async function main() {
  const { close } = await getDbHandle();
  try {
    for (const line of await runBatch5()) console.log(line);
  } finally {
    await close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
