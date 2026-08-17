/**
 * Local CLI config — one API key and one base URL, stored at ~/.railor/config.json.
 * The CLI has no separate login flow: a Railor API key *is* the credential,
 * created in the dashboard's developer portal exactly like any other client.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(homedir(), ".railor");
const FILE = join(DIR, "config.json");

export interface CliConfig {
  apiKey?: string;
  baseUrl?: string;
}

export function readConfig(): CliConfig {
  if (!existsSync(FILE)) return {};
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

export function writeConfig(config: CliConfig): void {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(config, null, 2) + "\n", "utf8");
}

export function resolveApiKey(flagValue?: string): string {
  const key = flagValue ?? process.env.RAILOR_API_KEY ?? readConfig().apiKey;
  if (!key) {
    console.error(
      "No API key. Run `railor login <key>`, set RAILOR_API_KEY, or pass --key.\n" +
        "Find your test key in the dashboard under Developers.",
    );
    process.exit(1);
  }
  return key;
}

export function resolveBaseUrl(flagValue?: string): string {
  return (
    flagValue ?? process.env.RAILOR_API_URL ?? readConfig().baseUrl ?? "http://localhost:3000"
  );
}
