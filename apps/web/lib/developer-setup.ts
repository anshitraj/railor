import type { CorridorQuery } from "@railor/types";
import { onboardingCustomerType } from "./onboarding";

/** First requests reflect saved intent; unspecified currencies stay unspecified. */
export function developerExampleQuery(workspace: { building?: string | null; entityCountry?: string | null; targetCountries?: string[] | null; settlementCurrencies?: string[] | null }, saved: Partial<CorridorQuery> = {}): Record<string, unknown> {
  const destinationCountry = saved.destinationCountry ?? workspace.targetCountries?.[0] ?? "AE";
  const marketIndex = workspace.targetCountries?.indexOf(destinationCountry) ?? -1;
  const currency = marketIndex >= 0 ? workspace.settlementCurrencies?.[marketIndex] ?? workspace.settlementCurrencies?.[0]
    : !workspace.targetCountries?.length ? workspace.settlementCurrencies?.[0] : undefined;
  const query = {
    entityCountry: workspace.entityCountry ?? "IN",
    customerType: onboardingCustomerType(workspace.building ?? undefined),
    destinationCountry,
    sourceAsset: saved.sourceCurrency ? undefined : "USDC",
    destinationCurrency: currency,
    ...saved,
  };
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key === "sourceAsset" ? "asset" : key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), value]));
}

export type SetupClient = "Claude Code" | "Codex" | "Cursor" | "VS Code" | "Any MCP client";
export const SETUP_CLIENTS: SetupClient[] = ["Claude Code", "Codex", "Cursor", "VS Code", "Any MCP client"];
export function setupSnippet(client: SetupClient, baseUrl: string, key: string, powershell = true) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/mcp`;
  if (client === "Claude Code") return `claude mcp add --transport http railor "${url}" --header "Authorization: Bearer ${key}"`;
  if (client === "Codex") return `${powershell ? `$env:RAILOR_KEY = '${key}'` : `export RAILOR_KEY='${key}'`}\ncodex mcp add railor --url "${url}" --bearer-token-env-var RAILOR_KEY`;
  return JSON.stringify(client === "VS Code" ? { servers: { railor: { type: "http", url, headers: { Authorization: `Bearer ${key}` } } } } : { mcpServers: { railor: { url, headers: { Authorization: `Bearer ${key}` } } } }, null, 2);
}
