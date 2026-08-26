/**
 * Loads the repo-root .env for this package's standalone scripts
 * (migrate-run.ts, seed/*.ts), run via `pnpm --filter @railor/database
 * <script>`. That form runs with cwd set to this package's own directory,
 * so a bare `import "dotenv/config"` resolves `.env` relative to the wrong
 * directory and silently finds nothing — DATABASE_URL stays unset and
 * getDbHandle() falls back to the embedded PGlite driver instead of
 * whatever real Postgres is configured, with no warning.
 *
 * apps/web doesn't need this: next.config.ts already resolves the
 * repo-root .env explicitly before any server code runs there.
 *
 * Import this first, before anything that reads process.env.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.resolve(packageRoot, "..", "..", ".env") });
