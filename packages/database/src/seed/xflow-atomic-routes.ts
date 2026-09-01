/**
 * Two atomic, evidence-backed provider_routes for Xflow — not inferred from
 * receiving_endpoints (which deliberately left incoming_asset null on that
 * row rather than guess), but created here because Xflow's own evidence
 * directly proves both assets independently: "Buyers pay in USDC or USDT,
 * funds convert offshore into USD, and only fiat is settled into India" —
 * one sentence, both tickers named, same destination. sourceNetwork stays
 * null on both: the statement never pairs a specific asset with a specific
 * network (Solana/Tron/EVM are named as a set, not per-asset), so pairing
 * one in would be exactly the unsupported inference this table's own schema
 * comment warns against.
 *
 *   pnpm --filter @railor/database xflow-routes
 */
import "dotenv/config";
import { fileURLToPath } from "node:url";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, getDbHandle } from "../client.js";
import * as s from "../schema.js";

export async function bootstrap(): Promise<string[]> {
  const db = await getDb();
  const log: string[] = [];

  const [xflow] = await db.select().from(s.providers).where(eq(s.providers.slug, "xflow")).limit(1);
  if (!xflow) {
    log.push("xflow provider not found — run receiving-endpoints seed first");
    return log;
  }

  const [evidenceRow] = await db
    .select()
    .from(s.evidence)
    .where(
      and(
        eq(s.evidence.providerId, xflow.id),
        eq(s.evidence.sourceUrl, "https://www.xflowpay.com/products/stablecoins"),
      ),
    )
    .limit(1);
  if (!evidenceRow) {
    log.push("no matching Xflow evidence row found — nothing to cite, refusing to create unbacked routes");
    return log;
  }

  for (const asset of ["USDC", "USDT"] as const) {
    const [existing] = await db
      .select()
      .from(s.providerRoutes)
      .where(
        and(
          eq(s.providerRoutes.providerId, xflow.id),
          eq(s.providerRoutes.sourceAsset, asset),
          eq(s.providerRoutes.destinationCountry, "IN"),
          isNull(s.providerRoutes.sourceNetwork),
        ),
      )
      .limit(1);
    if (existing) {
      log.push(`already exists: ${asset} -> IN/INR`);
      continue;
    }

    await db.insert(s.providerRoutes).values({
      providerId: xflow.id,
      product: "off_ramp",
      customerType: "business",
      sourceAsset: asset,
      sourceNetwork: null,
      destinationCountry: "IN",
      destinationCurrency: "INR",
      destinationEndpointType: "bank_account",
      availability: "supported",
      note: `Xflow's own product page: "Buyers pay in USDC or USDT, funds convert offshore into USD, and only fiat is settled into India." Proves ${asset} specifically by name; does not name a specific network for it, so sourceNetwork is left null rather than paired with one of the three networks (Solana, Tron, EVM) mentioned elsewhere on the same page.`,
      evidenceId: evidenceRow.id,
      lastVerifiedAt: new Date(),
    });
    log.push(`created: ${asset} -> IN/INR (bank_account, off_ramp), sourceNetwork=null`);
  }

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
