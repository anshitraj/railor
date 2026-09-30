import path from "node:path";
import dotenv from "dotenv";
import type { NextConfig } from "next";

// Next only auto-loads .env* from its own cwd (apps/web). This is a pnpm
// workspace with one .env at the repo root — apps/worker's config.py already
// loads it from there (see load_dotenv in config.py). @next/env's
// loadEnvConfig looked like the "correct" tool for this but silently no-oped
// here (returned loadedEnvFiles: [] despite the file existing at the resolved
// path) — plain dotenv.config() doesn't have whatever internal state that
// was tripping over. `override: false` matches the intent either way: values
// already set (e.g. by Vercel/Railway's own dashboard injection) win.
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env"), override: false });

const config: NextConfig = {
  distDir: process.env.RAILOR_NEXT_DIST_DIR ?? ".next",
  reactStrictMode: true,
  // The provider graph, reference data and platform counts are shared, slow to
  // compute and rarely change: served from a per-process stale-while-revalidate
  // cache (packages/core repository.ts). Inlined at build so serverless
  // functions get it too; "0" disables. Tests never set it and read fresh.
  env: { RAILOR_READ_CACHE_MS: process.env.RAILOR_READ_CACHE_MS ?? "120000" },
  transpilePackages: ["@railor/ui", "@railor/core", "@railor/database", "@railor/types"],
  // Railor never uses next/image (logos are served by /api/logos), so the
  // image-optimization endpoint is pure attack surface: keep it off.
  images: { unoptimized: true },
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // ensureMigrated() reads packages/database/drizzle/*.sql off disk at
  // runtime (drizzle-orm's migrator does a plain fs.readdir, not an import),
  // so Next's output-file-tracing never discovers it on its own — every
  // route that calls it would 500 on Vercel with the migrations folder
  // missing from the deployed function bundle.
  outputFileTracingIncludes: {
    "/**": ["../../packages/database/drizzle/**/*"],
  },
  // Workspace packages are ESM-correct TypeScript: they import siblings with a
  // ".js" specifier. Teach the bundler to resolve those to the .ts/.tsx source.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default config;
