"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Trash2 } from "lucide-react";
import { Button, Card, CodeSample, Freshness, SectionLabel, StageBadge } from "@railor/ui";
import { createKey, revokeKey } from "../../app/app/developers/actions";

export interface KeyRow {
  id: string;
  label: string;
  mode: "test" | "live";
  prefix: string;
  secret: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  revoked: boolean;
  /** null once revoked — a dead key has no ongoing month to measure. */
  monthlyUsed: number | null;
  monthlyCap: number | null;
}

export interface UsageRow {
  endpoint: string;
  count: number;
  errors: number;
  p95: number;
}

export interface DailyUsagePoint {
  day: string;
  count: number;
  errors: number;
}

export interface QuotaInfo {
  used: number;
  cap: number;
  /** Which key this bar reflects — a test-only org sees its test key here, not a blank card. */
  mode: "test" | "live";
}

/**
 * Keys, usage and agent installation in one place. The test key already exists
 * — nobody has to find a "create key" button before the docs work.
 */
export function DeveloperPortal({
  keys,
  usage,
  dailySeries,
  quota,
  baseUrl,
  exampleQuery,
}: {
  keys: KeyRow[];
  usage: UsageRow[];
  dailySeries: DailyUsagePoint[];
  quota: QuotaInfo | null;
  baseUrl: string;
  exampleQuery: Record<string, unknown>;
}) {
  const [freshSecret, setFreshSecret] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [pending, startTransition] = useTransition();

  const testKey = keys.find((k) => k.mode === "test" && !k.revoked)?.secret ?? undefined;

  const mcpConfig = {
    railor: {
      url: `${baseUrl}/api/mcp`,
      headers: { Authorization: `Bearer ${testKey ?? "rail_test_your_key"}` },
    },
  };
  const cursorDeeplink = `cursor://anysphere.cursor-deeplink/mcp/install?name=railor&config=${encodeURIComponent(
    Buffer.from(JSON.stringify(mcpConfig.railor)).toString("base64"),
  )}`;

  const hasLiveKey = keys.some((k) => k.mode === "live" && !k.revoked);
  const hasCalledApi = usage.length > 0;
  const createLiveKey = () =>
    startTransition(async () => {
      const res = await createKey("Live key", "live");
      if (res.ok && res.secret) setFreshSecret(res.secret);
    });

  const copySecret = (secret: string) => {
    void navigator.clipboard.writeText(secret);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-[24px] font-semibold tracking-tight">Developers</h1>
        <p className="max-w-2xl text-[14px] text-[var(--color-muted)]">
          The screens in this app are thin clients over these endpoints. Your test key is already
          live and every snippet below is rendered with it.
        </p>
      </div>

      <Card className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SectionLabel>API usage</SectionLabel>
            {quota ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                  quota.mode === "test"
                    ? "bg-[var(--color-lavender)] text-[var(--color-purple)]"
                    : "bg-[var(--color-ok-bg)] text-[var(--color-ok)]"
                }`}
              >
                {quota.mode} key
              </span>
            ) : null}
          </div>
          <span className="text-[11px] text-[var(--color-faint)]">Resets monthly, per key</span>
        </div>

        {quota ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-[14px]">
              <span className="tabular font-medium">
                {quota.used.toLocaleString()} / {quota.cap.toLocaleString()} requests
              </span>
              <span className="text-[11px] text-[var(--color-faint)]">this month</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--color-line)]">
              <div
                className={`h-full rounded-full ${
                  quota.used / quota.cap >= 1
                    ? "bg-[var(--color-bad)]"
                    : quota.used / quota.cap >= 0.8
                      ? "bg-[var(--color-warn)]"
                      : "bg-[var(--color-purple)]"
                }`}
                style={{ width: `${Math.min(100, (quota.used / quota.cap) * 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-[var(--color-muted)]">
            No API key on this workspace yet.
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-1 p-5">
        <SectionLabel className="mb-2">Getting started</SectionLabel>
        <ChecklistRow step={1} done label="Get your API key" hint="One test key already works across every endpoint." />
        <ChecklistRow
          step={2}
          done={hasCalledApi}
          label="Run your first request"
          hint="Copy the snippet below — it's rendered with your real test key."
          action={!hasCalledApi ? <a href="#quickstart" className="text-[12.5px] font-medium text-[var(--color-purple)]">View snippet →</a> : null}
        />
        <ChecklistRow
          step={3}
          done={hasLiveKey}
          label="Create a live key"
          hint="Test keys never touch production data; a live key does."
          action={
            !hasLiveKey ? (
              <Button size="sm" variant="secondary" disabled={pending} onClick={createLiveKey}>
                New live key
              </Button>
            ) : null
          }
          last
        />
      </Card>

      <div id="quickstart" className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card className="flex flex-col gap-4 p-5">
          <SectionLabel>60-second start</SectionLabel>
          <CodeSample
            apiKey={testKey}
            variants={[
              {
                language: "curl",
                label: "cURL",
                code: `curl ${baseUrl}/v1/corridors/search \\
  -H "Authorization: Bearer RAILOR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(exampleQuery, null, 2)}'`,
              },
              {
                language: "ts",
                label: "TypeScript",
                code: `const response = await fetch("${baseUrl}/v1/corridors/search", {
  method: "POST",
  headers: {
    Authorization: "Bearer RAILOR_API_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(${JSON.stringify(exampleQuery, null, 2)}),
})

const { data, providers_checked } = await response.json()`,
              },
              {
                language: "python",
                label: "Python",
                code: `import httpx

response = httpx.post(
    "${baseUrl}/v1/corridors/search",
    headers={"Authorization": "Bearer RAILOR_API_KEY"},
    json=${JSON.stringify(exampleQuery, null, 4).replace(/"/g, '"')},
)
print(response.json()["providers_checked"])`,
              },
            ]}
            caption="Rendered with your workspace's test key and your most recent corridor."
          />
        </Card>

        <Card className="flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between">
            <SectionLabel>API keys</SectionLabel>
            <span className="text-[11px] text-[var(--color-faint)]">
              Live keys are shown once and stored hashed
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[13px]">
              <thead className="text-[11px] uppercase tracking-wide text-[var(--color-faint)]">
                <tr>
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Usage</th>
                  <th className="pb-2 font-medium">Key</th>
                  <th className="pb-2 font-medium">
                    <span className="sr-only">Options</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id} className="border-t border-[var(--color-line)] align-top">
                    <td className="py-2.5 pr-2">
                      <div className="flex flex-col">
                        <span className="font-medium">{key.label}</span>
                        <span className="text-[11px] text-[var(--color-faint)]">
                          {key.revoked ? (
                            <span className="text-[var(--color-bad)]">revoked</span>
                          ) : key.lastUsedAt ? (
                            <Freshness date={key.lastUsedAt} prefix="Last used" />
                          ) : (
                            "Never used"
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                          key.mode === "test"
                            ? "bg-[var(--color-lavender)] text-[var(--color-purple)]"
                            : "bg-[var(--color-ok-bg)] text-[var(--color-ok)]"
                        }`}
                      >
                        {key.mode}
                      </span>
                    </td>
                    <td className="tabular py-2.5 pr-2 text-[var(--color-muted)]">
                      {key.monthlyUsed !== null && key.monthlyCap !== null
                        ? `${key.monthlyUsed.toLocaleString()} / ${key.monthlyCap.toLocaleString()}`
                        : "—"}
                    </td>
                    <td className="py-2.5 pr-2">
                      <div className="flex items-center gap-1.5">
                        <code className="tabular text-[12px] text-[var(--color-muted)]">
                          {key.secret ?? `${key.prefix}…`}
                        </code>
                        {key.secret ? (
                          <button
                            type="button"
                            title="Copy key"
                            onClick={() => copySecret(key.secret!)}
                            className="rounded-full p-1 text-[var(--color-faint)] hover:bg-[var(--color-lavender)] hover:text-[var(--color-purple)]"
                          >
                            <Copy size={13} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-2.5 text-right">
                      {!key.revoked ? (
                        <button
                          type="button"
                          title="Revoke key"
                          onClick={() => startTransition(async () => void (await revokeKey(key.id)))}
                          className="rounded-full p-1.5 text-[var(--color-faint)] hover:bg-[var(--color-bad-bg)] hover:text-[var(--color-bad)]"
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] pt-3">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Key label (e.g. staging worker)"
              className="flex-1 rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--color-violet)]"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await createKey(label || "Test key", "test");
                  if (res.ok) setLabel("");
                })
              }
            >
              New test key
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await createKey(label || "Live key", "live");
                  if (res.ok && res.secret) setFreshSecret(res.secret);
                  setLabel("");
                })
              }
            >
              New live key
            </Button>
          </div>

          {freshSecret ? (
            <div className="flex flex-col gap-1 rounded-[var(--radius-card)] bg-[var(--color-lavender)] p-3">
              <span className="text-[11px] uppercase tracking-wide text-[var(--color-purple)]">
                Copy this now — it is not shown again
              </span>
              <code className="break-all text-[12.5px]">{freshSecret}</code>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            <SectionLabel>MCP server</SectionLabel>
            <StageBadge stage="beta" />
          </div>
          <p className="text-[13px] leading-relaxed text-[var(--color-muted)]">
            Let a coding or treasury agent query the same verified data. Every tool response carries
            source, verified_at and confidence.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={cursorDeeplink}>
              <Button size="sm" variant="secondary">
                Add to Cursor
              </Button>
            </a>
            <a href="/docs/mcp">
              <Button size="sm" variant="secondary">
                Claude Code instructions
              </Button>
            </a>
          </div>
          <CodeSample
            apiKey={testKey}
            variants={[
              {
                language: "json",
                label: "mcp.json",
                code: JSON.stringify(
                  {
                    mcpServers: {
                      railor: {
                        url: `${baseUrl}/api/mcp`,
                        headers: { Authorization: "Bearer RAILOR_API_KEY" },
                      },
                    },
                  },
                  null,
                  2,
                ),
              },
              {
                language: "cli",
                label: "Claude Code",
                code: `claude mcp add --transport http railor ${baseUrl}/api/mcp \\
  --header "Authorization: Bearer RAILOR_API_KEY"`,
              },
              {
                language: "antigravity",
                label: "Antigravity",
                // Antigravity's own docs are explicit: "Legacy fields like
                // `url` or `httpUrl` are not supported" for remote servers —
                // it has to be `serverUrl`, unlike every other client here.
                // Global config: ~/.gemini/config/mcp_config.json
                // Workspace config: .agents/mcp_config.json
                code: JSON.stringify(
                  {
                    mcpServers: {
                      railor: {
                        serverUrl: `${baseUrl}/api/mcp`,
                        headers: { Authorization: "Bearer RAILOR_API_KEY" },
                      },
                    },
                  },
                  null,
                  2,
                ),
              },
              {
                language: "toml",
                label: "Codex",
                // Codex reads the token from an env var, not an inline
                // string — RAILOR_KEY here is just the var's name; only the
                // value after `=` is your actual key.
                code: `# ~/.codex/config.toml (or ./.codex/config.toml for this project only)
export RAILOR_KEY=RAILOR_API_KEY

[mcp_servers.railor]
url = "${baseUrl}/api/mcp"
bearer_token_env_var = "RAILOR_KEY"`,
              },
            ]}
            caption="Ask your agent: “Which mapped providers can settle USDC to an AED business account for an Indian entity?”"
          />
        </Card>

        <Card className="flex flex-col gap-3 p-5">
          <SectionLabel>Usage by endpoint</SectionLabel>

          {dailySeries.some((d) => d.count > 0) ? (
            <div className="flex items-end gap-[2px] border-t border-[var(--color-line)] pt-3" style={{ height: 40 }}>
              {(() => {
                const max = Math.max(1, ...dailySeries.map((d) => d.count));
                return dailySeries.map((d) => (
                  <div
                    key={d.day}
                    title={`${d.day}: ${d.count} request${d.count === 1 ? "" : "s"}${d.errors ? `, ${d.errors} error${d.errors === 1 ? "" : "s"}` : ""}`}
                    className={`flex-1 rounded-t-[2px] ${d.errors ? "bg-[var(--color-bad)]" : "bg-[var(--color-purple)]"} opacity-70`}
                    style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }}
                  />
                ));
              })()}
            </div>
          ) : null}

          {usage.length ? (
            <table className="w-full text-left text-[13px]">
              <thead className="text-[11px] uppercase tracking-wide text-[var(--color-faint)]">
                <tr>
                  <th className="pb-2">Endpoint</th>
                  <th className="pb-2">Requests</th>
                  <th className="pb-2">Errors</th>
                  <th className="pb-2">p95</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((row) => (
                  <tr key={row.endpoint} className="border-t border-[var(--color-line)]">
                    <td className="py-2 font-mono text-[12px]">{row.endpoint}</td>
                    <td className="tabular py-2">{row.count}</td>
                    <td className="tabular py-2">{row.errors}</td>
                    <td className="tabular py-2">{row.p95}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[13px] text-[var(--color-muted)]">
              No API calls yet. Copy the snippet above — it runs as printed.
            </p>
          )}

          <div className="border-t border-[var(--color-line)] pt-3">
            <SectionLabel>Endpoints</SectionLabel>
            <ul className="mt-2 flex flex-col gap-1 font-mono text-[12px] text-[var(--color-ink-soft)]">
              <li>POST /v1/corridors/search</li>
              <li>GET /v1/providers</li>
              <li>GET /v1/changes</li>
              <li className="text-[var(--color-faint)]">POST /v1/eligibility — coming soon</li>
              <li className="text-[var(--color-faint)]">POST /v1/watchlists — coming soon</li>
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ChecklistRow({
  step,
  done,
  label,
  hint,
  action,
  last,
}: {
  step: number;
  done: boolean;
  label: string;
  hint: string;
  action?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 py-2.5 ${!last ? "border-b border-[var(--color-line)]" : ""}`}
    >
      <span
        className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-medium ${
          done
            ? "bg-[var(--color-ok-bg)] text-[var(--color-ok)]"
            : "bg-[var(--color-lavender)] text-[var(--color-purple)]"
        }`}
      >
        {done ? <Check size={13} /> : step}
      </span>
      <div className="flex flex-1 flex-col">
        <span className="text-[13.5px] font-medium">{label}</span>
        <span className="text-[12px] text-[var(--color-muted)]">{hint}</span>
      </div>
      {action}
    </div>
  );
}
