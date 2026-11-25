"use client";

import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ArrowUpRight, Clock3, Copy, KeyRound, MessageSquare, Plug, Route, Search, Terminal, X } from "lucide-react";
import { TechnologyLogo, useModalFocus } from "@railor/ui";
import { AGENT_FIRST_REQUEST, AGENT_KEY_PLACEHOLDER, AGENT_SETUP_PATH, MCP_CLIENT_INSTRUCTIONS, SETUP_CLIENTS, mcpEndpoint, setupSnippet, type SetupClient } from "../../lib/developer-setup";
import portal from "./developer-portal.module.css";
import styles from "./mcp-client-gallery.module.css";

const CLIENT_NAMES = [...SETUP_CLIENTS, "ChatGPT"] as const;
const CLIENT_LABELS: Record<SetupClient, string> = {
  Claude: "Custom connector",
  "Claude Code": "Terminal",
  Codex: "Terminal",
  Cursor: "Editor",
  "VS Code": "Editor",
  "Any MCP client": "Streamable HTTP",
};

function ClientIcon({ name }: { name: typeof CLIENT_NAMES[number] }) {
  if (name === "ChatGPT") return <MessageSquare size={21} aria-hidden />;
  if (name === "Any MCP client") return <Plug size={21} aria-hidden />;
  return <TechnologyLogo name={name} size={24} />;
}

export function McpClientGallery({ baseUrl }: { baseUrl: string }) {
  const [query, setQuery] = useState("");
  const [client, setClient] = useState<SetupClient | null>(null);
  const names = CLIENT_NAMES.filter((name) => name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <section className={portal.card} aria-labelledby="setup-railor">
      <div className={styles.header}>
        <div>
          <h2 id="setup-railor"><Plug size={18} aria-hidden /> MCP clients</h2>
          <p>Bring Railor prices, provider coverage, and sources into your AI tools.</p>
        </div>
        <Link href={AGENT_SETUP_PATH} className={portal.primary}>Set up your agent <ArrowRight size={15} aria-hidden /></Link>
      </div>
      <ol className={styles.overview} role="list">
        <li><Terminal size={16} aria-hidden /><span>Choose your client</span></li>
        <li><KeyRound size={16} aria-hidden /><span>Add your test key</span></li>
        <li><Route size={16} aria-hidden /><span>Compare a transfer</span></li>
      </ol>
      <label className={styles.search}><Search size={16} aria-hidden /><input type="search" placeholder="Search MCP clients" aria-label="Search MCP clients" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {names.length ? <ul className={styles.grid} role="list">
        {names.map((name) => (
          <li key={name}>
            {name === "ChatGPT" ? (
              <div className={styles.client}>
                <span className={styles.clientIcon}><ClientIcon name={name} /></span>
                <span><strong>{name}</strong><small><Clock3 size={12} aria-hidden /> Coming soon</small></span>
              </div>
            ) : (
              <button type="button" className={styles.client} onClick={() => setClient(name)} aria-haspopup="dialog">
                <span className={styles.clientIcon}><ClientIcon name={name} /></span>
                <span><strong>{name}</strong><small>{CLIENT_LABELS[name]}</small></span>
                <ArrowUpRight className={styles.clientArrow} size={16} aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul> : <p className={styles.empty} role="status">No MCP clients match your search.</p>}
      <Link href="/docs/mcp" className={styles.docs}>MCP documentation <ArrowUpRight size={14} aria-hidden /></Link>
      {client && typeof document !== "undefined" ? createPortal(
        <ClientDialog client={client} baseUrl={baseUrl} onClose={() => setClient(null)} />,
        document.body,
      ) : null}
    </section>
  );
}

function ClientDialog({ client, baseUrl, onClose }: { client: SetupClient; baseUrl: string; onClose: () => void }) {
  const panel = useModalFocus<HTMLDivElement>(true, onClose);
  const [powershell, setPowershell] = useState(true);
  const [notice, setNotice] = useState("");
  const url = mcpEndpoint(baseUrl);
  const snippet = setupSnippet(client, baseUrl, AGENT_KEY_PLACEHOLDER, powershell);

  async function copy(value: string, label: string) {
    setNotice("");
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setNotice("Clipboard access is blocked. Select the text to copy it manually.");
    }
  }

  return (
    <div className={styles.overlay} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="mcp-client-dialog-title" tabIndex={-1} className={styles.dialog}>
        <header className={styles.dialogHead}>
          <span className={styles.clientIcon}><ClientIcon name={client} /></span>
          <div><h2 id="mcp-client-dialog-title">Connect {client === "Any MCP client" ? "your MCP client" : client}</h2><p>Streamable HTTP · Railor test key</p></div>
          <button type="button" onClick={onClose} aria-label="Close setup" className={styles.close}><X size={20} aria-hidden /></button>
        </header>
        <ol className={styles.steps} role="list">
          <li>
            <h3>Copy the server URL</h3>
            <div className={styles.endpoint}><code>{url}</code><button type="button" onClick={() => copy(url, "Server URL")} aria-label="Copy server URL"><Copy size={16} aria-hidden /></button></div>
          </li>
          <li>
            <h3>Add Railor to your client</h3>
            <p>{MCP_CLIENT_INSTRUCTIONS[client]}</p>
            <p>Replace the placeholder with your test key in your client or terminal.</p>
            {client === "Codex" ? <div className={styles.platform} role="group" aria-label="Terminal type">
              <button type="button" aria-pressed={powershell} onClick={() => setPowershell(true)}>PowerShell</button>
              <button type="button" aria-pressed={!powershell} onClick={() => setPowershell(false)}>macOS / Linux</button>
            </div> : null}
            <pre>{snippet}</pre>
            <button type="button" className={styles.copy} onClick={() => copy(snippet, "Setup snippet")}><Copy size={15} aria-hidden /> Copy setup snippet</button>
          </li>
          <li>
            <h3>Try your first comparison</h3>
            <p>{AGENT_FIRST_REQUEST}</p>
            <button type="button" className={styles.copy} onClick={() => copy(AGENT_FIRST_REQUEST, "Prompt")}><Copy size={15} aria-hidden /> Copy prompt</button>
          </li>
        </ol>
        <footer className={styles.dialogFooter}>
          <span role="status">{notice}</span>
          <Link href={`${AGENT_SETUP_PATH}?client=${encodeURIComponent(client)}`} className={portal.primary} onClick={onClose}>Get your test key <ArrowRight size={15} aria-hidden /></Link>
        </footer>
      </div>
    </div>
  );
}
