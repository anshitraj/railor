/**
 * Railor relational schema.
 *
 * Design rules:
 *  - Domain facts live in columns with constraints. JSONB is for raw payloads only.
 *  - Every published claim points at an evidence row. Evidence is append-only.
 *  - Capability rows are dimensioned; NULL on a dimension means "any value".
 *  - Organization owns all customer data. Nothing hangs off a bare user id.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const now = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updated = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

export const availabilityEnum = pgEnum("availability", [
  "supported",
  "partial",
  "unsupported",
  "unknown",
]);

export const customerTypeEnum = pgEnum("customer_type", ["business", "individual"]);

export const productTypeEnum = pgEnum("product_type", [
  "on_ramp",
  "off_ramp",
  "payout",
  "collection",
  "virtual_account",
  "card_issuing",
  "card_funding",
  "wallet",
  "treasury",
  "kyc_kyb",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "bank_transfer_local",
  "bank_transfer_swift",
  "sepa",
  "faster_payments",
  "ach",
  "wire",
  "card",
  "wallet_transfer",
  "cash_pickup",
]);

/**
 * How a receiving endpoint relates to stablecoins — the question "Skydo vs
 * Xflow" actually turns on. Both are real Indian receivers; only one ever
 * touches a stablecoin. Collapsing that into a single "supported" boolean
 * is exactly the shallowness this enum exists to fix.
 */
export const stablecoinModeEnum = pgEnum("stablecoin_mode", [
  "direct_stablecoin",
  "stablecoin_funded_fiat",
  "fiat_only",
  "stablecoin_only",
  "hybrid",
  "unknown",
]);

/** What a recipient actually ends up holding at the end of a flow. */
export const receivingEndpointTypeEnum = pgEnum("receiving_endpoint_type", [
  "bank_account",
  "mobile_money",
  "card",
  "stablecoin_wallet",
  "virtual_account",
  "merchant_checkout",
  "payment_link",
  "local_instant_rail",
  "cash_pickup",
]);

/** Whether Railor could plug this provider into the unified API — separate from whether it's a good receiver. */
export const apiAccessEnum = pgEnum("api_access", ["public", "private", "partner", "none", "unknown"]);

export const sourceTypeEnum = pgEnum("source_type", [
  "official_docs",
  "api",
  "pricing",
  "help_center",
  "terms",
  "status_page",
  "github",
  "official_announcement",
  "manual_verified",
  "third_party",
]);

export const derivationEnum = pgEnum("derivation", ["source", "manual", "model"]);

/**
 * What Railor knows about the origin of an evidence-backed fact.  This is
 * intentionally independent from `source_type`: an official API can report
 * a capability, while a Railor conformance run can observe behaviour.  The
 * two must never be collapsed in a routing response.
 */
export const verificationTypeEnum = pgEnum("verification_type", [
  "provider_reported",
  "railor_observed",
  "provider_verified",
]);

export const changeKindEnum = pgEnum("change_kind", [
  "coverage_changed",
  "requirement_changed",
  "pricing_changed",
  "limit_changed",
  "api_changed",
  "documentation_changed",
  "service_degraded",
  "product_launched",
  "product_removed",
]);

export const reviewStatusEnum = pgEnum("review_status", [
  "pending",
  "approved",
  "rejected",
  "auto_published",
]);

export const orgRoleEnum = pgEnum("org_role", ["owner", "admin", "member", "viewer"]);

export const watchTargetEnum = pgEnum("watch_target", [
  "provider",
  "corridor",
  "country",
  "asset",
  "product",
]);

export const coverageGapStatusEnum = pgEnum("coverage_gap_status", ["open", "resolved"]);

export const kybItemStatusEnum = pgEnum("kyb_item_status", [
  "have",
  "missing",
  "unsure",
]);

export const requirementKindEnum = pgEnum("requirement_kind", ["kyc", "kyb", "technical"]);

export const apiKeyModeEnum = pgEnum("api_key_mode", ["test", "live"]);

export const conformanceTestKindEnum = pgEnum("conformance_test_kind", [
  "authentication",
  "sandbox_reachable",
  "quote_api",
  "quote_schema",
  "idempotency",
  "beneficiary_validation",
  "webhook_signature",
  "webhook_delivery",
  "webhook_retry",
  "status_endpoint",
  "asset_network_availability",
  "response_schema",
  "docs_parity",
]);

export const conformanceStatusEnum = pgEnum("conformance_status", [
  "pass",
  "fail",
  "warning",
  "not_tested",
  "access_required",
]);

export const incidentSeverityEnum = pgEnum("incident_severity", ["minor", "major", "critical"]);

export const incidentStatusEnum = pgEnum("incident_status", [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
]);

/**
 * Country intelligence — the research topic a source addresses, not what kind
 * of document it is (that's countrySourceTypeEnum) or how much to trust it
 * (that's countrySourceAuthorityEnum). Three separate axes on purpose.
 */
export const countrySourceCategoryEnum = pgEnum("country_source_category", [
  "central_bank",
  "banking",
  "payment_rails",
  "cross_border",
  "stablecoin",
  "crypto",
  "aml",
  "kyc",
  "kyb",
  "payout",
  "government",
  "provider",
  "other",
]);

export const countrySourceTypeEnum = pgEnum("country_source_type", [
  "regulation",
  "official_guidance",
  "news_press",
  "help_faq",
  "report",
  "wiki_reference",
  "other",
]);

/** Trust ranking used to resolve conflicts: regulator > government > network > provider > secondary. */
export const countrySourceAuthorityEnum = pgEnum("country_source_authority", [
  "official_regulator",
  "government",
  "official_network",
  "official_provider",
  "international_organization",
  "reputable_secondary",
  "unknown",
]);

export const countryResearchStatusEnum = pgEnum("country_research_status", [
  "pending",
  "searching",
  "extracting",
  "validating",
  "completed",
  "failed",
  "partial",
]);

