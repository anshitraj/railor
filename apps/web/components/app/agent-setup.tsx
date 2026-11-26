"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Copy, Eye, EyeOff, KeyRound, Radio, Route, Terminal } from "lucide-react";
import { TechnologyLogo } from "@railor/ui";
import { prepareAgentKey } from "../../app/app/developers/actions";
import { AGENT_FIRST_REQUEST, AGENT_KEY_PLACEHOLDER, MCP_CLIENT_INSTRUCTIONS, SETUP_CLIENTS, agentSetupPrompt, setupSnippet, usesOAuth, type SetupClient } from "../../lib/developer-setup";
import { RailorMark } from "../brand";
import styles from "./agent-setup.module.css";

const STEPS = ["Choose a client", "Connect to Railor", "Try a request"] as const;
const TITLES = ["Set up your agent", "Connect your agent", "Make your first request"] as const;

function ClientMark({ client }: { client: SetupClient }) {
  return client === "Any MCP client" ? <Terminal size={23} aria-hidden /> : <TechnologyLogo name={client} size={23} />;
}

export function AgentSetup({ baseUrl, canManage, initialClient }: { baseUrl: string; canManage: boolean; initialClient: SetupClient }) {
  const [client, selectClient] = useState(initialClient);
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const [key, setKey] = useState<{ secret: string; created: boolean } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [powershell, setPowershell] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  const prompt = agentSetupPrompt(client, baseUrl);
  const command = setupSnippet(client, baseUrl, AGENT_KEY_PLACEHOLDER, powershell);

  useEffect(() => {
    if (step !== previousStep.current) {
      previousStep.current = step;
      heading.current?.focus();
    }
  }, [step]);

  function go(next: number) {
    setNotice("");
    setError("");
    setRevealed(false);
    setStep(next);
  }

  function connect() {
    if (pending) return;
    if (!canManage || key || usesOAuth(client)) {
      go(1);
      return;
    }
    setError("");
    start(async () => {
      try {
        const result = await prepareAgentKey();
        if (!result.ok) {
          setError("Ask a workspace owner or admin to prepare a test key.");
          return;
        }
        setKey(result);
        go(1);
      } catch {
        setError("Railor couldn’t prepare the test key. Try again.");
      }
    });
  }

  async function copy(value: string, label: string) {
    setNotice("");
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(`Clipboard access is blocked. Select ${label.toLowerCase()} and copy it manually.`);
    }
  }

  return (
    <div className={styles.shell}>
      <Link className={styles.back} href="/app/developers#setup-railor"><ArrowLeft size={16} aria-hidden /> Developers</Link>
      <div className={styles.layout}>
        <div className={styles.wizard}>
          <ol className={styles.progress} aria-label="Setup progress" role="list">
            {STEPS.map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined} data-done={index < step || undefined}><span aria-hidden>{index < step ? <Check size={14} /> : index + 1}</span>{label}</li>)}
          </ol>
          <div className={styles.step} key={step}>
            <header className={styles.header}>
              <h1 ref={heading} tabIndex={-1}>{TITLES[step]}</h1>
              <p>{step === 0 ? "Choose where you want to use Railor’s prices and routes." : step === 1 ? `Add Railor to ${client === "Any MCP client" ? "your MCP client" : client} using the setup below.` : "Paste this example into your connected client to see Railor in action."}</p>
            </header>

            {step === 0 ? (
              <>
                <fieldset className={styles.clients}>
                  <legend className="sr-only">Choose an AI client</legend>
                  {SETUP_CLIENTS.map((option) => <label key={option} className={styles.client}>
                    <input className="sr-only" name="agent-client" type="radio" value={option} checked={option === client} onChange={() => selectClient(option)} disabled={pending} />
                    <span className={styles.clientTile}><ClientMark client={option} />{option}<Check size={16} className={styles.selectedIcon} aria-hidden /></span>
                  </label>)}
                </fieldset>
                <p className={styles.note}>{usesOAuth(client) ? `${client} asks you to sign in to Railor when you connect. No key to paste.` : canManage ? "Railor prepares a workspace test key when you continue." : "Ask a workspace owner or admin for a test key before you connect."}</p>
              </>
            ) : step === 1 ? (
              <>
                {usesOAuth(client) ? <section className={styles.keyBox} aria-labelledby="agent-oauth"><div className={styles.boxHead}><h2 id="agent-oauth"><KeyRound size={16} aria-hidden /> Sign in with Railor</h2></div><p className={styles.note}>When you connect, {client} sends you to Railor to sign in and approve. There is no key to copy, and you can disconnect it later under Developers → All keys.</p></section> : key ? <section className={styles.keyBox} aria-labelledby="agent-test-key">
                  <div className={styles.boxHead}><h2 id="agent-test-key"><KeyRound size={16} aria-hidden /> Your test API key</h2><span>{key.created ? "New key" : "Existing key"}</span></div>
                  <div className={styles.keyLine}>
                    <code>{revealed ? key.secret : `${key.secret.slice(0, 12)}••••••••••••`}</code>
                    <button type="button" className={styles.iconAction} aria-label={revealed ? "Hide test key" : "Reveal test key"} aria-pressed={revealed} onClick={() => setRevealed(!revealed)}>{revealed ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}</button>
                    <button type="button" className={styles.iconAction} aria-label="Copy test key" onClick={() => copy(key.secret, "Test key")}><Copy size={17} aria-hidden /></button>
                  </div>
                  <p className={styles.note}>Enter the key in your client or local environment. Keep it out of chat.</p>
                </section> : <p className={styles.note}>Use a workspace test key supplied by your owner or admin.</p>}
                <div className={styles.promptBox}>
                  <div className={styles.boxHead}><h2>Setup prompt</h2></div>
                  <p className={styles.promptPreview}>{prompt.split("\n")[0]}</p>
                  <details>
                    <summary>Read full prompt</summary>
                    <div className={styles.promptText}>{prompt}</div>
                  </details>
                  <button type="button" className={styles.secondary} onClick={() => copy(prompt, "Setup prompt")}><Copy size={16} aria-hidden /> Copy prompt</button>
                </div>
                <details className={styles.snippetBox}>
                  <summary>Install manually</summary>
                  <p className={styles.note}>{MCP_CLIENT_INSTRUCTIONS[client]}</p>
                  {usesOAuth(client) ? null : <p className={styles.note}>Replace <code>{AGENT_KEY_PLACEHOLDER}</code> locally with your test key.</p>}
                  {client === "Codex" ? <div className={styles.platform} role="group" aria-label="Terminal type">
                    <button type="button" aria-pressed={powershell} onClick={() => setPowershell(true)}>PowerShell</button>
                    <button type="button" aria-pressed={!powershell} onClick={() => setPowershell(false)}>macOS / Linux</button>
                  </div> : null}
                  <pre>{command}</pre>
                  <button type="button" className={styles.secondary} onClick={() => copy(command, "Setup snippet")}><Copy size={16} aria-hidden /> Copy setup snippet</button>
                </details>
              </>
            ) : (
              <div className={styles.promptBox}>
                <div className={styles.boxHead}><h2><Route size={17} aria-hidden /> Compare a transfer</h2></div>
                <p className={styles.promptText}>{AGENT_FIRST_REQUEST}</p>
                <button type="button" className={styles.secondary} onClick={() => copy(AGENT_FIRST_REQUEST, "Example request")}><Copy size={16} aria-hidden /> Copy request</button>
              </div>
            )}
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            {step > 0 ? <p className={styles.notice} role="status">{notice}</p> : null}
            <div className={styles.actions}>
              {step > 0 ? <button type="button" className={styles.back} onClick={() => go(step - 1)}><ArrowLeft size={16} aria-hidden /> Back</button> : null}
              {step === 2 ? <Link className={styles.primary} href="/app/developers">Back to Developers<ArrowRight size={17} aria-hidden /></Link>
                : <button type="button" className={styles.primary} disabled={pending} onClick={step === 0 ? connect : () => go(2)}>{pending ? "Preparing test key…" : "Continue"}<ArrowRight size={17} aria-hidden /></button>}
            </div>
          </div>
        </div>

        <aside className={styles.diagram} aria-label="How the connection works">
          <div className={styles.diagramTitle}><Radio size={19} aria-hidden /> Railor MCP</div>
          <div className={styles.connection}>
            <div><span className={styles.nodeIcon}><ClientMark client={client} /></span><strong>{client}</strong></div>
            <span className={styles.line} aria-hidden><i /></span>
            <div><span className={styles.nodeIcon}><RailorMark size={29} /></span><strong>Railor</strong></div>
          </div>
          <div className={styles.diagramInfo}>
            <h2>Payment data in your agent</h2>
            <p>Compare transfer prices, check provider coverage, and bring source links into the conversation.</p>
            <Link href="/docs/mcp">MCP documentation <ArrowUpRight size={15} aria-hidden /></Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
