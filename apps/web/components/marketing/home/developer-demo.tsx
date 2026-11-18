"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Check, Copy, RotateCcw, Smartphone } from "lucide-react";
import { TechnologyLogo } from "@railor/ui";
import styles from "./developer-demo.module.css";

const examples = [
  {
    name: "Node.js",
    kind: "sdk",
    code: `import { Railor } from "@railor/sdk"

const { data } =
  await new Railor().prices.check({
    sourceCurrency: "USD",
    destinationCurrency: "INR",
    amount: 1000,
  })`,
  },
  {
    name: "Python",
    kind: "sdk",
    code: `from railor import Railor

prices = Railor().prices.check(
    source_currency="USD",
    destination_currency="INR",
    amount=1000,
)
print(prices["data"])`,
  },
  {
    name: "Flutter",
    kind: "backend",
    code: `import 'package:http/http.dart'
    as http;

Future<http.Response> getQuote() =>
  http.get(Uri.https(
    'api.yourapp.com', '/quote',
    {'from': 'USD', 'to': 'INR',
     'amount': '1000'},
  ));`,
  },
] as const;

const tokens = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:import|from|as|const|await|Future)\b|\b\d+\b)/g;

function highlighted(line: string) {
  return line.split(tokens).map((part, index) => {
    if (index % 2 === 0) return part;
    const tone = /^["']/.test(part) ? styles.string : /^\d/.test(part) ? styles.number : styles.keyword;
    return <span className={tone} key={index}>{part}</span>;
  });
}

function CodeLines({ code }: { code: string }) {
  let delay = 100;
  return (
    <code>
      <span className="sr-only select-none">{code}</span>
      <span aria-hidden="true">
        {code.split("\n").map((line, index) => {
          const duration = Math.max(90, line.length * 11);
          const timing = {
            "--columns": line.length,
            "--duration": `${duration}ms`,
            "--delay": `${delay}ms`,
          } as CSSProperties;
          delay += line ? duration + 44 : 76;
          return (
            <span key={index} className={styles.line}>
              <span className={styles.lineNumber}>{index + 1}</span>
              {line && <span className={styles.lineTrack} style={timing}>
                <span className={styles.lineText}>{highlighted(line)}</span>
                <span className={styles.caret} />
              </span>}
            </span>
          );
        })}
      </span>
    </code>
  );
}

export function DeveloperDemo() {
  const id = useId();
  const preview = useRef<HTMLPreElement>(null);
  const copyTimer = useRef<number>(undefined);
  const [active, setActive] = useState(0);
  const [entered, setEntered] = useState(false);
  const [motion, setMotion] = useState(false);
  const [replay, setReplay] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");
  const example = examples[active] ?? examples[0];

  useEffect(() => {
    const element = preview.current;
    if (!element || !("IntersectionObserver" in window)) return;
    const preference = matchMedia("(prefers-reduced-motion: no-preference)");
    const sync = () => setMotion(preference.matches);
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || entry.intersectionRatio < .25) return;
      setEntered(true);
      observer.disconnect();
    }, { threshold: .25 });
    sync();
    preference.addEventListener("change", sync);
    observer.observe(element);
    return () => {
      preference.removeEventListener("change", sync);
      observer.disconnect();
    };
  }, []);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  function select(index: number) {
    if (index === active) return;
    setActive(index);
    setCopyStatus("");
    window.clearTimeout(copyTimer.current);
  }

  function moveTab(event: KeyboardEvent<HTMLDivElement>) {
    let next: number;
    if (event.key === "ArrowRight") next = (active + 1) % examples.length;
    else if (event.key === "ArrowLeft") next = (active + examples.length - 1) % examples.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = examples.length - 1;
    else return;
    event.preventDefault();
    select(next);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(example.code);
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Copy failed");
    }
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopyStatus(""), 1700);
  }

  return (
    <div className={styles.window}>
      <div className={styles.toolbar}>
        <span className={styles.endpoint}>
          {example.kind === "backend" ? <><span>GET</span> /quote</> : <><span>POST</span> /v1/prices</>}
        </span>
        <div className={styles.actions}>
          {motion && <button type="button" aria-label="Replay typing" title="Replay typing" onClick={() => setReplay((value) => value + 1)}><RotateCcw size={14} aria-hidden /></button>}
          <button type="button" aria-label="Copy full example" onClick={copy}>
            {copyStatus === "Copied" ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            <span aria-live="polite">{copyStatus || "Copy"}</span>
          </button>
        </div>
      </div>
      <div className={styles.tabs} role="tablist" aria-label="Price check examples" onKeyDown={moveTab}>
        {examples.map(({ name, kind }, index) => (
          <button key={name} type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel`} aria-selected={index === active} tabIndex={index === active ? 0 : -1} onClick={() => select(index)}>
            {kind === "backend" ? <Smartphone className={styles.phone} size={16} aria-hidden /> : <TechnologyLogo name={name} size={16} />}
            {name}
          </button>
        ))}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${active}`}>
        <pre ref={preview} className={styles.preview} data-typing={motion ? entered ? "play" : "ready" : undefined}>
          <CodeLines key={`${active}-${replay}`} code={example.code} />
        </pre>
        <p className={styles.caption}>
          {example.kind === "backend" ? "Call your backend from Flutter. Store the Railor key on the server." : <>Reads <code>RAILOR_API_KEY</code> from your environment.</>}
        </p>
      </div>
    </div>
  );
}
