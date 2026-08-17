#!/usr/bin/env node
// Thin launcher so `railor` works once this package is installed (npm link,
// a global install, or a workspace bin symlink) without a separate build
// step — the rest of the monorepo runs its TS scripts the same way (tsx),
// so the CLI stays consistent with `pnpm db:seed` et al. rather than adding
// a bundler nobody else here uses.
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("tsx/esm", pathToFileURL("./"));
await import(new URL("../src/index.ts", import.meta.url));
