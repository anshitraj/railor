/**
 * Real entity/customer-eligibility evidence for Ramp Network, sourced from
 * Ramp's own official help-center article (a live fetch of its embedded
 * article-body JSON, not a manual transcription):
 *   https://support.rampnetwork.com/en/articles/433-which-countries-and-us-states-are-unsupported-for-buying-and-selling-crypto
 *   Published 2026-06-17. "Our services are not available for customers in
 *   the following countries and territories: [141 countries/territories]."
 *
 * This is a genuinely different fact from route confirmation (see
 * ramp-network-route-import.ts): it says nothing about which asset/network
 * settles into which currency/rail, only whether Ramp will serve a customer
 * from a given country at all — exactly the "entity eligibility" concept
 * this session's evidence-model change tracks separately. Inserted into
 * provider_capabilities with every route dimension left null, so this row
 * can never be mistaken for (or joined into) an atomic route fact.
 *
 * Germany is not named anywhere in the 141-country denylist, and Ramp's own
 * live host-api v3 already lists Germany as an active EUR/SEPA payout
 * destination (see ramp-network-route-import.ts's real, live-fetched rows)
 * - two independent, genuine signals pointing the same direction. The one
 * honest caveat, disclosed in this row's own note: the article separately
 * states that in some *unnamed* countries/territories Ramp allows buying
 * only, not selling - Germany is not named in that context either way, so
 * this is a well-evidenced but not airtight "supported," not a certainty.
 *
 * China and Nigeria are both explicitly named in the denylist - included so
 * the negative (entity_eligibility = "unsupported") path is exercised
 * against real data too, not only synthetic test fixtures.
 *
 * Idempotent: re-running skips rows that already exist for the same
 * (provider, product, entityCountry) pair.
 *
 *   pnpm --filter @railor/database ramp-network-entity-eligibility
 */
import "../dev-env.js";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { getDb, getDbHandle } from "../client.js";
import * as s from "../schema.js";

const now = () => new Date();
const hash = (v: string) => createHash("sha256").update(v).digest("hex");

const ARTICLE_URL = "https://support.rampnetwork.com/en/articles/433-which-countries-and-us-states-are-unsupported-for-buying-and-selling-crypto";

const RAW_EXCERPT =
  'Ramp Network help center, published 2026-06-17: "Our services are not available for customers in the following countries and territories" - a named list of 141 countries/territories including Afghanistan, Algeria, Angola, Armenia, Bahamas, Belarus, China, Cuba, Iran, Iraq, Nigeria, North Korea, Russia, Saudi Arabia, Syria, Venezuela, Yemen, and 124 others (verbatim list retrieved from the article\'s own embedded content, not summarized). Separately: "In some countries and territories, we may provide limited services and allow for crypto purchases only" (the specific subset is not named). Germany does not appear in the 141-country denylist. Corroborating: Ramp Network\'s live host-api v3 (see ramp-network-route-import.ts, same session) already lists Germany as a real, currently-operational EUR/SEPA off-ramp payout destination - a payments network is very unlikely to actively pay out to a country whose customers it cannot legally serve. Absence from the denylist plus live operational payout infrastructure both point the same direction, but the unnamed "buy-only" carve-out means this is well-evidenced, not certain.';

const CN_EXCERPT =
  'Ramp Network help center, published 2026-06-17: "Our services are not available for customers in the following countries and territories" - China is explicitly named in this list.';
const NG_EXCERPT =
  'Ramp Network help center, published 2026-06-17: "Our services are not available for customers in the following countries and territories" - Nigeria is explicitly named in this list.';

interface EntityEligibilityRow {
  entityCountry: string;
  availability: "supported" | "unsupported";
  note: string;
  excerpt: string;
  confidence: string;
}

