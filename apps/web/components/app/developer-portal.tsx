"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowRight, Check, Copy, Eye, EyeOff, KeyRound, RefreshCw, Terminal, Trash2 } from "lucide-react";
import { CodeSample, TechnologyLogo } from "@railor/ui";
import { createKey, regenerateKey, revokeKey } from "../../app/app/developers/actions";
import { SETUP_CLIENTS, setupSnippet, type SetupClient } from "../../lib/developer-setup";
import styles from "./developer-portal.module.css";

export interface KeyRow { id: string; label: string; mode: "test" | "live"; prefix: string; secret: string | null; lastUsedAt: string | null; createdAt: string; revoked: boolean; monthlyUsed: number | null; monthlyCap: number | null }
export interface UsageRow { endpoint: string; count: number; errors: number; p95: number }
export interface DailyUsagePoint { day: string; count: number; errors: number }
export interface QuotaInfo { used: number; cap: number; mode: "test" | "live" }

export function DeveloperPortal({ keys, usage, dailySeries, quota, baseUrl, exampleQuery, canManage = false }: {
  keys: KeyRow[]; usage: UsageRow[]; dailySeries: DailyUsagePoint[]; quota: QuotaInfo | null; baseUrl: string; exampleQuery: Record<string, unknown>; canManage?: boolean;
}) {
  const [replacement, setReplacement] = useState<KeyRow | null>(null);
  const primary = replacement ?? keys.find(key => key.mode === "live" && !key.revoked) ?? keys.find(key => !key.revoked);
  const [revealed, setRevealed] = useState(false);
  const [client, setClient] = useState<SetupClient>("Claude Code");
  const [powershell, setPowershell] = useState(true);
  const [copied, setCopied] = useState(""); const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, start] = useTransition(); const [label, setLabel] = useState("");
  const [example, setExample] = useState(false);
  const [view, setView] = useState<"key" | "setup">("key");
  const secret = primary?.secret ?? undefined;
  const stamp = (value: string | null | undefined) => value ? `${new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC` : "Never";
  async function copy(text: string, target: string) {
    try { await navigator.clipboard.writeText(text); setCopied(target); setError(""); window.setTimeout(() => setCopied(""), 1800); }
    catch { setError("Clipboard is unavailable. Reveal and select the text to copy it manually."); }
  }
  const command = setupSnippet(client, baseUrl, secret ?? "YOUR_RAILOR_KEY", powershell);
  function rotate() {
    if (!primary) return;
    start(async () => { try {
      const result = await regenerateKey(primary.id);
      if (!result.ok) { setError("Couldn’t regenerate this key. Check your access and try again."); return; }
      setReplacement({ ...primary, id: result.id, secret: result.secret, prefix: result.secret.slice(0, 12), createdAt: new Date().toISOString(), lastUsedAt: null, monthlyUsed: 0 });
      setConfirm(null); setRevealed(false); setError("");
    } catch { setError("Couldn’t regenerate this key. Please try again."); } });
  }
  function create(mode: "test" | "live") {
    start(async () => { try {
      const result = await createKey(label.trim() || `${mode === "live" ? "Live" : "Test"} key`, mode);
      if (!result.ok) setError("Couldn’t create the key. Check your access.");
      else { setReplacement({ id: result.id, label: label.trim() || `${mode} key`, mode, prefix: result.secret.slice(0, 12), secret: result.secret, revoked: false, createdAt: new Date().toISOString(), lastUsedAt: null, monthlyUsed: 0, monthlyCap: null }); setLabel(""); setConfirm(null); setRevealed(false); }
    } catch { setError("Couldn’t create the key. Please try again."); } });
  }
  return <div className={styles.portal}>
    <header className={styles.heading}><span className="product-eyebrow">Build with Railor</span><h1>Developers</h1><p>One workspace key for Railor’s APIs and AI-tool connections.</p></header>
    <div className={styles.platform} role="tablist" aria-label="Developer setup"><button type="button" role="tab" id="developer-key-tab" aria-controls="developer-key-panel" aria-selected={view === "key"} tabIndex={view === "key" ? 0 : -1} onKeyDown={event => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); setView("setup"); document.getElementById("developer-setup-tab")?.focus(); } }} onClick={() => setView("key")}>API key</button><button type="button" role="tab" id="developer-setup-tab" aria-controls="developer-setup-panel" aria-selected={view === "setup"} tabIndex={view === "setup" ? 0 : -1} onKeyDown={event => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); setView("key"); document.getElementById("developer-key-tab")?.focus(); } }} onClick={() => setView("setup")}>Connect an AI tool</button></div>
    <section hidden={view !== "key"} id="developer-key-panel" role="tabpanel" aria-labelledby="developer-key-tab" className={styles.card}><div className={styles.cardHeading}><h2 id="primary-api-key"><KeyRound size={19} />Your API key</h2>{primary && <span className={styles.mode}>{primary.mode} mode</span>}</div>
      {primary ? <><div className={styles.key}><code>{revealed && secret ? secret : `${primary.prefix}${"•".repeat(24)}`}</code><button type="button" disabled={!secret} aria-label={revealed ? "Hide API key" : "Reveal API key"} onClick={() => setRevealed(value => !value)}>{revealed ? <EyeOff size={17} /> : <Eye size={17} />}</button><button type="button" className={styles.primary} disabled={!secret} onClick={() => copy(secret!, "key")}>{copied === "key" ? <Check size={15} /> : <Copy size={15} />}{copied === "key" ? "Copied" : "Copy"}</button></div>
      {!secret && <p className={styles.note}>{canManage ? "This key was shown once when created. Use your saved copy, or regenerate it below." : "Ask a workspace owner or admin for API access."}</p>}
      {replacement?.mode === "live" && <p className={styles.note}>Save this live key now. It is only available during this visit.</p>}
      <div className={styles.status} data-connected={Boolean(primary.lastUsedAt)}><Check size={15} />{primary.lastUsedAt ? "Connected · Railor received a request with this key." : "Ready · run your first request to verify the connection."}</div>
      <div className={styles.keyFooter}><div><span>Created: {stamp(primary.createdAt)}</span><span>Last used: {stamp(primary.lastUsedAt)}</span></div>{canManage && <button type="button" disabled={pending} onClick={() => setConfirm("rotate")}><RefreshCw size={13} />Regenerate key</button>}</div></> : <p className={styles.note}>No active API key. {canManage ? "Create one under advanced key management below." : "Ask your workspace admin for access."}</p>}
      {confirm === "rotate" && <div className={styles.confirm} role="alert"><p>Replace this key? Integrations using it will stop until you update them.</p><button type="button" disabled={pending} onClick={rotate}>{pending ? "Replacing…" : "Replace key"}</button><button type="button" disabled={pending} onClick={() => setConfirm(null)}>Cancel</button></div>}
      <div className={styles.firstRequest}><div><h3>Make your first request</h3><p>Choose a working example for your route.</p></div><button type="button" aria-expanded={example} onClick={() => setExample(value => !value)}>{example ? "Hide example" : "Choose an example"}</button></div><button type="button" className="mt-4 inline-flex items-center gap-1 text-xs text-[var(--color-orange-deep)]" onClick={() => setView("setup")}>Or connect an AI tool <ArrowRight size={12} /></button>
      {example && <CodeSample apiKey={secret} variants={[
        {language:"curl",label:"cURL",code:`curl "${baseUrl}/v1/corridors/search" -H "Authorization: Bearer RAILOR_API_KEY" -H "Content-Type: application/json" -d '${JSON.stringify(exampleQuery)}'`},
        {language:"ts",label:"TypeScript",code:`const response = await fetch("${baseUrl}/v1/corridors/search", {\n  method: "POST",\n  headers: { Authorization: "Bearer RAILOR_API_KEY", "Content-Type": "application/json" },\n  body: JSON.stringify(${JSON.stringify(exampleQuery, null, 2)})\n});\nconsole.log(await response.json());`},
        {language:"python",label:"Python",code:`import requests\nresponse = requests.post("${baseUrl}/v1/corridors/search", headers={"Authorization": "Bearer RAILOR_API_KEY"}, json=${JSON.stringify(exampleQuery)})\nprint(response.json())`},
      ]} />}
    </section>
    <section hidden={view !== "setup"} id="developer-setup-panel" role="tabpanel" aria-labelledby="developer-setup-tab" className={styles.card}><h2 id="setup-railor">Connect an AI tool</h2><p className={styles.note}>Choose your tool. Copy its setup, then ask it to compare a payment route.</p>
      <div className={styles.clients} aria-label="Choose an AI tool">{SETUP_CLIENTS.map(name => <button type="button" key={name} aria-pressed={client === name} onClick={() => setClient(name)}>{name === "Any MCP client" ? <Terminal size={20} /> : <TechnologyLogo name={name} size={22} />}{name}{client === name && <Check size={13} />}</button>)}</div>
      <div className={styles.setup}><h3>{client} setup</h3>{client === "Codex" && <div className={styles.platform} aria-label="Terminal type"><button type="button" aria-pressed={powershell} onClick={() => setPowershell(true)}>PowerShell</button><button type="button" aria-pressed={!powershell} onClick={() => setPowershell(false)}>macOS / Linux</button></div>}
      <p>{client === "Claude Code" || client === "Codex" ? "Run this in your terminal with the selected tool installed." : `Add this to ${client === "VS Code" ? ".vscode/mcp.json" : client === "Cursor" ? ".cursor/mcp.json" : "your client’s MCP configuration"}.`}</p>
      <div className={styles.snippet}><pre>{command.replaceAll(secret ?? "\0", "YOUR_RAILOR_KEY")}</pre><button type="button" className={styles.primary} onClick={() => copy(command, "setup")}>{copied === "setup" ? "Copied" : "Copy setup"}</button></div><p className={styles.note}>{secret ? "Your key is included when copied." : "Replace YOUR_RAILOR_KEY with your saved API key."}</p>
      <ol><li>Copy the setup into your tool or terminal.</li><li>Restart or reload the tool if needed.</li><li>Ask: “Compare providers for a payment from India to the UAE.”</li></ol><Link href="/docs/mcp">Setup help & supported tools <ArrowRight size={12} /></Link></div>
    </section>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <details className={styles.card}><summary>Usage & limits</summary><p className={styles.note}>{quota ? `${quota.used.toLocaleString()} / ${quota.cap.toLocaleString()} workspace requests this month` : "Usage is unavailable without an active key."}</p>{dailySeries.some(point => point.count > 0) && <div className={styles.usageChart} aria-label="Daily API requests">{dailySeries.map(point => <span key={point.day} title={`${point.day}: ${point.count} requests; ${point.errors} errors`} style={{height:`${Math.max(3, point.count / Math.max(1, ...dailySeries.map(item => item.count)) * 50)}px`}} />)}</div>}{usage.length ? <div className={styles.scroll}><table><thead><tr><th>Endpoint</th><th>Requests</th><th>Errors</th><th>p95</th></tr></thead><tbody>{usage.map(row => <tr key={row.endpoint}><td>{row.endpoint}</td><td>{row.count}</td><td>{row.errors}</td><td>{row.p95} ms</td></tr>)}</tbody></table></div> : <p className={styles.note}>No API requests recorded yet.</p>}</details>
    <details className={styles.card}><summary>Advanced key management</summary><p className={styles.note}>Test and live keys keep their existing permissions. Additional keys are optional.</p><div className={styles.scroll}><table><thead><tr><th>Key</th><th>Mode</th><th>Usage</th><th>Action</th></tr></thead><tbody>{keys.map(key => <tr key={key.id}><td>{key.label}<small>{key.prefix}… · {key.revoked ? "Revoked" : "Active"}</small></td><td>{key.mode}</td><td>{key.monthlyUsed ?? "—"}</td><td>{canManage && !key.revoked && <button type="button" aria-label={`Revoke ${key.label}`} onClick={() => setConfirm(key.id)}><Trash2 size={14} /></button>}{confirm === key.id && <span><button type="button" disabled={pending} onClick={() => start(async () => { try { const result = await revokeKey(key.id); if (!result.ok) setError("Couldn’t revoke key."); else { if (replacement?.id === key.id) setReplacement(null); setConfirm(null); } } catch { setError("Couldn’t revoke key."); } })}>Confirm revoke</button><button type="button" onClick={() => setConfirm(null)}>Cancel</button></span>}</td></tr>)}</tbody></table></div>{canManage && <div className={styles.newKey}><input aria-label="New key label" maxLength={100} placeholder="Key label" value={label} onChange={event => setLabel(event.target.value)} /><button type="button" disabled={pending} onClick={() => create("test")}>New test key</button><button type="button" disabled={pending} onClick={() => create("live")}>New live key</button></div>}</details>
    <details className={styles.card}><summary>Customer-hosted provider runtime</summary><p className={styles.note}>For teams running provider quote requests or sandbox simulations in their own environment. This uses a separate installation token. Start with API or AI-tool setup above for normal Railor access.</p><Link href="/app/connectors">Open runtime setup <ArrowRight size={12} /></Link></details>
    <p className={styles.note}><Link href="/docs/api">API reference</Link> · <Link href="/docs/pricing#routing">Routing and pricing coverage</Link></p>
  </div>;
}
