import { Card, CodeSample, SectionLabel } from "@railor/ui";
import { getSession } from "../../../../lib/auth";
import { getOrgTestKey } from "../../../../lib/org";

export const metadata = { title: "MCP server" };
export const dynamic = "force-dynamic";

const TOOLS: Array<[string, string]> = [
  ["search_corridors", "Evaluate every mapped provider against a corridor."],
  ["check_eligibility", "Ask about one provider and get the reason, not just a verdict."],
  ["search_providers", "List providers filtered by product, asset or network."],
  ["compare_providers", "Line up 2–4 providers on the same capability rows."],
  ["get_provider_capabilities", "Full normalized capability set with evidence."],
  ["get_provider_changes", "Detected changes with review status."],
  ["get_kyb_requirements", "Normalized onboarding requirements."],
  ["get_supported_countries", "Countries indexed by Railor."],
  ["get_supported_currencies", "Fiat currencies and stablecoins indexed by Railor."],
];

export default async function McpDocs() {
  const session = await getSession();
  const key = session?.organization ? await getOrgTestKey(session.organization.id) : null;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <>
      <div className="flex flex-col gap-3">
        <SectionLabel>Reference</SectionLabel>
        <h1 className="text-[32px] font-semibold tracking-tight">MCP server</h1>
        <p className="text-[15px] leading-relaxed text-[var(--color-muted)]">
          Read-only tools over the same capability graph. Every response carries `source`,
          `verified_at` and `confidence`, so an agent can tell a sourced fact from a guess — and
          Railor never returns the second.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Install</h2>
        <CodeSample
          apiKey={key ?? undefined}
          variants={[
            {
              language: "claude",
              label: "Claude Code",
              code: `claude mcp add --transport http railor ${base}/api/mcp \\
  --header "Authorization: Bearer RAILOR_API_KEY"`,
            },
            {
              language: "json",
              label: "mcp.json",
              code: `{
  "mcpServers": {
    "railor": {
      "url": "${base}/api/mcp",
      "headers": { "Authorization": "Bearer RAILOR_API_KEY" }
    }
  }
}`,
            },
            {
              language: "antigravity",
              label: "Antigravity",
              code: `{
  "mcpServers": {
    "railor": {
      "serverUrl": "${base}/api/mcp",
      "headers": { "Authorization": "Bearer RAILOR_API_KEY" }
    }
  }
}`,
            },
            {
              language: "toml",
              label: "Codex",
              code: `# ~/.codex/config.toml (or ./.codex/config.toml for this project only)
export RAILOR_KEY=RAILOR_API_KEY

[mcp_servers.railor]
url = "${base}/api/mcp"
bearer_token_env_var = "RAILOR_KEY"`,
            },
          ]}
          caption="Cursor and VS Code read the mcp.json shape directly. Antigravity needs serverUrl instead of url — its own docs say the legacy field isn't supported. Codex reads the token from an env var, not an inline string. The developer portal has a one-click Cursor install link."
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Tools</h2>
        <Card className="divide-y divide-[var(--color-line)] p-0">
          {TOOLS.map(([name, summary]) => (
            <div key={name} className="flex flex-col gap-0.5 p-4">
              <code className="text-[13px] text-[var(--color-purple)]">{name}</code>
              <span className="text-[13px] text-[var(--color-muted)]">{summary}</span>
            </div>
          ))}
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Ask your agent</h2>
        <Card className="flex flex-col gap-2 bg-[var(--color-lavender)] p-5">
          <p className="text-[14px] text-[var(--color-ink-soft)]">
            “Which mapped providers can settle USDC on Base into an AED business account for an
            Indian-incorporated entity? Show the reason and the source for each.”
          </p>
        </Card>
        <p className="text-[13px] text-[var(--color-muted)]">
          Tool calls require a key. `initialize` and `tools/list` are open so a client can discover
          the server before authenticating.
        </p>
      </section>
    </>
  );
}
