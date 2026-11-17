"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Copy, Eye, EyeOff, KeyRound, Plus, RefreshCw, Terminal, Trash2, X } from "lucide-react";
import { CodeSample, TechnologyLogo } from "@railor/ui";
import { createKey, regenerateKey, revokeKey } from "../../app/app/developers/actions";
import { SETUP_CLIENTS, setupSnippet, type SetupClient } from "../../lib/developer-setup";
import { toast } from "../toast";
import styles from "./developer-portal.module.css";

export interface KeyRow { id: string; label: string; mode: "test" | "live"; prefix: string; secret: string | null; lastUsedAt: string | null; createdAt: string; revoked: boolean; monthlyUsed: number | null; monthlyCap: number | null }
export interface UsageRow { endpoint: string; count: number; errors: number; p95: number }
export interface DailyUsagePoint { day: string; count: number; errors: number }
export interface QuotaInfo { used: number; cap: number; mode: "test" | "live" }

const ROLE_ERROR = "Only workspace owners and admins can manage API keys.";
const why = (error: unknown, fallback: string) => (error === "insufficient_role" ? ROLE_ERROR : error === "key_unavailable" ? "That key was already replaced or revoked. Refresh the page." : fallback);

/**
 * Everything a developer needs on one page: the key (reveal, copy, rotate),
 * a first request that works as pasted, AI-tool setup, usage, and every key
 * the workspace has. Every action confirms with a toast or explains why not.
 */
