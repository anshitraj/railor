import { Card, CodeSample, TechnologyLogo } from "@railor/ui";
import { DocsHeader } from "../../../../components/docs/docs-header";
import { getSession } from "../../../../lib/auth";
import { getOrgTestKey } from "../../../../lib/org";

export const metadata = { title: "MCP server" };
export const dynamic = "force-dynamic";

const TOOLS: Array<[string, string]> = [
  ["compare_prices", "What arrives through each provider for an amount, with each number labelled and sourced."],
  ["stablecoin_offramps", "USDT or USDC on a network to a bank: live Indian exchange prices after fees and TDS, plus other routes."],
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
  const key = session?.organization ? await getOrgTestKey(session.organization.id, session.role) : null;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <>
      <DocsHeader eyebrow="Reference" title={<><TechnologyLogo name="MCP" size={34} /> MCP server</>}>
        Read-only tools over the same capability graph. Every response carries <code>source</code>,{" "}
        <code>verified_at</code> and <code>confidence</code>, so an agent can tell a sourced fact
        from a guess — and Railor never returns the second.
      </DocsHeader>

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
          caption="Use the configuration format for your client. Antigravity uses serverUrl, and Codex reads the token from an environment variable. Developers → Set up your agent walks through each step."
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Tools</h2>
        <Card className="divide-y divide-[var(--color-line)] p-0">
          {TOOLS.map(([name, summary]) => (
            <div key={name} className="flex flex-col gap-0.5 p-4">
              <code className="w-fit text-[13px] text-[var(--color-purple)]">{name}</code>
              <span className="text-[13px] text-[var(--color-muted)]">{summary}</span>
            </div>
          ))}
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Sign in with OAuth (ChatGPT, Claude)</h2>
        <p className="text-[14px] text-[var(--color-ink-soft)]">
          Chat apps can&apos;t send an API-key header, so Railor is also an OAuth 2.1 authorization server. In the app, add a custom
          connector with the server URL, choose OAuth, leave the client ID and secret empty, then sign in to Railor and approve. Approval
          creates a connected-app key for your workspace; revoke it under Developers → All keys to disconnect.
        </p>
        <Card className="flex flex-col gap-1 p-5 text-[13px] text-[var(--color-ink-soft)]">
          <span>Resource metadata: <code>{base}/.well-known/oauth-protected-resource/api/mcp</code></span>
          <span>Authorization server metadata: <code>{base}/.well-known/oauth-authorization-server</code></span>
          <span>Dynamic client registration: <code>{base}/oauth/register</code>; client ID metadata documents are also accepted.</span>
          <span>PKCE (S256) is required. Access tokens last an hour; refresh tokens rotate on every use. One scope: <code>prices:read</code>.</span>
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
          Every request needs credentials: an API key, or an OAuth token from signing in. A request with neither gets a{" "}
          <code>401</code> whose <code>WWW-Authenticate</code> header points at the OAuth discovery document. Each tool call
          counts toward the workspace&apos;s monthly API allowance, and against its wallet once API calls are priced.
        </p>
      </section>
    </>
  );
}
