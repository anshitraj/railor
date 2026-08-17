import type { Config } from "drizzle-kit";

/**
 * Migrations are *generated* offline (`pnpm db:generate`) and *applied* by
 * `src/migrate.ts`, which works against both drivers — embedded PGlite for a
 * zero-setup dev machine and real Postgres when DATABASE_URL is present.
 */
export default {
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://railor:railor@localhost:5433/railor",
  },
  strict: false,
  verbose: true,
} satisfies Config;
