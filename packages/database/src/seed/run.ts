/**
 * Seeds the Railor demo dataset.
 *
 * Idempotent: it truncates the reference + provider tables it owns, then
 * rebuilds them. Organization data (users, orgs, corridors, keys) is never
 * touched, so re-seeding does not log anyone out or delete their workspace.
 *
 *   pnpm db:seed
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { SOURCE_BASE_CONFIDENCE, type ProductType, type SourceType } from "@railor/types";
import { ensureMigrated, getDb, getDbHandle } from "../client.js";
import * as s from "../schema.js";
import {
  assetNetworks,
  assets,
  blockchains,
  changeEvents as changeSpecs,
  countries,
  currencies,
  namedRails,
  providerSpecs,
  requirements as requirementSpecs,
  type Availability,
  type ProviderSpec,
} from "./data.js";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
const hash = (v: string) => createHash("sha256").update(v).digest("hex").slice(0, 32);

/**
 * Conformance test *catalog* — what Railor would check for a provider, not a
 * claim about whether it passes. No `conformance_runs` rows are seeded: every
 * test starts genuinely `not_tested` until something actually runs it.
 */
const API_TEST_KINDS = [
  "authentication",
  "quote_api",
  "quote_schema",
  "idempotency",
  "beneficiary_validation",
  "status_endpoint",
  "asset_network_availability",
  "response_schema",
  "docs_parity",
] as const;

const CONFORMANCE_LABELS: Record<string, string> = {
  authentication: "Authentication",
  sandbox_reachable: "Sandbox reachable",
  quote_api: "Quote API",
  quote_schema: "Quote schema",
  idempotency: "Idempotency behavior",
  beneficiary_validation: "Beneficiary validation",
  webhook_signature: "Webhook signature",
  webhook_delivery: "Webhook delivery",
  webhook_retry: "Webhook retry",
  status_endpoint: "Status endpoint",
  asset_network_availability: "Asset/network availability",
  response_schema: "Response schema",
  docs_parity: "Docs/API parity",
};

/** Products that can carry a payout corridor facet. */
const CORRIDOR_PRODUCTS = new Set(["payout", "off_ramp", "collection"]);

export interface SeedSummary {
  providers: number;
  capabilities: number;
  changes: number;
  countries: number;
  assets: number;
  blockchains: number;
  namedRails: number;
}

/**
 * Does the actual seeding, against whatever database `getDb()` currently
 * resolves to — real Postgres, the dev PGlite dir, or an isolated one a test
 * suite points at via PGLITE_DATA_DIR. Leaves the connection open: callers
 * decide when (and whether) to close it, so tests can seed and then run
 * queries against the same handle.
 */
