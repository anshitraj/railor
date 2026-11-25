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

export const SETUP_CLIENTS = ["Claude", "Claude Code", "Codex", "Cursor", "VS Code", "Any MCP client"] as const;
export type SetupClient = typeof SETUP_CLIENTS[number];
export const AGENT_SETUP_PATH = "/app/developers/setup";
export const AGENT_KEY_PLACEHOLDER = "YOUR_RAILOR_TEST_KEY";
export const AGENT_FIRST_REQUEST = "Use Railor to compare sending 1,000 USD to INR as a personal transfer from the United States, funded by local bank transfer. Show the source for each price and flag any fee that still needs confirmation.";

export const MCP_CLIENT_INSTRUCTIONS: Record<SetupClient, string> = {
  Claude: "In Claude, open Customize → Connectors → Add custom connector. Enter the server URL, select no sign-in, and add the Authorization header under Request headers. Save and enable Railor.",
  "Claude Code": "Run the command in your terminal, then use /mcp in Claude Code to check the connection.",
  Codex: "Run both lines in your terminal. Launch Codex from that same terminal so it can read the environment variable.",
  Cursor: "Add the Railor entry to your project's .cursor/mcp.json or your user MCP configuration. Merge it with any existing servers.",
  "VS Code": "Add the Railor entry to your project's .vscode/mcp.json, then start the server from the editor. Merge it with any existing servers.",
  "Any MCP client": "Add a Streamable HTTP server in your client's MCP settings and set the Authorization request header.",
};

export function mcpEndpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/$/, "")}/api/mcp`;
}

export function agentSetupPrompt(client: SetupClient, baseUrl: string) {
  const endpoint = mcpEndpoint(baseUrl);
  return `Help me connect Railor to ${client}. Railor compares cross-border transfer prices and provider coverage.

Use the Streamable HTTP MCP endpoint ${endpoint} with an Authorization: Bearer header. Show me where to enter my Railor test key in my client or local environment. Keep the key out of this conversation and source control.

Once I’ve added the key, check that Railor’s tools are available. Then guide me through a read-only price comparison using compare_prices. Include the pricing source and any unconfirmed fees.`;
}

export function setupSnippet(client: SetupClient, baseUrl: string, key: string, powershell = true) {
  const url = mcpEndpoint(baseUrl);
  if (client === "Claude" || client === "Any MCP client") return `Server URL: ${url}\nAuthorization: Bearer ${key}`;
  if (client === "Claude Code") return `claude mcp add --transport http railor "${url}" --header "Authorization: Bearer ${key}"`;
  if (client === "Codex") return `${powershell ? `$env:RAILOR_KEY = '${key}'` : `export RAILOR_KEY='${key}'`}\ncodex mcp add railor --url "${url}" --bearer-token-env-var RAILOR_KEY`;
  return JSON.stringify(client === "VS Code" ? { servers: { railor: { type: "http", url, headers: { Authorization: `Bearer ${key}` } } } } : { mcpServers: { railor: { url, headers: { Authorization: `Bearer ${key}` } } } }, null, 2);
}