/** "scheduled" is unused today — reserved so a future scheduler needs no migration. */
export const countryResearchTriggerEnum = pgEnum("country_research_trigger", [
  "cli",
  "admin_refresh",
  "scheduled",
]);

/* -------------------------------------------------------------------------- */
/* Reference data                                                              */
/* -------------------------------------------------------------------------- */

export const countries = pgTable("countries", {
  code: text("code").primaryKey(), // ISO 3166-1 alpha-2
  name: text("name").notNull(),
  region: text("region").notNull(),
  flag: text("flag").notNull(),
  /** Rough usage weight, used to order pickers by likelihood. */
  popularity: integer("popularity").default(0).notNull(),
});

export const currencies = pgTable("currencies", {
  code: text("code").primaryKey(), // ISO 4217
  name: text("name").notNull(),
  symbol: text("symbol"),
  countryCode: text("country_code").references(() => countries.code),
  popularity: integer("popularity").default(0).notNull(),
});

export const blockchains = pgTable("blockchains", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  chainId: text("chain_id"),
  finalitySeconds: integer("finality_seconds"),
  popularity: integer("popularity").default(0).notNull(),
});

export const assets = pgTable("assets", {
  symbol: text("symbol").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // stablecoin | crypto | fiat
  issuer: text("issuer"),
  peggedTo: text("pegged_to").references(() => currencies.code),
  popularity: integer("popularity").default(0).notNull(),
});

export const assetNetworks = pgTable(
  "asset_networks",
  {
    assetSymbol: text("asset_symbol")
      .notNull()
      .references(() => assets.symbol, { onDelete: "cascade" }),
    blockchainSlug: text("blockchain_slug")
      .notNull()
      .references(() => blockchains.slug, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.assetSymbol, t.blockchainSlug] }) }),
);

/* -------------------------------------------------------------------------- */
/* Global reference catalog                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A source registry for standards bodies, regulators and token issuers. These
 * are deliberately separate from `source_documents`: a World Bank or ISO
 * dataset is not a payment-provider document and must never enter the
 * provider-crawler/change-event path by accident.
 */
export const referenceSources = pgTable(
  "reference_sources",
  {
    id: text("id").primaryKey(),
    category: text("category").notNull(),
    authority: text("authority").notNull(),
    entity: text("entity"),
    sourceUrl: text("source_url").notNull(),
    sourceType: sourceTypeEnum("source_type").notNull(),
    verificationType: verificationTypeEnum("verification_type").notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }).notNull(),
    evidenceExcerpt: text("evidence_excerpt").notNull(),
    confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
    recommendedRefreshHours: integer("recommended_refresh_hours").notNull(),
    inputHash: text("input_hash").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({ urlIdx: index("reference_sources_url_idx").on(t.sourceUrl) }),
);

/**
 * Source-backed token metadata. A row is a reference assertion about an asset
 * (not a provider capability and not evidence that it can be paid out in any
 * country). `status` exposes supplied conflicts/research requirements instead
 * of silently treating an incomplete source as an active chain deployment.
 */
export const assetReferences = pgTable(
  "asset_references",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetSymbol: text("asset_symbol")
      .notNull()
      .references(() => assets.symbol, { onDelete: "cascade" }),
    referenceSourceId: text("reference_source_id")
      .notNull()
      .references(() => referenceSources.id, { onDelete: "cascade" }),
    issuer: text("issuer").notNull(),
    referenceCurrency: text("reference_currency").references(() => currencies.code),
    sourceUrl: text("source_url").notNull(),
    sourceType: sourceTypeEnum("source_type").notNull(),
    verificationType: verificationTypeEnum("verification_type").notNull(),
    sourceAsOf: timestamp("source_as_of", { withTimezone: true }),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }).notNull(),
    evidenceExcerpt: text("evidence_excerpt").notNull(),
    confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
    status: text("status").default("accepted").notNull(),
    note: text("note"),
    inputHash: text("input_hash").notNull(),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    assetSourceIdx: uniqueIndex("asset_references_asset_source_idx").on(t.assetSymbol, t.referenceSourceId),
  }),
);

/** One issuer/protocol-reported asset-to-network reference per source label. */
export const assetNetworkReferences = pgTable(
  "asset_network_references",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetReferenceId: uuid("asset_reference_id")
      .notNull()
      .references(() => assetReferences.id, { onDelete: "cascade" }),
    networkName: text("network_name").notNull(),
    blockchainSlug: text("blockchain_slug").references(() => blockchains.slug),
    sourceUrl: text("source_url").notNull(),
    sourceType: sourceTypeEnum("source_type").notNull(),
    verificationType: verificationTypeEnum("verification_type").notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }).notNull(),
    evidenceExcerpt: text("evidence_excerpt").notNull(),
    confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
    status: text("status").default("accepted").notNull(),
    note: text("note"),
    inputHash: text("input_hash").notNull(),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    assetNetworkSourceIdx: uniqueIndex("asset_network_references_source_name_idx").on(
      t.assetReferenceId,
      t.networkName,
    ),
  }),
);

/**
 * Real, named local payment rails — UPI, PIX, SPEI, M-PESA — as opposed to
 * paymentMethodEnum's generic buckets (bank_transfer_local, wallet_transfer)
 * that every one of these otherwise collapses into. `category` keeps the
 * generic bucket too, so existing capability filtering by paymentMethodEnum
 * keeps working unchanged; this table adds the specific name on top of it.
 */
export const namedRails = pgTable("named_rails", {
  code: text("code").primaryKey(), // e.g. "UPI", "PIX", "MPESA"
  name: text("name").notNull(),
  countryCode: text("country_code")
    .notNull()
    .references(() => countries.code),
  category: paymentMethodEnum("category").notNull(),
  description: text("description"),
});

/* -------------------------------------------------------------------------- */
/* Providers                                                                   */
/* -------------------------------------------------------------------------- */

