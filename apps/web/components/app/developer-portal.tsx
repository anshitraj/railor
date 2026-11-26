"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Copy, Eye, EyeOff, KeyRound, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { CodeSample } from "@railor/ui";
import { createKey, regenerateKey, revokeKey } from "../../app/app/developers/actions";
import { AGENT_SETUP_PATH, PRICE_EXAMPLE } from "../../lib/developer-setup";
import { toast } from "../toast";
import styles from "./developer-portal.module.css";
import { McpClientGallery } from "./mcp-client-gallery";

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
export function DeveloperPortal({ keys, usage, dailySeries, quota, baseUrl, canManage = false }: {
  keys: KeyRow[]; usage: UsageRow[]; dailySeries: DailyUsagePoint[]; quota: QuotaInfo | null; baseUrl: string; canManage?: boolean;
}) {
  const router = useRouter();
  const [fresh, setFresh] = useState<KeyRow | null>(null);
  const active = keys.filter((key) => !key.revoked);
  const primary = (fresh && !keys.find((key) => key.id === fresh.id)?.revoked ? fresh : null) ?? active.find((key) => key.mode === "live") ?? active[0];
  const secret = primary?.id === fresh?.id ? fresh?.secret ?? undefined : primary?.secret ?? undefined;
  const [revealed, setRevealed] = useState(false);
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
            <div className={styles.key} data-revealed={(revealed && secret) || undefined}>
              <code aria-label="API key">{revealed && secret ? secret : `${primary.prefix}${"•".repeat(22)}`}</code>
              <button type="button" className={`${styles.iconButton} press`} disabled={!secret} aria-label={revealed ? "Hide API key" : "Reveal API key"} title={secret ? undefined : "Only shown once when created"} onClick={() => setRevealed((value) => !value)}>
                {revealed ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
              </button>
              <button type="button" className={`${styles.primary} press`} disabled={!secret} onClick={() => copy(secret!, "key", "API key copied")}>
                {copied === "key" ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}<span className={styles.copyLabel}>{copied === "key" ? "Copied" : "Copy"}</span>
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
            {canManage ? <Link href={AGENT_SETUP_PATH} className={`${styles.primary} press`}><Plus size={15} aria-hidden />Create a test key</Link> : <p className={styles.note}>Ask your workspace admin for access.</p>}
          </div>
        )}

        <div className={styles.firstRequest}>
          <h3>Your first request</h3>
          <p>{revealed && secret ? "Copy and run this example with your key." : "Replace the placeholder with your API key, or reveal your key above to fill it in."}</p>
          <CodeSample apiKey={revealed ? secret : undefined} variants={[
            { language: "curl", label: "cURL", code: `curl "${baseUrl}/v1/prices" \\\n  -H "Authorization: Bearer RAILOR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(PRICE_EXAMPLE)}'` },
            { language: "ts", label: "TypeScript", code: `const response = await fetch("${baseUrl}/v1/prices", {
  method: "POST",
  headers: { Authorization: "Bearer RAILOR_API_KEY", "Content-Type": "application/json" },
  body: JSON.stringify(${JSON.stringify(PRICE_EXAMPLE, null, 2)}),
});
console.log(await response.json());` },
            { language: "python", label: "Python", code: `import requests

response = requests.post(
    "${baseUrl}/v1/prices",
    headers={"Authorization": "Bearer RAILOR_API_KEY"},
    json=${JSON.stringify(PRICE_EXAMPLE)},
)
print(response.json())` },
          ]} />
        </div>
      </section>

      <McpClientGallery baseUrl={baseUrl} />

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
        <Link href="/docs/pricing#routing">How routing and pricing work</Link>
      </p>
    </div>
  );
}
