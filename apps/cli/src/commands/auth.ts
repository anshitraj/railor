import { Command } from "commander";
import { readConfig, writeConfig } from "../config.js";
import { successLine } from "../format.js";

export function registerAuthCommands(program: Command) {
  program
    .command("login")
    .description("save an API key for subsequent commands")
    .argument("<api_key>", "a key from the dashboard, e.g. rail_test_…")
    .option("--base-url <url>", "Railor API origin", "http://localhost:3000")
    .action((apiKey: string, opts: { baseUrl: string }) => {
      writeConfig({ apiKey, baseUrl: opts.baseUrl });
      console.log(successLine(`Saved. Requests will use ${opts.baseUrl}.`));
    });

  program
    .command("logout")
    .description("forget the saved API key")
    .action(() => {
      const config = readConfig();
      writeConfig({ ...config, apiKey: undefined });
      console.log(successLine("Removed the saved key."));
    });
}