export const providers = pgTable(
  "providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    /** Demo data is labelled so it can never be mistaken for a real company. */
    isDemo: boolean("is_demo").default(true).notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    websiteUrl: text("website_url"),
    docsUrl: text("docs_url"),
    statusPageUrl: text("status_page_url"),
    headquartersCountry: text("headquarters_country").references(() => countries.code),
    licensingSummary: text("licensing_summary"),
    hasApi: boolean("has_api").default(false).notNull(),
    /** public = anyone can self-serve a key; partner = business relationship required; private = internal only. */
    apiAccess: apiAccessEnum("api_access").default("unknown").notNull(),
    hasSandbox: boolean("has_sandbox").default(false).notNull(),
    hasWebhooks: boolean("has_webhooks").default(false).notNull(),
    sdkLanguages: jsonb("sdk_languages").$type<string[]>().default([]).notNull(),
    /** Advertised settlement copy — always shown next to observed data. */
    advertisedSettlement: text("advertised_settlement"),
    onboardingDays: integer("onboarding_days"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({ slugIdx: uniqueIndex("providers_slug_idx").on(t.slug) }),
);

export const providerProducts = pgTable(
  "provider_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    product: productTypeEnum("product").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    availability: availabilityEnum("availability").default("supported").notNull(),
    launchedAt: timestamp("launched_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
  },
  (t) => ({
    providerProductIdx: uniqueIndex("provider_products_unique").on(t.providerId, t.product),
  }),
);

/* -------------------------------------------------------------------------- */
/* Evidence & sources                                                          */
/* -------------------------------------------------------------------------- */

export const sourceDocuments = pgTable(
  "source_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id").references(() => providers.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title").notNull(),
    sourceType: sourceTypeEnum("source_type").notNull(),
    crawlFrequencyHours: integer("crawl_frequency_hours").default(24).notNull(),
    parser: text("parser").default("generic_html").notNull(),
    requiresJs: boolean("requires_js").default(false).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    nextCheckAt: timestamp("next_check_at", { withTimezone: true }),
    etag: text("etag"),
    lastModified: text("last_modified"),
    contentHash: text("content_hash"),
    failureCount: integer("failure_count").default(0).notNull(),
    lastError: text("last_error"),
    createdAt: now(),
  },
  // A URL can legitimately document multiple providers (for example a
  // marketplace or regulator page). Scope identity to the provider so one
  // provider can never inherit another provider's source document.
  (t) => ({ providerUrlIdx: uniqueIndex("source_documents_provider_url_idx").on(t.providerId, t.url) }),
);

export const sourceSnapshots = pgTable(
  "source_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceDocumentId: uuid("source_document_id")
      .notNull()
      .references(() => sourceDocuments.id, { onDelete: "cascade" }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
    httpStatus: integer("http_status"),
    contentHash: text("content_hash").notNull(),
    /** Path in object storage; the body itself never lives in Postgres. */
    storagePath: text("storage_path"),
    extractedText: text("extracted_text"),
    rawPayload: jsonb("raw_payload"),
  },
  (t) => ({ docIdx: index("source_snapshots_doc_idx").on(t.sourceDocumentId, t.fetchedAt) }),
);

/**
 * Exact corridor questions collected for source research.  These are not
 * provider capabilities: they deliberately stay out of the routing graph
 * until a provider API, documentation page, or observed run proves the
 * complete tuple.
 */
export const routeResearchQueue = pgTable(
  "route_research_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inputHash: text("input_hash").notNull(),
    sourceName: text("source_name").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    status: text("status").default("RESEARCH_REQUIRED").notNull(),
    // Research targets may mention a valid ISO/code not yet in Railor's
    // reference catalog. Keep them verbatim so a catalog gap cannot erase
    // the target before a researcher has reviewed it.
    entityCountry: text("entity_country"),
    customerType: customerTypeEnum("customer_type"),
    sourceAsset: text("source_asset"),
    sourceNetwork: text("source_network"),
    sourceCurrency: text("source_currency"),
    destinationCountry: text("destination_country"),
    destinationCurrency: text("destination_currency"),
    endpointType: receivingEndpointTypeEnum("endpoint_type"),
    namedRail: text("named_rail"),
    query: jsonb("query").$type<Record<string, string>>().notNull(),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    inputHashIdx: uniqueIndex("route_research_queue_input_hash_idx").on(t.inputHash),
    statusIdx: index("route_research_queue_status_idx").on(t.status, t.generatedAt),
  }),
);

export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id").references(() => providers.id, { onDelete: "cascade" }),
    sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id),
    snapshotId: uuid("snapshot_id").references(() => sourceSnapshots.id),
    sourceUrl: text("source_url").notNull(),
    sourceTitle: text("source_title").notNull(),
    sourceType: sourceTypeEnum("source_type").notNull(),
    /**
     * `provider_reported` is a statement in the provider's own material;
     * `railor_observed` is measured by a real Railor run; and
     * `provider_verified` is manually corroborated against an authoritative
     * primary source such as a regulator or payment-network registry.
     */
    verificationType: verificationTypeEnum("verification_type")
      .default("provider_reported")
      .notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }).notNull(),
    confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
    rawExcerpt: text("raw_excerpt"),
    rawHash: text("raw_hash").notNull(),
    supersededBy: uuid("superseded_by"),
    createdAt: now(),
  },
  (t) => ({ providerIdx: index("evidence_provider_idx").on(t.providerId) }),
);

/* -------------------------------------------------------------------------- */
/* Capabilities — the heart of the graph                                       */
/* -------------------------------------------------------------------------- */

/**
 * A dimensioned claim about what a provider can do.
 * NULL on any dimension means "applies to any value of that dimension".
 */
