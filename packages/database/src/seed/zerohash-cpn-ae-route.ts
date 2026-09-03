/**
 * Zero Hash's second atomic provider_routes row proof for AE (Circle's was
 * the first). Source: Zero Hash's own "Stablecoin Sandwich" remittance docs —
 * "Send funds in one currency... and deliver in another... using stablecoins
 * (ie, USDC) as an intermediary" and "zerohash enables instant fiat payouts
 * to over 130 countries... including... the Middle East (ie, UAE, Saudi
 * Arabia)." Names UAE and USDC in one document, but never states AED
 * specifically — only the country. Some UAE payout rows elsewhere in this
 * dataset land in USD rather than AED, so destinationCurrency is left null
 * rather than assumed; a query asking for AED specifically will correctly
 * not match this row until a source states the settlement currency.
 *
 *   pnpm --filter @railor/database zerohash-cpn-ae-route
 */
import "../dev-env.js";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, getDbHandle } from "../client.js";
import * as s from "../schema.js";

const hash = (v: string) => createHash("sha256").update(v).digest("hex");

const SOURCE_URL = "https://docs.zerohash.com/docs/fiat-remittances-stablecoin-sandwhich";
const QUOTE =
  "Efficient cross-border payouts: Send funds in one currency (ie, USD) and deliver in another (ie, ARS) using stablecoins (ie, USDC) as an intermediary for speed and cost-efficiency. zerohash enables instant fiat payouts to over 130 countries across all major regions—including Latin America (ie, Brazil, Mexico, Colombia), Africa (ie, Nigeria, Kenya, South Africa), Asia-Pacific (ie, India, Philippines, Indonesia), the Middle East (ie, UAE, Saudi Arabia), and Europe (ie, Netherlands, Germany, Poland).";

export async function bootstrap(): Promise<string[]> {
  const db = await getDb();
  const log: string[] = [];

  const [zerohash] = await db.select().from(s.providers).where(eq(s.providers.slug, "zero-hash")).limit(1);
  if (!zerohash) {
    log.push("zero-hash provider not found — expected it to already exist");
    return log;
  }

  const rawHash = hash(SOURCE_URL + QUOTE);
  let [evidenceRow] = await db
    .select()
    .from(s.evidence)
    .where(and(eq(s.evidence.providerId, zerohash.id), eq(s.evidence.rawHash, rawHash)))
    .limit(1);

  if (!evidenceRow) {
    const now = new Date();
    const [inserted] = await db
      .insert(s.evidence)
      .values({
        providerId: zerohash.id,
        sourceUrl: SOURCE_URL,
        sourceTitle: "Remittances - Stablecoin Sandwich | Zero Hash",
        sourceType: "official_docs",
        retrievedAt: now,
        lastVerifiedAt: now,
        confidence: "0.9",
        rawExcerpt: QUOTE,
        rawHash,
      })
      .returning();
    evidenceRow = inserted!;
    log.push("created evidence row");
  } else {
    log.push("evidence row already exists");
  }

  const [existingRoute] = await db
    .select()
    .from(s.providerRoutes)
    .where(
      and(
        eq(s.providerRoutes.providerId, zerohash.id),
        eq(s.providerRoutes.sourceAsset, "USDC"),
        eq(s.providerRoutes.destinationCountry, "AE"),
        isNull(s.providerRoutes.sourceNetwork),
      ),
    )
    .limit(1);
  if (existingRoute) {
    log.push("already exists: USDC -> AE route");
    return log;
  }

  await db.insert(s.providerRoutes).values({
    providerId: zerohash.id,
    product: "off_ramp",
    sourceAsset: "USDC",
    sourceNetwork: null,
    destinationCountry: "AE",
    destinationCurrency: null,
    destinationEndpointType: null,
    availability: "supported",
    note: `Zero Hash's own "Stablecoin Sandwich" docs: "${QUOTE}" Names UAE and USDC together; does not state a settlement currency, receiving endpoint type, or entity-country restriction, so those stay unconfirmed rather than guessed (some UAE payout facts elsewhere in this dataset settle in USD, not AED).`,
    evidenceId: evidenceRow.id,
    lastVerifiedAt: new Date(),
  });
  log.push("created: USDC -> AE route (off_ramp), destinationCurrency=null, destinationEndpointType=null, entityCountry=null");

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
