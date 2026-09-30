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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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

/**
 * Next.js transpiles this package's source directly into its own server
 * chunk (see apps/web/next.config.ts's transpilePackages) instead of
 * importing a pre-built dist/ — inside that bundled chunk, import.meta.url
 * points at the chunk file itself (e.g. .next/server/chunks/5252.js), not
 * this file's real location, so a naive packageRoot-relative path silently
 * resolves to a directory that doesn't exist in the deployed function
 * (confirmed in production: "Can't find meta/_journal.json file"). The
 * migrations folder IS present in the bundle (next.config.ts's
 * outputFileTracingIncludes copies it) — only the runtime path computation
 * was wrong. Try every layout a real deployment could plausibly have and use
 * whichever one is actually there, rather than trusting import.meta.url
 * unconditionally.
 */
function resolveMigrationsFolder(): string {
  const candidates = [
    path.join(packageRoot, "drizzle"),
    path.join(process.cwd(), "packages/database/drizzle"),
    path.join(process.cwd(), "../../packages/database/drizzle"),
    path.join(process.cwd(), "drizzle"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "meta", "_journal.json"))) return candidate;
  }
  return candidates[0]!;
}

const migrationsFolder = resolveMigrationsFolder();

export function embeddedDataDir(): string {
  return (
    process.env.PGLITE_DATA_DIR ??
    path.resolve(packageRoot, "..", "..", ".railor", "pglite")
  );
}

async function createHandle(): Promise<DbHandle> {
  const url = process.env.DATABASE_URL?.trim();
  // A production deployment must never fall back to an in-process database.
  // RAILOR_ALLOW_EMBEDDED_DB=true is the explicit opt-in for benchmarking or
  // testing a production build locally against a throwaway PGlite directory.
  if (!url && process.env.NODE_ENV === "production" && process.env.RAILOR_ALLOW_EMBEDDED_DB !== "true") {
    throw new Error("DATABASE_URL is required in production");
  }

  if (url) {
    const [{ default: pg }, { drizzle }, { migrate }] = await Promise.all([
      import("pg"),
      import("drizzle-orm/node-postgres"),
      import("drizzle-orm/node-postgres/migrator"),
    ]);
    const pool = new pg.Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000, statement_timeout: 30_000 });
    const db = drizzle(pool, { schema, casing: "snake_case" }) as unknown as RailorDb;
    return {
      db,
      driver: "postgres",
      migrate: () => migrate(db as never, { migrationsFolder }),
      close: () => pool.end(),
    };
  }

  const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
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

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "postgres", "db", "host.docker.internal"]);

/** True for a database on this machine / docker compose — never a hosted (Neon, RDS, Supabase…) one. */
export function isLocalDatabaseUrl(url: string | undefined): boolean {
  if (!url?.trim()) return true;
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Where DATABASE_URL points, safe to print: host only, never credentials. */
export function databaseTargetLabel(url: string | undefined = process.env.DATABASE_URL): string {
  if (!url?.trim()) return `embedded PGlite (${embeddedDataDir()})`;
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return "unparseable DATABASE_URL";
  }
}

/**
 * Migrations in the journal that this database has not applied yet. Mirrors
 * drizzle's own rule: an entry is pending when its `when` is newer than the
 * last applied migration's `created_at`.
 */
export async function pendingMigrations(handle?: DbHandle): Promise<string[]> {
  const h = handle ?? (await getDbHandle());
  const journal = JSON.parse(fs.readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8")) as {
    entries: Array<{ tag: string; when: number }>;
  };
  let last = 0;
  try {
    const result = (await h.db.execute(sql`select max(created_at) as last from drizzle.__drizzle_migrations`)) as unknown as
      | { rows?: Array<{ last: string | number | null }> }
      | Array<{ last: string | number | null }>;
    const rows = Array.isArray(result) ? result : (result.rows ?? []);
    last = Number(rows[0]?.last ?? 0);
  } catch {
    last = 0; // no migrations table yet: everything is pending
  }
  return journal.entries.filter((e) => e.when > last).map((e) => e.tag);
}

/**
 * Applies migrations automatically only where that is safe: the embedded
 * PGlite database and a Postgres on this machine. A hosted database (the
 * Neon/production one) is never migrated as a side effect of starting the
 * app — it is checked, and a pending migration fails loudly with the exact
 * command to run deliberately. RAILOR_AUTO_MIGRATE=true|false overrides.
 */
export async function ensureMigrated(): Promise<void> {
  migrated ??= (async () => {
    const handle = await getDbHandle();
    const override = process.env.RAILOR_AUTO_MIGRATE?.trim().toLowerCase();
    const autoMigrate =
      override === "true" ? true
      : override === "false" ? false
      : handle.driver === "pglite" || (process.env.NODE_ENV !== "production" && isLocalDatabaseUrl(process.env.DATABASE_URL));
    if (autoMigrate) {
      await handle.migrate();
      return;
    }
    const pending = await pendingMigrations(handle);
    if (pending.length) {
      throw new Error(
        `Database ${databaseTargetLabel()} has ${pending.length} unapplied migration(s): ${pending.join(", ")}. ` +
          "Railor never migrates a hosted database implicitly. Back it up, then run `pnpm db:migrate -- --confirm-remote`.",
      );
    }
  })();
  // A failed check must not be cached forever — the next request re-checks.
  migrated.catch(() => {
    migrated = undefined;
  });
  return migrated;
}
