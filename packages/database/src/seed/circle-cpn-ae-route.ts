/**
 * Circle's first atomic provider_routes row for AE — previously zero, for any
 * real provider. Source: Circle's own blog announcing new Circle Payments
 * Network (CPN) payout corridors. One paragraph names the destination country
 * (UAE), the settlement currency (AED) and the specific local rail (FTS) in a
 * single coherent statement about CPN — the network whose entire identity is
 * stablecoin (USDC)-funded settlement, per the same article's own framing
 * ("modernize cross-border payments using stablecoins like USDC"). That's why
 * sourceAsset is set here rather than left null, unlike destinationEndpointType
 * and customerType/entityCountry, which this article never states and are
 * left null rather than guessed.
 *
 *   pnpm --filter @railor/database circle-cpn-ae-route
 */
import "../dev-env.js";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, getDbHandle } from "../client.js";
import * as s from "../schema.js";

const hash = (v: string) => createHash("sha256").update(v).digest("hex");

const SOURCE_URL =
  "https://www.circle.com/blog/circle-payments-network-expands-local-currency-payout-corridors-across-asia-the-middle-east-europe-and-the-us";
const QUOTE =
  "United Arab Emirates: LuLu enables trusted local payouts. CPN has expanded into the United Arab Emirates through LuLu Financial Holdings, a leading regional financial services provider with expertise in local payments infrastructure. This new corridor enables AED payouts using FTS payment rails and strengthens CPN's presence in the Middle East market, supporting use cases such as enterprise disbursements, remittances, and cross-border commerce.";

export async function bootstrap(): Promise<string[]> {
  const db = await getDb();
  const log: string[] = [];

  const [circle] = await db.select().from(s.providers).where(eq(s.providers.slug, "circle")).limit(1);
  if (!circle) {
    log.push("circle provider not found — expected it to already exist");
    return log;
  }

  const rawHash = hash(SOURCE_URL + QUOTE);
  let [evidenceRow] = await db
    .select()
    .from(s.evidence)
    .where(and(eq(s.evidence.providerId, circle.id), eq(s.evidence.rawHash, rawHash)))
    .limit(1);

  if (!evidenceRow) {
    const now = new Date();
    const [inserted] = await db
      .insert(s.evidence)
      .values({
        providerId: circle.id,
        sourceUrl: SOURCE_URL,
        sourceTitle: "CPN Expands Local Currency Payout Corridors | Circle",
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

  const [existingRoute] = await db
    .select()
    .from(s.providerRoutes)
    .where(
      and(
        eq(s.providerRoutes.providerId, circle.id),
        eq(s.providerRoutes.sourceAsset, "USDC"),
        eq(s.providerRoutes.destinationCountry, "AE"),
        isNull(s.providerRoutes.sourceNetwork),
      ),
    )
    .limit(1);
  if (existingRoute) {
    log.push("already exists: USDC -> AE/AED route");
    return log;
  }

  await db.insert(s.providerRoutes).values({
    providerId: circle.id,
    product: "off_ramp",
    sourceAsset: "USDC",
    sourceNetwork: null,
    destinationCountry: "AE",
    destinationCurrency: "AED",
    destinationEndpointType: null,
    availability: "supported",
    note: `Circle's own CPN announcement: "${QUOTE}" Names UAE, AED and the FTS rail together; does not state a specific receiving endpoint type or any entity-country restriction, so those stay unconfirmed rather than guessed.`,
    evidenceId: evidenceRow.id,
    lastVerifiedAt: new Date(),
  });
  log.push("created: USDC -> AE/AED route (off_ramp), destinationEndpointType=null, entityCountry=null");

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
