/**
 * Wallet seed: test promo codes for local and preview databases.
 *
 * Real promo codes (amounts, caps, windows) are a business decision and are
 * created deliberately, not by a seed. These codes are labelled as tests and
 * are never inserted into a production database.
 *
 *   pnpm --filter @railor/database wallet-promo-codes
 */
import "../dev-env.js";
import { fileURLToPath } from "node:url";
import { getDbHandle, isLocalDatabaseUrl, type RailorDb } from "../client.js";
import { walletPromoCodes } from "../schema.js";

export const TEST_PROMO_CODES = [
  { code: "RAILOR-TEST", amountCents: 1000, label: "Test code: $10.00 of credit", maxRedemptions: null },
  { code: "TEST-ONCE", amountCents: 200, label: "Test code: $2.00, first workspace only", maxRedemptions: 1 },
] as const;

/** Idempotent: existing codes are left as they are. */
export async function seedWalletPromoCodes(db: RailorDb): Promise<number> {
  const rows = await db
    .insert(walletPromoCodes)
    .values(TEST_PROMO_CODES.map((c) => ({ ...c })))
    .onConflictDoNothing()
    .returning({ code: walletPromoCodes.code });
  return rows.length;
}

async function main() {
  if (process.env.NODE_ENV === "production" || !isLocalDatabaseUrl(process.env.DATABASE_URL)) {
    console.error("Refusing to seed test promo codes into a hosted database.");
    process.exit(2);
  }
  const handle = await getDbHandle();
  await handle.migrate();
  const added = await seedWalletPromoCodes(handle.db);
  console.log(`✓ ${added} test promo code(s) added (${TEST_PROMO_CODES.map((c) => c.code).join(", ")})`);
  await handle.close();
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