export const providerCapabilities = pgTable(
  "provider_capabilities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    product: productTypeEnum("product").notNull(),

    entityCountry: text("entity_country").references(() => countries.code),
    customerCountry: text("customer_country").references(() => countries.code),
    customerType: customerTypeEnum("customer_type"),
    /** Explicit payer jurisdiction/funding details. These are never inferred from destination facts. */
    sourceCountry: text("source_country").references(() => countries.code),
    sourceEndpointType: receivingEndpointTypeEnum("source_endpoint_type"),
    sourceNamedRail: text("source_named_rail").references(() => namedRails.code),
    sourceAsset: text("source_asset").references(() => assets.symbol),
    sourceNetwork: text("source_network").references(() => blockchains.slug),
    sourceCurrency: text("source_currency").references(() => currencies.code),
    destinationCountry: text("destination_country").references(() => countries.code),
    destinationCurrency: text("destination_currency").references(() => currencies.code),
    paymentMethod: paymentMethodEnum("payment_method"),

    availability: availabilityEnum("availability").notNull(),
    /** Shown verbatim when a capability is partial or unsupported. */
    note: text("note"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    derivation: derivationEnum("derivation").default("source").notNull(),
    evidenceId: uuid("evidence_id").references(() => evidence.id),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    lookupIdx: index("capabilities_lookup_idx").on(
      t.providerId,
      t.product,
      t.entityCountry,
      t.destinationCountry,
    ),
    corridorIdx: index("capabilities_corridor_idx").on(
      t.sourceAsset,
      t.destinationCurrency,
      t.destinationCountry,
    ),
  }),
);

/**
 * An atomic, evidence-backed route assertion. Unlike providerCapabilities and
 * receivingEndpoints, this is the only graph fact that can prove a complete
 * source-to-destination route. Null does not authorize a join to another row.
 */
export const providerRoutes = pgTable(
  "provider_routes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
    product: productTypeEnum("product").notNull(),
    entityCountry: text("entity_country").references(() => countries.code),
    customerType: customerTypeEnum("customer_type"),
    sourceCountry: text("source_country").references(() => countries.code),
    sourceEndpointType: receivingEndpointTypeEnum("source_endpoint_type"),
    sourceNamedRail: text("source_named_rail").references(() => namedRails.code),
    sourceAsset: text("source_asset").references(() => assets.symbol),
    sourceNetwork: text("source_network").references(() => blockchains.slug),
    sourceCurrency: text("source_currency").references(() => currencies.code),
    destinationCountry: text("destination_country").notNull().references(() => countries.code),
    destinationCurrency: text("destination_currency").references(() => currencies.code),
    destinationEndpointType: receivingEndpointTypeEnum("destination_endpoint_type"),
    destinationNamedRail: text("destination_named_rail").references(() => namedRails.code),
    paymentMethod: paymentMethodEnum("payment_method"),
    minAmount: numeric("min_amount", { precision: 20, scale: 8 }),
    maxAmount: numeric("max_amount", { precision: 20, scale: 8 }),
    amountCurrency: text("amount_currency").references(() => currencies.code),
    availability: availabilityEnum("availability").notNull(),
    note: text("note"),
    evidenceId: uuid("evidence_id").references(() => evidence.id),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    exactLookupIdx: index("provider_routes_exact_lookup_idx").on(t.providerId, t.product, t.entityCountry, t.sourceAsset, t.sourceCurrency, t.destinationCountry),
    destinationIdx: index("provider_routes_destination_idx").on(t.destinationCountry, t.destinationCurrency),
  }),
);

/**
 * The other half of a corridor: not "which provider works" but "how does
 * money actually reach someone in this country through it" — Skydo and
 * Xflow are both real Indian receivers, and `stablecoinMode` is the one
 * field that tells them apart (fiat_only vs stablecoin_funded_fiat). Shaped
 * like providerCapabilities on purpose: one row per asset/network/rail
 * combination a provider actually supports, not an array crammed into one
 * row — multiple rows, same dimensioned-claim pattern, same evidence gate.
 */
export const receivingEndpoints = pgTable(
  "receiving_endpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    countryCode: text("country_code")
      .notNull()
      .references(() => countries.code),
    endpointType: receivingEndpointTypeEnum("endpoint_type").notNull(),
    stablecoinMode: stablecoinModeEnum("stablecoin_mode").default("unknown").notNull(),
    customerType: customerTypeEnum("customer_type"),

    incomingAsset: text("incoming_asset").references(() => assets.symbol),
    incomingNetwork: text("incoming_network").references(() => blockchains.slug),
    destinationCurrency: text("destination_currency").references(() => currencies.code),
    namedRail: text("named_rail").references(() => namedRails.code),
    paymentMethod: paymentMethodEnum("payment_method"),

    /** Free text on purpose — "T+2", "instant", "1-3 business days" isn't worth a fake-precise enum. */
    settlementEstimate: text("settlement_estimate"),
    /** e.g. "e-FIRA" — compliance documentation the recipient gets, when a provider states one. */
    complianceDocs: text("compliance_docs"),

    availability: availabilityEnum("availability").default("unknown").notNull(),
    /** Shown verbatim for anything short of a clean "yes" — composite/unverified routes especially. */
    note: text("note"),
    derivation: derivationEnum("derivation").default("source").notNull(),
    evidenceId: uuid("evidence_id").references(() => evidence.id),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    lookupIdx: index("receiving_endpoints_lookup_idx").on(t.providerId, t.countryCode, t.endpointType),
    countryModeIdx: index("receiving_endpoints_country_mode_idx").on(t.countryCode, t.stablecoinMode),
  }),
);

export const requirements = pgTable(
  "requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Normalized key, e.g. `ubo_disclosure` — many provider phrasings map here. */
    key: text("key").notNull(),
    kind: requirementKindEnum("kind").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    /** Alternate names seen in the wild, used by the normalizer. */
    aliases: jsonb("aliases").$type<string[]>().default([]).notNull(),
  },
  (t) => ({ keyIdx: uniqueIndex("requirements_key_idx").on(t.key) }),
);

export const providerRequirements = pgTable(
  "provider_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    requirementId: uuid("requirement_id")
      .notNull()
      .references(() => requirements.id, { onDelete: "cascade" }),
    customerType: customerTypeEnum("customer_type"),
    entityCountry: text("entity_country").references(() => countries.code),
    mandatory: boolean("mandatory").default(true).notNull(),
    note: text("note"),
    evidenceId: uuid("evidence_id").references(() => evidence.id),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  },
  (t) => ({ providerIdx: index("provider_requirements_provider_idx").on(t.providerId) }),
);

