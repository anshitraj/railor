import "./dev-env.js";
import { databaseTargetLabel, getDbHandle, isLocalDatabaseUrl, pendingMigrations } from "./client.js";

/**
 * `pnpm db:migrate` — applies pending migrations deliberately.
 *
 * A hosted database (anything that isn't PGlite or a Postgres on this
 * machine) requires `--confirm-remote`, so pointing DATABASE_URL at
 * production and running the wrong script can't change its schema by
 * accident. `--dry-run` lists what would be applied and exits.
 */
async function main() {
  const args = new Set(process.argv.slice(2));
  const target = databaseTargetLabel();
  const handle = await getDbHandle();
  const pending = await pendingMigrations(handle);
  console.log(`Target: ${target} (${handle.driver})`);
  if (!pending.length) {
    console.log("✓ nothing to apply — schema is current");
    await handle.close();
    return;
  }
  console.log(`Pending (${pending.length}): ${pending.join(", ")}`);
  if (args.has("--dry-run")) {
    await handle.close();
    return;
  }
  if (!isLocalDatabaseUrl(process.env.DATABASE_URL) && !args.has("--confirm-remote")) {
    console.error(
      "Refusing to migrate a hosted database without --confirm-remote. Back it up first, then run: pnpm db:migrate -- --confirm-remote",
    );
    await handle.close();
    process.exit(2);
  }
  await handle.migrate();
  console.log(`✓ applied ${pending.length} migration(s) via ${handle.driver}`);
  await handle.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
