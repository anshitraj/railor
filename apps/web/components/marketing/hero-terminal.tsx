"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";
import styles from "./hero-terminal.module.css";

const query = { entity_country: "IN", destination_country: "AE", source_asset: "USDC", source_network: "base", destination_currency: "AED", customer_type: "business" };
const variants = [
  { label: "Terminal", code: "railor corridors search --entity IN --to AE --asset USDC --network base --currency AED" },
  { label: "Python", code: `import os, requests\nr = requests.post("https://www.railor.xyz/v1/corridors/search", headers={"Authorization": "Bearer " + os.environ["RAILOR_API_KEY"]}, json=${JSON.stringify(query)})\nprint(r.json())` },
  { label: "TypeScript", code: `const response = await fetch("https://www.railor.xyz/v1/corridors/search", { method: "POST", headers: { Authorization: \`Bearer \${process.env.RAILOR_API_KEY}\`, "Content-Type": "application/json" }, body: JSON.stringify(${JSON.stringify(query)}) });\nconsole.log(await response.json());` },
  { label: "cURL", code: `curl https://www.railor.xyz/v1/corridors/search -H "Authorization: Bearer $RAILOR_API_KEY" -H "Content-Type: application/json" -d '${JSON.stringify(query)}'` },
];

export function HeroTerminal() {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timeout.current) clearTimeout(timeout.current); }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(variants[active]!.code);
      setCopied(true); setCopyError(false);
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = setTimeout(() => setCopied(false), 1800);
    } catch { setCopyError(true); }
  };
  return <div className={styles.terminal}>
    <div className={styles.tabs} role="group" aria-label="API example language">
      {variants.map((variant, index) => <button type="button" key={variant.label} aria-pressed={active === index} onClick={() => { setActive(index); setCopied(false); setCopyError(false); }}><span>{index === 0 && <Terminal size={11} />}{variant.label}</span></button>)}
      <span className={styles.liveDot} aria-hidden />
    </div>
    <div className={styles.command}><span aria-hidden>$</span><code tabIndex={0} aria-label={`${variants[active]!.label} corridor search example`}>{variants[active]!.code}</code><button type="button" onClick={copy} aria-label={copied ? "Command copied" : "Copy corridor command"}>{copied ? <Check size={15} /> : <Copy size={15} />}</button></div>
    <span role="status" className={copyError ? styles.copyError : "sr-only"}>{copyError ? "Copy unavailable. Select the command to copy it." : copied ? "Command copied to clipboard" : ""}</span>
  </div>;
}