export const fees = pgTable("fees", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id")
    .notNull()
    .references(() => providers.id, { onDelete: "cascade" }),
  product: productTypeEnum("product").notNull(),
  destinationCurrency: text("destination_currency").references(() => currencies.code),
  percentBps: integer("percent_bps"),
  fixedAmount: numeric("fixed_amount", { precision: 12, scale: 2 }),
  fixedCurrency: text("fixed_currency").references(() => currencies.code),
  fxSpreadBps: integer("fx_spread_bps"),
  summary: text("summary").notNull(),
  evidenceId: uuid("evidence_id").references(() => evidence.id),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
});

export const limits = pgTable("limits", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id")
    .notNull()
    .references(() => providers.id, { onDelete: "cascade" }),
  product: productTypeEnum("product").notNull(),
  customerType: customerTypeEnum("customer_type"),
  currency: text("currency").references(() => currencies.code),
  minAmount: numeric("min_amount", { precision: 18, scale: 2 }),
  maxAmount: numeric("max_amount", { precision: 18, scale: 2 }),
  dailyMax: numeric("daily_max", { precision: 18, scale: 2 }),
  monthlyMax: numeric("monthly_max", { precision: 18, scale: 2 }),
  summary: text("summary").notNull(),
  evidenceId: uuid("evidence_id").references(() => evidence.id),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
});

/* -------------------------------------------------------------------------- */
/* Change detection                                                            */
/* -------------------------------------------------------------------------- */

export const changeEvents = pgTable(
  "change_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    kind: changeKindEnum("kind").notNull(),
    field: text("field").notNull(),
    previousValue: text("previous_value"),
    currentValue: text("current_value"),
    /** One-sentence plain-language summary of the diff. */
    summary: text("summary").notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
    sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id),
    evidenceId: uuid("evidence_id").references(() => evidence.id),
    confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
    reviewStatus: reviewStatusEnum("review_status").default("pending").notNull(),
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** Dimensions touched, so alerts can match a watched corridor precisely. */
    affects: jsonb("affects").$type<Record<string, string>>().default({}).notNull(),
  },
  (t) => ({
    detectedIdx: index("change_events_detected_idx").on(t.detectedAt),
    providerIdx: index("change_events_provider_idx").on(t.providerId),
  }),
);

/* Future benchmark surface — schema exists now, populated later. */
export const observations = pgTable("observations", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id")
    .notNull()
    .references(() => providers.id, { onDelete: "cascade" }),
  corridorKey: text("corridor_key").notNull(),
  quoteMs: integer("quote_ms"),
  executionMs: integer("execution_ms"),
  settlementMs: integer("settlement_ms"),
  success: boolean("success"),
  failureReason: text("failure_reason"),
  spreadBps: integer("spread_bps"),
  feeAmount: numeric("fee_amount", { precision: 18, scale: 2 }),
  observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
});

export const healthChecks = pgTable("health_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id")
    .notNull()
    .references(() => providers.id, { onDelete: "cascade" }),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
  ok: boolean("ok").notNull(),
  latencyMs: integer("latency_ms"),
  statusText: text("status_text"),
});

/**
 * Catalog of what Railor checks for a provider (architecture, not a claim).
 * A row existing here says nothing about the world; only `conformance_runs`
 * does, and only once something has actually run the check.
 */
export const conformanceTests = pgTable(
  "conformance_tests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    kind: conformanceTestKindEnum("kind").notNull(),
    label: text("label").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: now(),
  },
  (t) => ({
    providerKindIdx: uniqueIndex("conformance_tests_provider_kind_idx").on(t.providerId, t.kind),
  }),
);

export const conformanceRuns = pgTable(
  "conformance_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    testId: uuid("test_id")
      .notNull()
      .references(() => conformanceTests.id, { onDelete: "cascade" }),
    status: conformanceStatusEnum("status").notNull(),
    detail: text("detail"),
    latencyMs: integer("latency_ms"),
    ranAt: timestamp("ran_at", { withTimezone: true }).defaultNow().notNull(),
    evidenceId: uuid("evidence_id").references(() => evidence.id),
  },
  (t) => ({
    testIdx: index("conformance_runs_test_idx").on(t.testId, t.ranAt),
  }),
);

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    severity: incidentSeverityEnum("severity").notNull(),
    status: incidentStatusEnum("status").default("investigating").notNull(),
    sourceUrl: text("source_url"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: now(),
  },
  (t) => ({
    providerIdx: index("incidents_provider_idx").on(t.providerId, t.startedAt),
  }),
);

/* -------------------------------------------------------------------------- */
/* Identity & organizations                                                    */
/* -------------------------------------------------------------------------- */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    isAdmin: boolean("is_admin").default(false).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: now(),
  },
  (t) => ({ emailIdx: uniqueIndex("users_email_idx").on(t.email) }),
);

export const magicLinks = pgTable("magic_links", {
  token: text("token").primaryKey(),
  email: text("email").notNull(),
  /** The query the visitor typed before signing up — restored after auth. */
  returnTo: text("return_to"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: now(),
});

export const sessions = pgTable(
  "sessions",
  {
    token: text("token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: now(),
  },
  (t) => ({ userIdx: index("sessions_user_idx").on(t.userId) }),
);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    emailDomain: text("email_domain"),
    entityCountry: text("entity_country").references(() => countries.code),
    building: text("building"),
    targetCountries: jsonb("target_countries").$type<string[]>().default([]).notNull(),
    settlementCurrencies: jsonb("settlement_currencies").$type<string[]>().default([]).notNull(),
    interests: jsonb("interests").$type<string[]>().default([]).notNull(),
    /** Skipped onboarding steps recorded as explicit, visible assumptions. */
    assumptions: jsonb("assumptions").$type<string[]>().default([]).notNull(),
    onboardingStep: integer("onboarding_step").default(0).notNull(),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({ slugIdx: uniqueIndex("organizations_slug_idx").on(t.slug) }),
);

export const organizationMembers = pgTable(
  "organization_members",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: orgRoleEnum("role").default("member").notNull(),
    createdAt: now(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.organizationId, t.userId] }) }),
);

