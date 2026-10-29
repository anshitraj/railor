export type SetupClient = "Claude Code" | "Codex" | "Cursor" | "VS Code" | "Any MCP client";
export const SETUP_CLIENTS: SetupClient[] = ["Claude Code", "Codex", "Cursor", "VS Code", "Any MCP client"];
export function setupSnippet(client: SetupClient, baseUrl: string, key: string, powershell = true) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/mcp`;
  if (client === "Claude Code") return `claude mcp add --transport http railor "${url}" --header "Authorization: Bearer ${key}"`;
  if (client === "Codex") return `${powershell ? `$env:RAILOR_KEY = '${key}'` : `export RAILOR_KEY='${key}'`}\ncodex mcp add railor --url "${url}" --bearer-token-env-var RAILOR_KEY`;
  return JSON.stringify(client === "VS Code" ? { servers: { railor: { type: "http", url, headers: { Authorization: `Bearer ${key}` } } } } : { mcpServers: { railor: { url, headers: { Authorization: `Bearer ${key}` } } } }, null, 2);
}
