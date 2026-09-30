/**
 * PayZoll — a new cross-border payments platform (fiat + stablecoins),
 * recorded from its own site (payzoll.finance, read 2026-09-27):
 *
 *   "just 1% per transfer, with no hidden FX markups"
 *
 * Products the site names: collections from clients worldwide in USDC, USDT
 * and 50+ fiat currencies settled into an Indian bank account with FIRA
 * (individual and business accounts), and a global payroll product paying
 * teams and vendors in 80+ countries. It publishes no API, so `has_api` stays
 * false and nothing here claims a corridor-level capability — the site gives
 * no per-country evidence. Price check applies its published 1% only to money
 * arriving in India (see packages/core/src/pricing.ts).
 *
 * Insert-only, is_demo: false (never touched by seedDemoData's demo delete).
 *
 *   pnpm --filter @railor/database payzoll
 */
import "../dev-env.js";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { getDb, getDbHandle } from "../client.js";
import * as s from "../schema.js";

const hash = (v: string) => createHash("sha256").update(v).digest("hex");

const SOURCE_URL = "https://payzoll.finance/";
const QUOTE = "just 1% per transfer, with no hidden FX markups";

export async function bootstrap(): Promise<string[]> {
  const db = await getDb();
  const log: string[] = [];

  let [payzoll] = await db.select().from(s.providers).where(eq(s.providers.slug, "payzoll")).limit(1);
  if (!payzoll) {
    [payzoll] = await db
      .insert(s.providers)
      .values({
        slug: "payzoll",
        name: "PayZoll",
        isDemo: false,
        category: "Cross-border payments",
        description:
          "Collections in stablecoins (USDC, USDT) and 50+ fiat currencies settled into Indian bank accounts with FIRA, plus global payroll payouts to 80+ countries. Publishes 1% per transfer with no FX markup.",
        websiteUrl: "https://payzoll.finance",
        hasApi: false,
        apiAccess: "none",
        lastVerifiedAt: new Date("2026-09-27T00:00:00Z"),
      })
      .returning();
    log.push("created provider: payzoll");
  } else {
    log.push("provider already exists: payzoll");
  }

  const rawHash = hash(SOURCE_URL + QUOTE);
  const [existingEvidence] = await db
    .select()
    .from(s.evidence)
    .where(and(eq(s.evidence.providerId, payzoll!.id), eq(s.evidence.rawHash, rawHash)))
    .limit(1);
  if (!existingEvidence) {
    await db.insert(s.evidence).values({
      providerId: payzoll!.id,
      sourceUrl: SOURCE_URL,
      sourceTitle: "PayZoll — Pay Anyone. Pay Anywhere. (pricing)",
      sourceType: "pricing",
      retrievedAt: new Date("2026-09-27T00:00:00Z"),
      lastVerifiedAt: new Date("2026-09-27T00:00:00Z"),
      confidence: "0.9",
      rawExcerpt: QUOTE,
      rawHash,
    });
    log.push("created evidence row (pricing)");
  } else {
    log.push("evidence row already exists");
  }

  for (const product of [
    { product: "collection" as const, name: "Global collections", description: "Receive from clients worldwide in USDC, USDT and 50+ fiat currencies; settled in INR with FIRA." },
    { product: "payout" as const, name: "Global payroll", description: "Pay employees, contractors and vendors in 80+ countries from a USDC, USDT or fiat deposit." },
  ]) {
    const [existing] = await db
      .select()
      .from(s.providerProducts)
      .where(and(eq(s.providerProducts.providerId, payzoll!.id), eq(s.providerProducts.product, product.product)))
      .limit(1);
    if (existing) {
      log.push(`product already exists: ${product.product}`);
      continue;
    }
    await db.insert(s.providerProducts).values({ providerId: payzoll!.id, ...product });
    log.push(`created product: ${product.product}`);
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