export const invites = pgTable("invites", {
  token: text("token").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: orgRoleEnum("role").default("member").notNull(),
  invitedBy: uuid("invited_by").references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: now(),
});

/* -------------------------------------------------------------------------- */
/* Organization workspace data                                                 */
/* -------------------------------------------------------------------------- */

export const savedSearches = pgTable("saved_searches", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by").references(() => users.id),
  input: text("input").notNull(),
  query: jsonb("query").$type<Record<string, unknown>>().notNull(),
  createdAt: now(),
});

export const savedCorridors = pgTable(
  "saved_corridors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    query: jsonb("query").$type<Record<string, unknown>>().notNull(),
    /** True when Railor created it from onboarding rather than the user. */
    suggested: boolean("suggested").default(false).notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({ orgIdx: index("saved_corridors_org_idx").on(t.organizationId) }),
);

export const watchlists = pgTable(
  "watchlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    targetType: watchTargetEnum("target_type").notNull(),
    /** provider slug, country code, asset symbol, or saved_corridor id */
    targetId: text("target_id").notNull(),
    label: text("label").notNull(),
    kinds: jsonb("kinds").$type<string[]>().default([]).notNull(),
    channelEmail: boolean("channel_email").default(true).notNull(),
    digest: text("digest").default("instant").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: now(),
  },
  (t) => ({ orgIdx: index("watchlists_org_idx").on(t.organizationId) }),
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    watchlistId: uuid("watchlist_id").references(() => watchlists.id, {
      onDelete: "cascade",
    }),
    changeEventId: uuid("change_event_id")
      .notNull()
      .references(() => changeEvents.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: now(),
  },
  (t) => ({ orgIdx: index("alerts_org_idx").on(t.organizationId, t.createdAt) }),
);

/* -------------------------------------------------------------------------- */
/* Coverage gaps & demand telemetry                                            */
/* -------------------------------------------------------------------------- */

/**
 * One row per (provider, corridor) that a real search evaluated to
 * `unknown` — the structured "missing edge" from evaluateProvider's own
 * reasons, not a reinterpretation. Self-accumulating (times_requested) on
 * every repeat search, and self-resolving: coverage-gaps.ts re-runs the same
 * evaluation later and flips this to resolved (linking the change_events row
 * that told existing watchers) the moment real data answers it — nobody has
 * to remember to close it out by hand.
 */
export const coverageGaps = pgTable(
  "coverage_gaps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    corridorKey: text("corridor_key").notNull(),
    /** The exact CorridorQuery that produced this gap — replayed verbatim on revalidation, never reconstructed from corridorKey. */
    query: jsonb("query").$type<Record<string, unknown>>().notNull(),
    /** evaluateProvider's own EligibilityReason[] at gap-creation time. */
    reasons: jsonb("reasons").$type<Array<Record<string, unknown>>>().notNull(),
    status: coverageGapStatusEnum("status").default("open").notNull(),
    timesRequested: integer("times_requested").default(1).notNull(),
    firstRequestedAt: timestamp("first_requested_at", { withTimezone: true }).defaultNow().notNull(),
    lastRequestedAt: timestamp("last_requested_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedChangeEventId: uuid("resolved_change_event_id").references(() => changeEvents.id),
  },
  (t) => ({
    providerCorridorIdx: uniqueIndex("coverage_gaps_provider_corridor_idx").on(t.providerId, t.corridorKey),
    statusIdx: index("coverage_gaps_status_idx").on(t.status),
  }),
);

/**
 * One row per distinct corridor shape, aggregated across every real search —
 * never per-user, never storing who searched. Purely a demand signal: which
 * corridors people actually ask about, and how often, to rank research and
 * provider-integration priority. `totalRequestedVolume` only sums searches
 * that specified a real amount — `volumeSearchCount` is the honest
 * denominator for an average, since most searches don't specify one and
 * treating those as zero would understate real demand.
 */
export const corridorDemand = pgTable(
  "corridor_demand",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    corridorKey: text("corridor_key").notNull(),
    query: jsonb("query").$type<Record<string, unknown>>().notNull(),
    searchCount: integer("search_count").default(1).notNull(),
    totalRequestedVolume: numeric("total_requested_volume", { precision: 18, scale: 2 }),
    volumeSearchCount: integer("volume_search_count").default(0).notNull(),
    firstSearchedAt: timestamp("first_searched_at", { withTimezone: true }).defaultNow().notNull(),
    lastSearchedAt: timestamp("last_searched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ corridorKeyIdx: uniqueIndex("corridor_demand_key_idx").on(t.corridorKey) }),
);

export const orgKybItems = pgTable(
  "org_kyb_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    requirementId: uuid("requirement_id")
      .notNull()
      .references(() => requirements.id, { onDelete: "cascade" }),
    status: kybItemStatusEnum("status").default("unsure").notNull(),
    note: text("note"),
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: updated(),
  },
  (t) => ({
    orgReqIdx: uniqueIndex("org_kyb_items_unique").on(t.organizationId, t.requirementId),
  }),
);

/** Customer-owned credentials for their own provider accounts (apps/web/lib/connections.ts writes/reads this) — never Railor's own credentials, and never returned to a client; only decrypted server-side, immediately before an adapter call. */
export const providerConnections = pgTable("provider_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  providerId: uuid("provider_id")
    .notNull()
    .references(() => providers.id, { onDelete: "cascade" }),
  status: text("status").default("not_connected").notNull(),
  /** AES-256-GCM ciphertext (apps/web/lib/credentials.ts), written by connectProvider(). Requires CREDENTIALS_ENCRYPTION_KEY — connectProvider refuses to write if that's unset. */
  encryptedCredentials: text("encrypted_credentials"),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  createdAt: now(),
});

