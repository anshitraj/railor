/**
 * One real, evidence-backed capability for Nium: USDC-funded fiat payouts.
 *
 * Source (Nium's own blog, announcing the product): "Starting today, Nium
 * enables businesses to fund payouts in USDC and pay out in fiat, anywhere in
 * the world... your payout lands in local currency in 190+ countries." That
 * statement names the source asset (USDC) and the product (fund-in-stablecoin,
 * payout-in-fiat) but never names a specific destination country/currency —
 * so this is recorded as a provider_capabilities row with destinationCountry
 * and destinationCurrency left at their NULL/wildcard meaning ("applies to
 * any value of that dimension" per this table's own schema comment), not
 * synthesized into an atomic provider_routes row naming AE/AED. Nium's
 * existing AE/AED receiving_endpoints and provider_capabilities rows already
 * establish the destination side independently; combining that with this
 * evidence into one atomic route would be exactly the cross-row inference
 * provider_routes' schema comment forbids. The eligibility engine can (and
 * should) score these as independent, partially-confirming facts instead.
 *
 * Insert-only, like receiving-endpoints.ts — carries is_demo: false, so it's
 * never touched by seedDemoData's demo-provider delete.
 *
 *   pnpm --filter @railor/database nium-usdc-payout
 */
import "../dev-env.js";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { getDb, getDbHandle } from "../client.js";
import * as s from "../schema.js";

const hash = (v: string) => createHash("sha256").update(v).digest("hex");

const SOURCE_URL = "https://www.nium.com/blog/usdc-funding-global-payouts";
const QUOTE =
  "Starting today, Nium enables businesses to fund payouts in USDC and pay out in fiat, anywhere in the world. No crypto licenses or flows to manage.";

export async function bootstrap(): Promise<string[]> {
  const db = await getDb();
  const log: string[] = [];

  const [nium] = await db.select().from(s.providers).where(eq(s.providers.slug, "nium")).limit(1);
  if (!nium) {
    log.push("nium provider not found — expected it to already exist");
    return log;
  }

  const rawHash = hash(SOURCE_URL + QUOTE);
  let [evidenceRow] = await db
    .select()
    .from(s.evidence)
    .where(and(eq(s.evidence.providerId, nium.id), eq(s.evidence.rawHash, rawHash)))
    .limit(1);

  if (!evidenceRow) {
    const now = new Date();
    const [inserted] = await db
      .insert(s.evidence)
      .values({
        providerId: nium.id,
        sourceUrl: SOURCE_URL,
        sourceTitle: "Fund in USDC, pay the world: Nium launches stablecoin funding",
        sourceType: "official_announcement",
        retrievedAt: now,
        lastVerifiedAt: now,
        confidence: "0.95",
        rawExcerpt: QUOTE,
        rawHash,
      })
      .returning();
    evidenceRow = inserted!;
    log.push("created evidence row");
  } else {
    log.push("evidence row already exists");
  }

  const [existingCap] = await db
    .select()
    .from(s.providerCapabilities)
    .where(
      and(
        eq(s.providerCapabilities.providerId, nium.id),
        eq(s.providerCapabilities.product, "payout"),
        eq(s.providerCapabilities.sourceAsset, "USDC"),
      ),
    )
    .limit(1);
  if (existingCap) {
    log.push("capability already exists: payout sourceAsset=USDC");
    return log;
  }

  await db.insert(s.providerCapabilities).values({
    providerId: nium.id,
    product: "payout",
    customerType: "business",
    sourceAsset: "USDC",
    availability: "supported",
    derivation: "source",
    note: QUOTE,
    evidenceId: evidenceRow.id,
    lastVerifiedAt: new Date(),
  });
  log.push("created: payout capability, sourceAsset=USDC, destination left NULL (wildcard, not evidenced per-country here)");

  return log;
}

async function main() {
  const { close } = await getDbHandle();
  for (const line of await bootstrap()) console.log(line);
  await close();
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
