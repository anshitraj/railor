import type { NextConfig } from "next";

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