export async function seedDemoData(): Promise<SeedSummary> {
  const db = await getDb();
  await ensureMigrated();

  /**
   * Only demo providers get truncated. `providers` used to be in a blanket
   * `truncate ... cascade` alongside every reference table — which, because
   * countries/currencies/blockchains/assets/assetNetworks were *also* in
   * that same statement, cascaded through every FK pointing at them
   * (provider_capabilities.source_asset, receiving_endpoints.incoming_asset,
   * etc.) and would have deleted a real, non-demo provider's capability and
   * receiving-endpoint rows the moment anyone re-ran the demo seed — not
   * hypothetically, provably, since TRUNCATE CASCADE has no WHERE clause to
   * scope it by is_demo. Deleting only demo providers cascades (every FK
   * below is declared onDelete: 'cascade') through exactly their own
   * evidence, capabilities, receiving endpoints, sources, conformance tests
   * and incidents — nothing a real provider owns is reachable from a demo
   * provider's id, so nothing real is at risk.
   */
  await db.delete(s.providers).where(sql`${s.providers.isDemo} = true`);

  // Reference tables: upserted in bulk (one statement each, `excluded.col`
  // pulls each row's own incoming value), never truncated — a real row
  // anywhere in the graph that references a country/currency/chain/asset/
  // requirement can never be cascade-deleted by re-running this seed.
  await db
    .insert(s.countries)
    .values(countries.map((c) => ({ ...c })))
    .onConflictDoUpdate({
      target: s.countries.code,
      set: { name: sql`excluded.name`, region: sql`excluded.region`, flag: sql`excluded.flag`, popularity: sql`excluded.popularity` },
    });
  await db
    .insert(s.currencies)
    .values(currencies.map((c) => ({ ...c })))
    .onConflictDoUpdate({
      target: s.currencies.code,
      set: {
        name: sql`excluded.name`,
        symbol: sql`excluded.symbol`,
        countryCode: sql`excluded.country_code`,
        popularity: sql`excluded.popularity`,
      },
    });
  await db
    .insert(s.blockchains)
    .values(blockchains.map((b) => ({ ...b })))
    .onConflictDoUpdate({
      target: s.blockchains.slug,
      set: {
        name: sql`excluded.name`,
        chainId: sql`excluded.chain_id`,
        finalitySeconds: sql`excluded.finality_seconds`,
        popularity: sql`excluded.popularity`,
      },
    });
  await db
    .insert(s.assets)
    .values(assets.map((a) => ({ ...a })))
    .onConflictDoUpdate({
      target: s.assets.symbol,
      set: {
        name: sql`excluded.name`,
        kind: sql`excluded.kind`,
        issuer: sql`excluded.issuer`,
        peggedTo: sql`excluded.pegged_to`,
        popularity: sql`excluded.popularity`,
      },
    });
  await db
    .insert(s.assetNetworks)
    .values(assetNetworks.map((a) => ({ assetSymbol: a.asset, blockchainSlug: a.chain })))
    .onConflictDoNothing({ target: [s.assetNetworks.assetSymbol, s.assetNetworks.blockchainSlug] });
  await db
    .insert(s.namedRails)
    .values(namedRails.map((r) => ({ ...r })))
    .onConflictDoUpdate({
      target: s.namedRails.code,
      set: {
        name: sql`excluded.name`,
        countryCode: sql`excluded.country_code`,
        category: sql`excluded.category`,
        description: sql`excluded.description`,
      },
    });

  const requirementRows = await db
    .insert(s.requirements)
    .values(
      requirementSpecs.map((r) => ({
        key: r.key,
        kind: r.kind as "kyc" | "kyb" | "technical",
        label: r.label,
        description: r.description,
        aliases: [...r.aliases],
      })),
    )
    .onConflictDoUpdate({
      target: s.requirements.key,
      set: {
        kind: sql`excluded.kind`,
        label: sql`excluded.label`,
        description: sql`excluded.description`,
        aliases: sql`excluded.aliases`,
      },
    })
    .returning({ id: s.requirements.id, key: s.requirements.key });
  const requirementByKey = new Map(requirementRows.map((r) => [r.key, r.id]));

  const providerIdBySlug = new Map<string, string>();
  let capabilityCount = 0;

  for (const spec of providerSpecs) {
    const verifiedAt = hoursAgo(spec.verifiedHoursAgo);

    const [provider] = await db
      .insert(s.providers)
      .values({
        slug: spec.slug,
        name: spec.name,
        isDemo: true,
        category: spec.category,
        description: spec.description,
        websiteUrl: `https://demo.railor.dev/providers/${spec.slug}`,
        docsUrl: `https://demo.railor.dev/providers/${spec.slug}/docs`,
        statusPageUrl: spec.sources.some((x) => x.type === "status_page")
          ? `https://demo.railor.dev/providers/${spec.slug}/status`
          : null,
        headquartersCountry: spec.headquarters,
        licensingSummary: spec.licensingSummary,
        hasApi: spec.hasApi,
        hasSandbox: spec.hasSandbox,
        hasWebhooks: spec.hasWebhooks,
        sdkLanguages: spec.sdkLanguages,
        advertisedSettlement: spec.advertisedSettlement,
        onboardingDays: spec.onboardingDays,
        lastVerifiedAt: verifiedAt,
      })
      .returning({ id: s.providers.id });
    const providerId = provider!.id;
    providerIdBySlug.set(spec.slug, providerId);

    await db.insert(s.providerProducts).values(
      spec.products.map((p) => ({
        providerId,
        product: p.product as never,
        name: p.name,
        description: p.description,
        availability: "supported" as const,
      })),
    );

    /* ---- sources + evidence ------------------------------------------- */
    const evidenceByType = new Map<string, string>();
    for (const src of spec.sources) {
      const [doc] = await db
        .insert(s.sourceDocuments)
        .values({
          providerId,
          url: src.url,
          title: src.title,
          sourceType: src.type as never,
          crawlFrequencyHours: src.type === "status_page" ? 1 : 24,
          parser: src.type === "api" ? "openapi" : "generic_html",
          requiresJs: src.requiresJs ?? false,
          lastCheckedAt: verifiedAt,
          nextCheckAt: hoursAgo(-24),
          contentHash: hash(src.url + spec.slug),
        })
        .returning({ id: s.sourceDocuments.id });

      const [snapshot] = await db
        .insert(s.sourceSnapshots)
        .values({
          sourceDocumentId: doc!.id,
          fetchedAt: verifiedAt,
          httpStatus: 200,
          contentHash: hash(src.url + spec.slug),
          storagePath: `snapshots/${spec.slug}/${hash(src.url)}.html`,
          extractedText: `${src.title} — demo snapshot captured for the Railor development dataset.`,
        })
        .returning({ id: s.sourceSnapshots.id });

      const base = SOURCE_BASE_CONFIDENCE[src.type as SourceType] ?? 0.6;
      const [ev] = await db
        .insert(s.evidence)
        .values({
          providerId,
          sourceDocumentId: doc!.id,
          snapshotId: snapshot!.id,
          sourceUrl: src.url,
          sourceTitle: src.title,
          sourceType: src.type as never,
          retrievedAt: verifiedAt,
          lastVerifiedAt: verifiedAt,
          confidence: base.toFixed(2),
          rawExcerpt: `${src.title}: demo excerpt describing ${spec.name}'s published position.`,
          rawHash: hash(src.url + src.title),
        })
        .returning({ id: s.evidence.id });
      evidenceByType.set(src.type, ev!.id);
    }

    const coverageEvidence =
      evidenceByType.get("official_docs") ?? [...evidenceByType.values()][0]!;
    const onboardingEvidence = evidenceByType.get("help_center") ?? coverageEvidence;
    const pricingEvidence = evidenceByType.get("pricing") ?? coverageEvidence;

    /* ---- capability facets --------------------------------------------- */
    const rows: (typeof s.providerCapabilities.$inferInsert)[] = [];
    const push = (
      row: Partial<typeof s.providerCapabilities.$inferInsert> & {
        product: ProductType;
        availability: Availability;
      },
    ) =>
      rows.push({
        providerId,
        evidenceId: coverageEvidence,
        lastVerifiedAt: verifiedAt,
        derivation: "source",
        ...row,
      });

    for (const p of spec.products) {
      const product = p.product;

      for (const c of spec.entity.supported)
        push({ product, entityCountry: c, customerType: "business", availability: "supported" });
      for (const c of spec.entity.partial ?? [])
        push({
          product,
          entityCountry: c,
          customerType: "business",
          availability: "partial",
          note: `${spec.name} accepts ${c}-incorporated businesses with additional documentation.`,
        });
      for (const c of spec.entity.unsupported ?? [])
        push({
          product,
          entityCountry: c,
          customerType: "business",
          availability: "unsupported",
          note: `${c}-incorporated businesses are not currently accepted for this product.`,
        });

      for (const t of spec.customerTypes)
        push({ product, customerType: t, availability: "supported" });

      for (const a of spec.assets) push({ product, sourceAsset: a, availability: "supported" });
      for (const n of spec.networks) push({ product, sourceNetwork: n, availability: "supported" });

      if (CORRIDOR_PRODUCTS.has(product)) {
        for (const corridor of spec.payouts) {
          for (const cur of corridor.currencies) {
            for (const method of corridor.methods) {
              push({
                product,
                destinationCountry: corridor.country,
                destinationCurrency: cur,
                paymentMethod: method,
                availability: corridor.availability ?? "supported",
                note: corridor.note,
              });
            }
          }
        }
      }
    }

    if (rows.length) {
      await db.insert(s.providerCapabilities).values(rows);
      capabilityCount += rows.length;
    }

    /* ---- requirements, fees, limits ------------------------------------ */
    await db.insert(s.providerRequirements).values(
      spec.requirements.map((r) => ({
        providerId,
        requirementId: requirementByKey.get(r.key)!,
        customerType: "business" as const,
        entityCountry: r.entityCountry ?? null,
        mandatory: r.mandatory ?? true,
        note: r.note ?? null,
        evidenceId: onboardingEvidence,
        lastVerifiedAt: verifiedAt,
      })),
    );

    if (spec.fees.length)
      await db.insert(s.fees).values(
        spec.fees.map((f) => ({
          providerId,
          product: f.product as never,
          destinationCurrency: f.currency ?? null,
          percentBps: f.percentBps ?? null,
          fixedAmount: f.fixed !== undefined ? f.fixed.toFixed(2) : null,
          fixedCurrency: f.fixedCurrency ?? null,
          fxSpreadBps: f.fxSpreadBps ?? null,
          summary: f.summary,
          evidenceId: pricingEvidence,
          lastVerifiedAt: verifiedAt,
        })),
      );

    if (spec.limits.length)
      await db.insert(s.limits).values(
        spec.limits.map((l) => ({
          providerId,
          product: l.product as never,
          customerType: "business" as const,
          currency: l.currency,
          minAmount: l.min !== undefined ? l.min.toFixed(2) : null,
          maxAmount: l.max !== undefined ? l.max.toFixed(2) : null,
          monthlyMax: l.monthly !== undefined ? l.monthly.toFixed(2) : null,
          summary: l.summary,
          evidenceId: coverageEvidence,
          lastVerifiedAt: verifiedAt,
        })),
      );

    /* ---- health + observations (benchmark tables, lightly populated) ---- */
    await db.insert(s.healthChecks).values(
      Array.from({ length: 6 }, (_, i) => ({
        providerId,
        checkedAt: hoursAgo(i * 4),
        ok: !(spec.slug === "halcyon-clearing" && i < 2),
        latencyMs: 180 + ((spec.slug.length * (i + 3)) % 400),
        statusText:
          spec.slug === "halcyon-clearing" && i < 2 ? "Settlement delays reported" : "Operational",
      })),
    );

    /* ---- conformance test catalog (architecture only — zero runs seeded) -- */
    const kinds: string[] = [];
    if (spec.hasApi) kinds.push(...API_TEST_KINDS);
    if (spec.hasSandbox) kinds.push("sandbox_reachable");
    if (spec.hasWebhooks) kinds.push("webhook_signature", "webhook_delivery", "webhook_retry");
    if (kinds.length) {
      await db.insert(s.conformanceTests).values(
        kinds.map((kind) => ({
          providerId,
          kind: kind as never,
          label: CONFORMANCE_LABELS[kind] ?? kind,
        })),
      );
    }
  }

  /* ---- change events --------------------------------------------------- */
  for (const c of changeSpecs) {
    const providerId = providerIdBySlug.get(c.provider);
    if (!providerId) continue;
    await db.insert(s.changeEvents).values({
      providerId,
      kind: c.kind as never,
      field: c.field,
      previousValue: c.previousValue,
      currentValue: c.currentValue,
      summary: c.summary,
      detectedAt: hoursAgo(c.hoursAgo),
      confidence: c.confidence.toFixed(2),
      reviewStatus: c.reviewStatus as never,
      // Each literal in changeSpecs has a different subset of affects keys,
      // so TS infers a union of narrow shapes rather than Record<string,
      // string> — the column's actual type. Every entry is a flat string map.
      affects: c.affects as Record<string, string>,
    });
  }

  return {
    providers: providerSpecs.length,
    capabilities: capabilityCount,
    changes: changeSpecs.length,
    countries: countries.length,
    assets: assets.length,
    blockchains: blockchains.length,
    namedRails: namedRails.length,
  };
}

async function main() {
  const { driver, close } = await getDbHandle();
  console.log(`▸ seeding via ${driver}`);
  const summary = await seedDemoData();
  console.log(
    `✓ seeded ${summary.providers} demo providers · ${summary.capabilities} capability rows · ` +
      `${summary.changes} change events · ${summary.countries} countries · ` +
      `${summary.assets} assets · ${summary.blockchains} networks · ${summary.namedRails} named rails`,
  );
  await close();
}

// Only run as a side effect when this file is executed directly (`pnpm
// db:seed` / `tsx src/seed/run.ts`) — never when `seedDemoData` is imported,
// e.g. from @railor/database's index or from a test's own setup. Without
// this guard, importing the package would silently truncate and reseed
// every provider table as an import side effect.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