/* -------------------------------------------------------------------------- */
/* Developer surface                                                           */
/* -------------------------------------------------------------------------- */

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    mode: apiKeyModeEnum("mode").notNull(),
    /** First 12 chars, safe to display. Full key is never stored. */
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    /** Test keys stay revealable; live keys are shown exactly once. */
    revealableSecret: text("revealable_secret"),
    monthlyRequestCap: integer("monthly_request_cap"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: now(),
  },
  (t) => ({
    hashIdx: uniqueIndex("api_keys_hash_idx").on(t.keyHash),
    orgIdx: index("api_keys_org_idx").on(t.organizationId),
  }),
);

export const apiUsage = pgTable(
  "api_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    endpoint: text("endpoint").notNull(),
    method: text("method").notNull(),
    status: integer("status").notNull(),
    latencyMs: integer("latency_ms"),
    createdAt: now(),
  },
  (t) => ({
    orgIdx: index("api_usage_org_idx").on(t.organizationId, t.createdAt),
    keyIdx: index("api_usage_key_idx").on(t.apiKeyId, t.createdAt),
  }),
);

/**
 * Daily rollup of `api_usage`, one row per org/key/endpoint/day. Populated by
 * `rollupApiUsageDay` (see @railor/core's analytics module) so the 30-day
 * usage chart and quota checks never have to scan the raw event table.
 * `api_usage` itself is pruned after rollup — this table is what survives.
 */
export const apiUsageDaily = pgTable(
  "api_usage_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    /** UTC midnight for the day this row summarizes. */
    day: timestamp("day", { withTimezone: true }).notNull(),
    requestCount: integer("request_count").default(0).notNull(),
    errorCount: integer("error_count").default(0).notNull(),
    latencySumMs: integer("latency_sum_ms").default(0).notNull(),
    latencySampleCount: integer("latency_sample_count").default(0).notNull(),
    latencyMaxMs: integer("latency_max_ms"),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({
    unique: uniqueIndex("api_usage_daily_unique").on(
      t.organizationId,
      t.apiKeyId,
      t.endpoint,
      t.day,
    ),
    orgDayIdx: index("api_usage_daily_org_day_idx").on(t.organizationId, t.day),
  }),
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    actorId: uuid("actor_id").references(() => users.id),
    action: text("action").notNull(),
    target: text("target"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: now(),
  },
  (t) => ({ orgIdx: index("audit_logs_org_idx").on(t.organizationId, t.createdAt) }),
);

export const sharedComparisons = pgTable("shared_comparisons", {
  id: text("id").primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  title: text("title").notNull(),
  providerSlugs: jsonb("provider_slugs").$type<string[]>().notNull(),
  query: jsonb("query").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: now(),
});

/* -------------------------------------------------------------------------- */
/* Country intelligence                                                       */
/*                                                                             */
/* A separate, additive subsystem: static/semi-static country-level payment   */
/* infrastructure facts (regulators, rails, IBAN/SWIFT, KYC/KYB/AML, crypto    */
/* status), researched offline by Tavily+OpenAI and read cheaply at request   */
/* time. Deliberately NOT wired into providerCapabilities/namedRails/         */
/* receivingEndpoints — this never feeds the live routing/eligibility graph.  */
/* -------------------------------------------------------------------------- */

/** One row per researched country. No status column — current status is always the latest countryResearchRuns row. */
export const countryProfiles = pgTable("country_profiles", {
  iso2: text("iso2").primaryKey().references(() => countries.code),
  /** Filled from a static map + countries.name at ingestion — never LLM-researched. */
  iso3: text("iso3"),
  countryName: text("country_name"),
  currencyCode: text("currency_code").references(() => currencies.code),
  currencyName: text("currency_name"),

  centralBankName: text("central_bank_name"),
  regulatorNames: jsonb("regulator_names").$type<string[]>().default([]).notNull(),
  pspLicensingSummary: text("psp_licensing_summary"),

  ibanSupported: boolean("iban_supported"),
  ibanNote: text("iban_note"),
  swiftSupported: boolean("swift_supported"),
  swiftNote: text("swift_note"),

  instantPaymentAvailable: boolean("instant_payment_available"),
  instantPaymentSystem: text("instant_payment_system"),
  localPaymentRails: jsonb("local_payment_rails").$type<string[]>().default([]).notNull(),
  bankAccountRequirements: jsonb("bank_account_requirements").$type<string[]>().default([]).notNull(),
  routingCodeType: text("routing_code_type"),
  routingCodeDescription: text("routing_code_description"),

  cryptoStatus: text("crypto_status"),
  stablecoinStatus: text("stablecoin_status"),

  kycRequirements: jsonb("kyc_requirements").$type<string[]>().default([]).notNull(),
  kybRequirements: jsonb("kyb_requirements").$type<string[]>().default([]).notNull(),
  amlRequirements: jsonb("aml_requirements").$type<string[]>().default([]).notNull(),
  crossBorderRestrictions: jsonb("cross_border_restrictions").$type<string[]>().default([]).notNull(),
  supportedPayoutCurrencies: jsonb("supported_payout_currencies").$type<string[]>().default([]).notNull(),

  lastResearchedAt: timestamp("last_researched_at", { withTimezone: true }),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  createdAt: now(),
  updatedAt: updated(),
});

/** One row per distinct URL used per country. The unique (countryIso2, url) index is the dedup mechanism. */
export const countrySources = pgTable(
  "country_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countryIso2: text("country_iso2")
      .notNull()
      .references(() => countries.code),
    url: text("url").notNull(),
    domain: text("domain").notNull(),
    title: text("title"),
    category: countrySourceCategoryEnum("category").notNull(),
    sourceType: countrySourceTypeEnum("source_type").notNull(),
    authorityLevel: countrySourceAuthorityEnum("authority_level").default("unknown").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    accessedAt: timestamp("accessed_at", { withTimezone: true }).defaultNow().notNull(),
    contentHash: text("content_hash"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: now(),
  },
  (t) => ({
    countryUrlIdx: uniqueIndex("country_sources_country_url_idx").on(t.countryIso2, t.url),
    categoryIdx: index("country_sources_category_idx").on(t.countryIso2, t.category),
  }),
);

