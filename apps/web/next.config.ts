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
  reactStrictMode: true,
  transpilePackages: ["@railor/ui", "@railor/core", "@railor/database", "@railor/types"],
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
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