const ROWS: EntityEligibilityRow[] = [
  {
    entityCountry: "DE",
    availability: "supported",
    note: "Germany does not appear in Ramp Network's published 141-country/territory denylist for buying and selling crypto (retrieved 2026-09-03; article published 2026-06-17), and Ramp's live host-api v3 already operates EUR/SEPA off-ramp payouts to Germany - see ramp-network-route-import.ts. The article separately mentions an unnamed buy-only subset that this evidence cannot rule out for any specific country, Germany included.",
    excerpt: RAW_EXCERPT,
    confidence: "0.85",
  },
  {
    entityCountry: "CN",
    availability: "unsupported",
    note: "China is explicitly named in Ramp Network's published unsupported-countries list (retrieved 2026-09-03; article published 2026-06-17).",
    excerpt: CN_EXCERPT,
    confidence: "0.95",
  },
  {
    entityCountry: "NG",
    availability: "unsupported",
    note: "Nigeria is explicitly named in Ramp Network's published unsupported-countries list (retrieved 2026-09-03; article published 2026-06-17).",
    excerpt: NG_EXCERPT,
    confidence: "0.95",
  },
];

export async function runRampEntityEligibilityImport() {
  const db = await getDb();

  const [providerRow] = await db.select({ id: s.providers.id }).from(s.providers).where(eq(s.providers.slug, "ramp-network")).limit(1);
  if (!providerRow) throw new Error("ramp-network provider must already exist");
  const providerId = providerRow.id;

  const [doc] = await db
    .insert(s.sourceDocuments)
    .values({ providerId, url: ARTICLE_URL, title: "Ramp Network Help Center — Which countries and US states are unsupported for buying and selling crypto?", sourceType: "official_docs", crawlFrequencyHours: 24 * 30, parser: "help_center_article", lastCheckedAt: now() })
    .onConflictDoNothing({ target: [s.sourceDocuments.providerId, s.sourceDocuments.url] })
    .returning({ id: s.sourceDocuments.id });
  const docId = doc?.id ?? (await db.select({ id: s.sourceDocuments.id }).from(s.sourceDocuments).where(eq(s.sourceDocuments.url, ARTICLE_URL)).limit(1))[0]!.id;

  const existing = await db
    .select({ entityCountry: s.providerCapabilities.entityCountry })
    .from(s.providerCapabilities)
    .where(and(eq(s.providerCapabilities.providerId, providerId), eq(s.providerCapabilities.product, "off_ramp")));
  const existingCountries = new Set(existing.map((r) => r.entityCountry));

  const created: string[] = [];
  const skipped: string[] = [];

  for (const row of ROWS) {
    if (existingCountries.has(row.entityCountry)) {
      skipped.push(row.entityCountry);
      continue;
    }

    const rawHash = hash(ARTICLE_URL + row.entityCountry + row.excerpt);
    const [existingEvidence] = await db.select({ id: s.evidence.id }).from(s.evidence).where(eq(s.evidence.rawHash, rawHash)).limit(1);
    const evidenceId =
      existingEvidence?.id ??
      (
        await db
          .insert(s.evidence)
          .values({
            providerId,
            sourceDocumentId: docId,
            sourceUrl: ARTICLE_URL,
            sourceTitle: "Ramp Network Help Center — Which countries and US states are unsupported for buying and selling crypto?",
            sourceType: "official_docs",
            verificationType: "provider_reported",
            retrievedAt: now(),
            lastVerifiedAt: now(),
            confidence: row.confidence,
            rawExcerpt: row.excerpt,
            rawHash,
          })
          .returning({ id: s.evidence.id })
      )[0]!.id;

    await db.insert(s.providerCapabilities).values({
      providerId,
      product: "off_ramp",
      entityCountry: row.entityCountry,
      availability: row.availability,
      note: row.note,
      derivation: "source",
      evidenceId,
      lastVerifiedAt: now(),
    });
    created.push(row.entityCountry);
  }

  return { created, skipped };
}

async function main() {
  const { close } = await getDbHandle();
  try {
    console.log(JSON.stringify(await runRampEntityEligibilityImport(), null, 2));
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
