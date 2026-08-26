/**
 * Drops every Railor table and re-applies migrations. Destructive by design —
 * used in development when the schema changes shape.
 *
 *   pnpm db:reset && pnpm db:seed
 */
import "../dev-env.js";
import { sql } from "drizzle-orm";
import { getDbHandle } from "../client.js";

async function main() {
  const { db, driver, migrate, close } = await getDbHandle();
  console.log(`▸ resetting schema via ${driver}`);
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`create schema public`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await migrate();
  console.log("✓ schema reset and migrations applied");
  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