export function DeveloperPortal({ keys, usage, dailySeries, quota, baseUrl, exampleQuery, canManage = false }: {
  keys: KeyRow[]; usage: UsageRow[]; dailySeries: DailyUsagePoint[]; quota: QuotaInfo | null; baseUrl: string; exampleQuery: Record<string, unknown>; canManage?: boolean;
}) {
  const router = useRouter();
  const [fresh, setFresh] = useState<KeyRow | null>(null);
  const active = keys.filter((key) => !key.revoked);
  const primary = (fresh && !keys.find((key) => key.id === fresh.id)?.revoked ? fresh : null) ?? active.find((key) => key.mode === "live") ?? active[0];
  const secret = primary?.id === fresh?.id ? fresh?.secret ?? undefined : primary?.secret ?? undefined;
  const [revealed, setRevealed] = useState(false);
  const [client, setClient] = useState<SetupClient>("Claude Code");
  const [powershell, setPowershell] = useState(true);
  const [copied, setCopied] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");
  const [mode, setMode] = useState<"test" | "live">("test");
  const [creating, setCreating] = useState(false);
  const stamp = (value: string | null | undefined) => value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "Never";

  async function copy(text: string, target: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(target);
      toast.success(message);
      window.setTimeout(() => setCopied((current) => (current === target ? "" : current)), 1800);
    } catch {
      toast.error("Couldn’t copy", "Your browser blocked the clipboard. Reveal the key and select it to copy.");
    }
  }

  function rotate() {
    if (!primary) return;
    start(async () => {
      try {
        const result = await regenerateKey(primary.id);
        if (!result.ok) { toast.error("Couldn’t regenerate the key", why("error" in result ? result.error : undefined, "Please try again.")); return; }
        setFresh({ ...primary, id: result.id, secret: result.secret, prefix: result.secret.slice(0, 12), createdAt: new Date().toISOString(), lastUsedAt: null, monthlyUsed: 0 });
        setConfirm(null); setRevealed(true);
        toast.success("New key ready", "The old key stopped working. Update your integrations with this one.");
        router.refresh();
      } catch { toast.error("Couldn’t regenerate the key", "The connection dropped. Please try again."); }
    });
  }

  function create() {
    const name = label.trim() || `${mode === "live" ? "Live" : "Test"} key`;
    start(async () => {
      try {
        const result = await createKey(name, mode);
        if (!result.ok) { toast.error("Couldn’t create the key", why("error" in result ? result.error : undefined, "Please try again.")); return; }
        setFresh({ id: result.id, label: name, mode, prefix: result.secret.slice(0, 12), secret: result.secret, revoked: false, createdAt: new Date().toISOString(), lastUsedAt: null, monthlyUsed: 0, monthlyCap: null });
        setLabel(""); setCreating(false); setRevealed(true);
        toast.success(`${mode === "live" ? "Live" : "Test"} key created`, mode === "live" ? "Copy it now — live keys are shown only once." : "It’s now your key at the top of this page.");
        router.refresh();
      } catch { toast.error("Couldn’t create the key", "The connection dropped. Please try again."); }
    });
  }

  function revoke(key: KeyRow) {
    start(async () => {
      try {
        const result = await revokeKey(key.id);
        if (!result.ok) { toast.error("Couldn’t revoke the key", why("error" in result ? result.error : undefined, "Please try again.")); return; }
        if (fresh?.id === key.id) setFresh(null);
        setConfirm(null);
        toast.success(`“${key.label}” revoked`, "Requests using it are now refused.");
        router.refresh();
      } catch { toast.error("Couldn’t revoke the key", "The connection dropped. Please try again."); }
    });
  }

  const command = setupSnippet(client, baseUrl, secret ?? "YOUR_RAILOR_KEY", powershell);
  const usedPct = quota ? Math.min(100, (quota.used / Math.max(1, quota.cap)) * 100) : 0;

  return (
    <div className={styles.portal}>
      <header className={styles.heading}>
        <div>
          <h1>Developers</h1>
          <p>Use Railor’s prices and routes from your own code or AI tools — one key for both.</p>
        </div>
        <nav aria-label="Developer docs" className={styles.headLinks}>
          <Link href="/docs/api">API reference<ArrowUpRight size={14} aria-hidden /></Link>
          <Link href="/docs">Docs<ArrowUpRight size={14} aria-hidden /></Link>
        </nav>
      </header>

      <section className={styles.card} aria-labelledby="primary-api-key">
        <div className={styles.cardHeading}>
          <h2 id="primary-api-key"><KeyRound size={18} aria-hidden />Your API key</h2>
          {primary ? <span className={styles.mode} data-mode={primary.mode}>{primary.mode === "live" ? "Live" : "Test"} key</span> : null}
        </div>
        {primary ? (
          <>
            <div className={styles.key}>
              <code aria-label="API key">{revealed && secret ? secret : `${primary.prefix}${"•".repeat(22)}`}</code>
              <button type="button" className={`${styles.iconButton} press`} disabled={!secret} aria-label={revealed ? "Hide API key" : "Reveal API key"} title={secret ? undefined : "Only shown once when created"} onClick={() => setRevealed((value) => !value)}>
                {revealed ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
              </button>
              <button type="button" className={`${styles.primary} press`} disabled={!secret} onClick={() => copy(secret!, "key", "API key copied")}>
                {copied === "key" ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}{copied === "key" ? "Copied" : "Copy"}
              </button>
            </div>
            {!secret ? <p className={styles.note}>{canManage ? "Live keys are shown once when created. Use your saved copy, or regenerate it." : "Ask a workspace owner or admin for the key."}</p> : null}
            {fresh?.mode === "live" && primary.id === fresh.id ? <p className={styles.warn}>Save this live key now — it won’t be shown again after you leave this page.</p> : null}
            <div className={styles.status} data-connected={Boolean(primary.lastUsedAt) || undefined}>
              <span aria-hidden />
              {primary.lastUsedAt ? `Connected — last request ${stamp(primary.lastUsedAt)}` : "Ready — run the request below to check your connection"}
            </div>
            <div className={styles.keyFooter}>
              <span>Created {stamp(primary.createdAt)}</span>
              {canManage ? (
                confirm === "rotate" ? (
                  <span className={styles.inlineConfirm} role="alert">
                    Replace this key? Apps using it stop working.
                    <button type="button" className={styles.danger} disabled={pending} onClick={rotate}>{pending ? "Replacing…" : "Replace key"}</button>
                    <button type="button" disabled={pending} onClick={() => setConfirm(null)}>Cancel</button>
                  </span>
                ) : (
                  <button type="button" className={styles.textButton} disabled={pending} onClick={() => setConfirm("rotate")}><RefreshCw size={13} aria-hidden />Regenerate</button>
                )
              ) : null}
            </div>
          </>
        ) : (
          <div className={styles.emptyKey}>
            <p>No active key yet.</p>
            {canManage ? <button type="button" className={`${styles.primary} press`} disabled={pending} onClick={() => { setMode("test"); create(); }}><Plus size={15} aria-hidden />{pending ? "Creating…" : "Create a test key"}</button> : <p className={styles.note}>Ask your workspace admin for access.</p>}
          </div>
        )}

        <div className={styles.firstRequest}>
          <h3>Your first request</h3>
          <p>Copy and run it — it works as-is with your key.</p>
          <CodeSample apiKey={secret} variants={[
            { language: "curl", label: "cURL", code: `curl "${baseUrl}/v1/corridors/search" \\\n  -H "Authorization: Bearer RAILOR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(exampleQuery)}'` },
            { language: "ts", label: "TypeScript", code: `const response = await fetch("${baseUrl}/v1/corridors/search", {\n  method: "POST",\n  headers: { Authorization: "Bearer RAILOR_API_KEY", "Content-Type": "application/json" },\n  body: JSON.stringify(${JSON.stringify(exampleQuery, null, 2)}),\n});\nconsole.log(await response.json());` },
            { language: "python", label: "Python", code: `import requests\n\nresponse = requests.post(\n    "${baseUrl}/v1/corridors/search",\n    headers={"Authorization": "Bearer RAILOR_API_KEY"},\n    json=${JSON.stringify(exampleQuery)},\n)\nprint(response.json())` },
          ]} />
        </div>
      </section>

      <section className={styles.card} aria-labelledby="setup-railor">
        <div className={styles.cardHeading}>
          <h2 id="setup-railor"><Terminal size={18} aria-hidden />Connect an AI tool</h2>
        </div>
        <p className={styles.note}>Pick your tool, copy the setup, then ask it to compare a payment route.</p>
        <div className={styles.clients} role="group" aria-label="Choose an AI tool">
          {SETUP_CLIENTS.map((name) => (
            <button type="button" key={name} aria-pressed={client === name} className="press" onClick={() => setClient(name)}>
              {name === "Any MCP client" ? <Terminal size={20} aria-hidden /> : <TechnologyLogo name={name} size={22} />}
              {name}
            </button>
          ))}
        </div>
        <div className={styles.setup}>
          <div className={styles.setupHead}>
            <h3>{client} setup</h3>
            {client === "Codex" ? (
              <div className={styles.platform} role="group" aria-label="Terminal type">
                <button type="button" aria-pressed={powershell} onClick={() => setPowershell(true)}>PowerShell</button>
                <button type="button" aria-pressed={!powershell} onClick={() => setPowershell(false)}>macOS / Linux</button>
              </div>
            ) : null}
          </div>
          <p>{client === "Claude Code" || client === "Codex" ? "Run this in your terminal." : `Add this to ${client === "VS Code" ? ".vscode/mcp.json" : client === "Cursor" ? ".cursor/mcp.json" : "your client’s MCP settings"}.`}</p>
          <div className={styles.snippet}>
            <pre>{command.replaceAll(secret ?? "\0", "YOUR_RAILOR_KEY")}</pre>
            <button type="button" className={`${styles.primary} press`} onClick={() => copy(command, "setup", secret ? "Setup copied with your key" : "Setup copied")}>
              {copied === "setup" ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}{copied === "setup" ? "Copied" : "Copy setup"}
            </button>
          </div>
          <p className={styles.note}>{secret ? "Your key is included when you copy." : "Replace YOUR_RAILOR_KEY with your saved key."} Then ask: “Compare providers for a payment from India to the UAE.”</p>
          <Link href="/docs/mcp" className={styles.link}>Setup help and supported tools<ArrowUpRight size={13} aria-hidden /></Link>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="usage-title">
        <div className={styles.cardHeading}>
          <h2 id="usage-title">Usage this month</h2>
          {quota ? <span className={styles.usageNumbers}>{quota.used.toLocaleString()} / {quota.cap.toLocaleString()} requests</span> : null}
        </div>
        {quota ? <div className={styles.meter} role="meter" aria-valuemin={0} aria-valuemax={quota.cap} aria-valuenow={quota.used} aria-label="Requests used this month"><span style={{ width: `${usedPct}%` }} /></div> : <p className={styles.note}>Usage appears once you have an active key.</p>}
        {dailySeries.some((point) => point.count > 0) ? (
          <div className={styles.usageChart} aria-label="Daily API requests, last 30 days">
            {dailySeries.map((point) => <span key={point.day} title={`${point.day}: ${point.count} requests, ${point.errors} errors`} style={{ height: `${Math.max(4, (point.count / Math.max(1, ...dailySeries.map((item) => item.count))) * 56)}px` }} />)}
          </div>
        ) : null}
        {usage.length ? (
          <div className={styles.scroll}>
            <table>
              <thead><tr><th>Endpoint</th><th>Requests</th><th>Errors</th><th>p95</th></tr></thead>
              <tbody>{usage.map((row) => <tr key={row.endpoint}><td><code>{row.endpoint}</code></td><td>{row.count}</td><td>{row.errors}</td><td>{row.p95} ms</td></tr>)}</tbody>
            </table>
          </div>
        ) : <p className={styles.note}>No requests yet this month.</p>}
      </section>

      <section className={styles.card} aria-labelledby="keys-title">
        <div className={styles.cardHeading}>
          <h2 id="keys-title">All keys</h2>
          {canManage && !creating ? <button type="button" className={`${styles.secondary} press`} onClick={() => setCreating(true)}><Plus size={15} aria-hidden />New key</button> : null}
        </div>
        {creating ? (
          <form className={styles.newKey} onSubmit={(event) => { event.preventDefault(); create(); }}>
            <label className={styles.field}>
              <span>Name</span>
              <input autoFocus maxLength={100} placeholder="e.g. Production server" value={label} onChange={(event) => setLabel(event.target.value)} />
            </label>
            <div className={styles.field}>
              <span>Type</span>
              <div className={styles.modeSwitch} role="group" aria-label="Key type">
                <button type="button" aria-pressed={mode === "test"} onClick={() => setMode("test")}>Test</button>
                <button type="button" aria-pressed={mode === "live"} onClick={() => setMode("live")}>Live</button>
              </div>
            </div>
            <div className={styles.newKeyActions}>
              <button type="submit" className={`${styles.primary} press`} disabled={pending}>{pending ? "Creating…" : "Create key"}</button>
              <button type="button" className={styles.iconButton} aria-label="Cancel new key" onClick={() => setCreating(false)}><X size={16} aria-hidden /></button>
            </div>
            <p className={styles.note}>{mode === "live" ? "Live keys are shown once. Store it somewhere safe." : "Test keys stay viewable here and work with sandbox data."}</p>
          </form>
        ) : null}
        <ul className={styles.keyList}>
          {keys.map((key) => (
            <li key={key.id} data-revoked={key.revoked || undefined}>
              <div className={styles.keyMeta}>
                <strong>{key.label}</strong>
                <small><code>{key.prefix}…</code> · {key.revoked ? "Revoked" : `${key.monthlyUsed ?? 0} requests this month`}</small>
              </div>
              <span className={styles.mode} data-mode={key.mode}>{key.mode === "live" ? "Live" : "Test"}</span>
              {canManage && !key.revoked ? (
                confirm === key.id ? (
                  <span className={styles.inlineConfirm} role="alert">
                    Revoke?
                    <button type="button" className={styles.danger} disabled={pending} onClick={() => revoke(key)}>{pending ? "Revoking…" : "Revoke"}</button>
                    <button type="button" disabled={pending} onClick={() => setConfirm(null)}>Cancel</button>
                  </span>
                ) : (
                  <button type="button" className={styles.iconButton} aria-label={`Revoke ${key.label}`} title="Revoke key" onClick={() => setConfirm(key.id)}><Trash2 size={15} aria-hidden /></button>
                )
              ) : <span />}
            </li>
          ))}
          {!keys.length ? <li className={styles.note}>No keys yet.</li> : null}
        </ul>
      </section>

      <p className={styles.footerLinks}>
        <Link href="/app/connectors">Run provider requests in your own environment</Link>
        <span aria-hidden>·</span>
        <Link href="/docs/pricing#routing">How routing and pricing work</Link>
      </p>
    </div>
  );
}
