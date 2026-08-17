/**
 * Database client.
 *
 * Two drivers, one API:
 *   - DATABASE_URL set   → real Postgres (docker compose, Neon, Supabase, RDS)
 *   - DATABASE_URL unset → embedded Postgres (PGlite) under .railor/pglite
 *
 * The embedded default exists so `pnpm dev` works on a fresh clone with no
 * containers, no accounts and no configuration. Same SQL, same migrations.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema.js";

export type RailorDb = PgDatabase<any, typeof schema, any>;

export interface DbHandle {
  db: RailorDb;
  driver: "postgres" | "pglite";
  /** Applies pending migrations from packages/database/drizzle. */
  migrate: () => Promise<void>;
  close: () => Promise<void>;
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsFolder = path.join(packageRoot, "drizzle");

export function embeddedDataDir(): string {
  return (
    process.env.PGLITE_DATA_DIR ??
    path.resolve(packageRoot, "..", "..", ".railor", "pglite")
  );
}

async function createHandle(): Promise<DbHandle> {
  const url = process.env.DATABASE_URL?.trim();

  if (url) {
    const [{ default: pg }, { drizzle }, { migrate }] = await Promise.all([
      import("pg"),
      import("drizzle-orm/node-postgres"),
      import("drizzle-orm/node-postgres/migrator"),
    ]);
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    const db = drizzle(pool, { schema, casing: "snake_case" }) as unknown as RailorDb;
    return {
      db,
      driver: "postgres",
      migrate: () => migrate(db as never, { migrationsFolder }),
      close: () => pool.end(),
    };
  }

  const [{ PGlite }, { drizzle }, { migrate }, fs] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
    import("node:fs"),
  ]);
  const dataDir = embeddedDataDir();
  // PGlite creates the leaf directory but not its parents.
  fs.mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema, casing: "snake_case" }) as unknown as RailorDb;
  return {
    db,
    driver: "pglite",
    migrate: () => migrate(db as never, { migrationsFolder }),
    close: () => client.close(),
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __railorDb: Promise<DbHandle> | undefined;
}

/** Cached across Next.js hot reloads so PGlite's file lock is held once. */
export function getDbHandle(): Promise<DbHandle> {
  globalThis.__railorDb ??= createHandle();
  return globalThis.__railorDb;
}

export async function getDb(): Promise<RailorDb> {
  return (await getDbHandle()).db;
}

let migrated: Promise<void> | undefined;

/** Idempotent: brings a fresh machine to a working database on first request. */
export async function ensureMigrated(): Promise<void> {
  migrated ??= (async () => {
    const handle = await getDbHandle();
    await handle.migrate();
  })();
  return migrated;
}
