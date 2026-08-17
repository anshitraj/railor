#!/usr/bin/env node
import { Command } from "commander";
import { makeClient, type RailorClient } from "./client.js";
import { resolveApiKey, resolveBaseUrl } from "./config.js";
import { registerAuthCommands } from "./commands/auth.js";
import { registerChangeCommands } from "./commands/changes.js";
import { registerCorridorCommands } from "./commands/corridors.js";
import { registerEligibilityCommands } from "./commands/eligibility.js";
import { registerProviderCommands } from "./commands/providers.js";
import { registerWatchCommands } from "./commands/watch.js";

const program = new Command();

program
  .name("railor")
  .description(
    "Railor from the terminal — the same verified infrastructure data the app and the API return.",
  )
  .version("0.1.0")
  .option("--key <key>", "API key (defaults to the one saved by `railor login`, or $RAILOR_API_KEY)")
  .option("--base-url <url>", "API origin (defaults to the saved one, or $RAILOR_API_URL)");

/** Built lazily per-command so `railor login`/`--help` never require a key. */
function getClient(): RailorClient {
  const opts = program.opts<{ key?: string; baseUrl?: string }>();
  return makeClient(resolveBaseUrl(opts.baseUrl), resolveApiKey(opts.key));
}

registerAuthCommands(program);
registerCorridorCommands(program, getClient);
registerProviderCommands(program, getClient);
registerChangeCommands(program, getClient);
registerWatchCommands(program, getClient);
registerEligibilityCommands(program, getClient);

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
