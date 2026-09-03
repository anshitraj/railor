/**
 * Drops every Railor table and re-applies migrations. Destructive by design —
 * used in development when the schema changes shape.
 *
 *   pnpm db:reset && pnpm db:seed
 *
 * Refuses to run against a non-local DATABASE_URL unless
 * RAILOR_CONFIRM_DESTRUCTIVE_RESET is set to the exact connection string
 * being targeted. A warning is not a safeguard — this codebase learned that
 * lesson the hard way with seed/run.ts's old blanket TRUNCATE CASCADE (see
 * that file's history). Re-pasting the full URL, credentials included, into
 * a second variable is a deliberate, hard-to-do-by-accident action; no
 * unset/PGlite/localhost path is ever blocked, since none of those can
 * contain real customer data.
 */
import "../dev-env.js";
import { sql } from "drizzle-orm";
import { getDbHandle } from "../client.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** Exported for the test suite — pure, no I/O, no process.exit. */
export function assertResetIsSafe(databaseUrl: string | undefined, confirmation: string | undefined): void {
  if (!databaseUrl) return; // unset -> embedded PGlite, never real customer data.
  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error(`RAILOR_RESET_REFUSED: DATABASE_URL is not a parseable URL — refusing to guess whether it is safe to reset.`);
  }
  if (LOCAL_HOSTS.has(host)) return;

  if (confirmation !== databaseUrl) {
    throw new Error(
      `RAILOR_RESET_REFUSED: DATABASE_URL points at a non-local host ("${host}") — this looks like a remote/production database. ` +
        `db:reset permanently deletes every table's data, real and demo alike. ` +
        `To proceed anyway, set RAILOR_CONFIRM_DESTRUCTIVE_RESET to the exact same value as DATABASE_URL (not just "yes" — the full connection string), ` +
        `so this can never be satisfied by an old, generic "I'm sure" flag left over from a different database.`,
    );
  }
}

async function main() {
  assertResetIsSafe(process.env.DATABASE_URL?.trim() || undefined, process.env.RAILOR_CONFIRM_DESTRUCTIVE_RESET?.trim() || undefined);

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