/**
 * Field-level provenance: which source(s) back one specific fact on
 * countryProfiles (factKey e.g. "kyc_requirements", "instant_payment_system").
 * Without this, provenance can only be "sources used for this country
 * somewhere," not "this fact came from this source" — and conflicting
 * sources on different facts couldn't be represented. Rewritten (delete +
 * reinsert) wholesale for a country on every ingestion run, in the same
 * transaction as the countryProfiles upsert.
 */
export const countryFactSources = pgTable(
  "country_fact_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countryIso2: text("country_iso2")
      .notNull()
      .references(() => countries.code),
    factKey: text("fact_key").notNull(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => countrySources.id, { onDelete: "cascade" }),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    excerpt: text("excerpt"),
    createdAt: now(),
  },
  (t) => ({
    countryFactIdx: index("country_fact_sources_country_fact_idx").on(t.countryIso2, t.factKey),
  }),
);

/**
 * One row per research pipeline execution, updated at each phase transition
 * (pending -> searching -> extracting -> validating -> completed/failed/partial)
 * rather than written once at the end, so a run's progress is observable
 * mid-flight and a failure records exactly which phase it failed in.
 */
export const countryResearchRuns = pgTable(
  "country_research_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countryIso2: text("country_iso2")
      .notNull()
      .references(() => countries.code),
    status: countryResearchStatusEnum("status").default("pending").notNull(),
    triggerType: countryResearchTriggerEnum("trigger_type").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    queriesCount: integer("queries_count").default(0).notNull(),
    sourcesDiscovered: integer("sources_discovered").default(0).notNull(),
    sourcesUsed: integer("sources_used").default(0).notNull(),
    modelUsed: text("model_used"),
    usageMetadata: jsonb("usage_metadata").$type<Record<string, unknown>>().default({}).notNull(),
    errorMessage: text("error_message"),
    /** Which pipeline phase failed, e.g. "searching" — status='failed' alone doesn't say that. */
    errorPhase: text("error_phase"),
    createdAt: now(),
  },
  (t) => ({
    countryStartedIdx: index("country_research_runs_country_started_idx").on(t.countryIso2, t.startedAt),
    statusIdx: index("country_research_runs_status_idx").on(t.status),
  }),
);

/** Durable paid-research budget. A scope can be a monthly or campaign ledger. */
export const researchBudgetAccounts = pgTable(
  "research_budget_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendor: text("vendor").notNull(),
    scopeKey: text("scope_key").notNull(),
    maxSpendUsd: numeric("max_spend_usd", { precision: 12, scale: 4 }).notNull(),
    reserveUsd: numeric("reserve_usd", { precision: 12, scale: 4 }).notNull(),
    committedUsd: numeric("committed_usd", { precision: 12, scale: 4 }).default("0").notNull(),
    reservedUsd: numeric("reserved_usd", { precision: 12, scale: 4 }).default("0").notNull(),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({ vendorScopeIdx: uniqueIndex("research_budget_accounts_vendor_scope_idx").on(t.vendor, t.scopeKey) }),
);

/** Append-only reservation/commit history for paid research calls. */
export const researchSpendLedger = pgTable(
  "research_spend_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => researchBudgetAccounts.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    operationType: text("operation_type").notNull(),
    mode: text("mode").notNull(),
    unitCount: integer("unit_count").notNull(),
    estimatedUsd: numeric("estimated_usd", { precision: 12, scale: 4 }).notNull(),
    status: text("status").notNull(),
    country: text("country"),
    provider: text("provider"),
    summary: text("summary"),
    errorMessage: text("error_message"),
    createdAt: now(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  },
  (t) => ({
    idempotencyIdx: uniqueIndex("research_spend_ledger_idempotency_idx").on(t.idempotencyKey),
    accountStatusIdx: index("research_spend_ledger_account_status_idx").on(t.accountId, t.status, t.createdAt),
  }),
);

/* -------------------------------------------------------------------------- */
/* Relations                                                                   */
/* -------------------------------------------------------------------------- */

export const providersRelations = relations(providers, ({ many }) => ({
  products: many(providerProducts),
  capabilities: many(providerCapabilities),
  requirements: many(providerRequirements),
  fees: many(fees),
  limits: many(limits),
  changes: many(changeEvents),
  sources: many(sourceDocuments),
}));

export const providerCapabilitiesRelations = relations(providerCapabilities, ({ one }) => ({
  provider: one(providers, {
    fields: [providerCapabilities.providerId],
    references: [providers.id],
  }),
  evidence: one(evidence, {
    fields: [providerCapabilities.evidenceId],
    references: [evidence.id],
  }),
}));

export const providerRoutesRelations = relations(providerRoutes, ({ one }) => ({
  provider: one(providers, { fields: [providerRoutes.providerId], references: [providers.id] }),
  evidence: one(evidence, { fields: [providerRoutes.evidenceId], references: [evidence.id] }),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  corridors: many(savedCorridors),
  watchlists: many(watchlists),
  keys: many(apiKeys),
}));

export const countryProfilesRelations = relations(countryProfiles, ({ many }) => ({
  sources: many(countrySources),
  factSources: many(countryFactSources),
  runs: many(countryResearchRuns),
}));

export const countrySourcesRelations = relations(countrySources, ({ many }) => ({
  factSources: many(countryFactSources),
}));

export const countryFactSourcesRelations = relations(countryFactSources, ({ one }) => ({
  source: one(countrySources, {
    fields: [countryFactSources.sourceId],
    references: [countrySources.id],
  }),
}));

export const schemaVersion = sql`1`;
