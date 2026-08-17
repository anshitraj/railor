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

export const kybItemStatusEnum = pgEnum("kyb_item_status", [
  "have",
  "missing",
  "unsure",
]);

export const requirementKindEnum = pgEnum("requirement_kind", ["kyc", "kyb", "technical"]);

export const apiKeyModeEnum = pgEnum("api_key_mode", ["test", "live"]);

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
  (t) => ({ urlIdx: uniqueIndex("source_documents_url_idx").on(t.url) }),
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
    sourceAsset: text("source_asset").references(() => assets.symbol),
    sourceNetwork: text("source_network").references(() => blockchains.slug),
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

/** Stage 5 architecture. No credentials are stored or used in V1. */
export const providerConnections = pgTable("provider_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  providerId: uuid("provider_id")
    .notNull()
    .references(() => providers.id, { onDelete: "cascade" }),
  status: text("status").default("not_connected").notNull(),
  /** Ciphertext only, written by the adapter layer. Empty in V1. */
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
  (t) => ({ orgIdx: index("api_usage_org_idx").on(t.organizationId, t.createdAt) }),
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

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  corridors: many(savedCorridors),
  watchlists: many(watchlists),
  keys: many(apiKeys),
}));

export const schemaVersion = sql`1`;
