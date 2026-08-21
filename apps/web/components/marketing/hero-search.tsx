"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Search } from "lucide-react";
import {
  Button,
  Chip,
  InterpretationBar,
  ResultRow,
  VerdictPill,
  WhyPanel,
  type PickerOption,
  type Verdict,
} from "@railor/ui";
import { CurrencyLogo, type CurrencySymbol } from "./currency-logo";
import { CountryFlag, type CountryCode } from "./country-flag";

interface SearchResponse {
  interpretation: {
    input: string;
    query: Record<string, string | number | undefined>;
    tokens: Array<{
      field: string;
      value: string | number;
      label: string;
      confidence: number;
      matchedText?: string;
    }>;
    missing: string[];
  };
  providersChecked: number;
  counts: Record<Verdict, number>;
  results: Array<{
    provider: { slug: string; name: string; category: string };
    eligibility: Verdict;
    confidence: number;
    lastVerifiedAt: string | null;
    reasons: Array<{ code: string; message: string; alsoTrue: string[]; wouldChange: string[] }>;
    facts: Record<string, string | undefined>;
    evidence: Array<{
      sourceUrl: string;
      sourceTitle: string;
      sourceType: string;
      retrievedAt: string;
      lastVerifiedAt: string;
      confidence: number;
      rawExcerpt?: string;
    }>;
  }>;
  authenticated: boolean;
}

const PLACEHOLDERS = [
  "USDC → AED business payouts from India",
  "Virtual card providers for UAE customers",
  "Stablecoin off-ramps supporting Nigerian businesses",
  "Which providers support Base + EUR payouts?",
  "Compare business ramps in the GCC",
];

const EXAMPLES: Array<{
  query: string;
  source: CountryCode;
  destination: CountryCode;
  asset: CurrencySymbol;
  label: string;
}> = [
  { query: "Indian company sending USDC to a UAE supplier who receives AED", source: "IN", destination: "AE", asset: "USDC", label: "India to UAE" },
  { query: "USDT off-ramp to NGN for a Nigerian business", source: "WORLD", destination: "NG", asset: "USDT", label: "to Nigeria" },
  { query: "Virtual cards for a UAE company funded with USDC", source: "AE", destination: "AE", asset: "USDC", label: "UAE cards" },
  { query: "EUR payouts from a Singapore entity using EURC", source: "SG", destination: "EU", asset: "EURC", label: "to Europe" },
];

const PIPELINE = [
  "Understanding request",
  "Checking providers",
  "Matching entity eligibility",
  "Checking corridor availability",
  "Comparing capabilities",
];

export function HeroSearch({
  optionsByField,
  fieldLabels,
}: {
  optionsByField: Record<string, PickerOption[]>;
  fieldLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [placeholder, setPlaceholder] = useState(0);
  const [stage, setStage] = useState(-1);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const runIdRef = useRef(0);

  useEffect(() => {
    if (input || data) return;
    const id = window.setInterval(() => setPlaceholder((p) => (p + 1) % PLACEHOLDERS.length), 3600);
    return () => window.clearInterval(id);
  }, [input, data]);

  /**
   * The pipeline states are tied to the real request: if the answer lands
   * first, the sequence completes immediately. Railor never fakes latency.
   */
  const run = async (text: string, overrides?: Record<string, string>) => {
    if (!text.trim() && !overrides) return;
    // A run id, not just a boolean: if the user fires a second search before
    // the first settles (editing a chip while a request is in flight), the
    // stale run's own timer and eventual response must not touch state
    // anymore — only the most recent run is allowed to.
    const runId = ++runIdRef.current;
    setPending(true);
    setStage(0);
    setData(null);
    const ticker = window.setInterval(() => {
      if (runIdRef.current !== runId) return;
      setStage((s) => (s < PIPELINE.length - 1 ? s + 1 : s));
    }, 160);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: text, query: overrides }),
      });
      const json: SearchResponse = await response.json();
      if (runIdRef.current !== runId) return;
      setData(json);
      setStage(-1);
    } finally {
      window.clearInterval(ticker);
      if (runIdRef.current === runId) {
        setStage(-1);
        setPending(false);
      }
    }
  };

  const editToken = (field: string, value: string) => {
    const query = { ...(data?.interpretation.query ?? {}), [field]: value } as Record<string, string>;
    void run(input || data?.interpretation.input || "", query);
  };

  const continueToFull = () => {
    const q = encodeURIComponent(input || data?.interpretation.input || "");
    router.push(`/login?intent=start&q=${q}`);
  };

  return (
    <div id="search" className="flex w-full flex-col gap-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(input);
        }}
        className="relative"
      >
        <div className="flex flex-col gap-2 rounded-[20px] border border-[var(--color-line-strong)] bg-white p-2 shadow-[var(--shadow-soft)] transition focus-within:border-[var(--color-orange)] focus-within:shadow-[var(--shadow-lift)] sm:flex-row sm:items-center sm:rounded-full sm:pl-5">
          <Search size={18} className="ml-2 hidden shrink-0 text-[var(--color-faint)] sm:block" aria-hidden />
          <div className="relative flex-1">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full bg-transparent px-2 py-2.5 text-[14px] outline-none sm:px-0 sm:text-[15px]"
              aria-label="Describe the infrastructure you need"
            />
            {!input ? (
              <AnimatePresence mode="wait">
                <motion.span
                  key={placeholder}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                  className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-[15px] text-[var(--color-faint)]"
                >
                  {PLACEHOLDERS[placeholder]}
                </motion.span>
              </AnimatePresence>
            ) : null}
          </div>
          <Button type="submit" disabled={pending} className="w-full shrink-0 sm:w-auto">
            {pending ? "Checking…" : "Search rails"}
          </Button>
        </div>
      </form>

      {!data ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-[var(--color-faint)]">Try</span>
          {EXAMPLES.map((example) => (
            <Chip
              key={example.query}
              onClick={() => {
                setInput(example.query);
                void run(example.query);
              }}
              className="inline-flex items-center gap-1.5 text-[12px]"
            >
              <CountryFlag code={example.source} size={14} />
              <CurrencyLogo symbol={example.asset} size={16} />
              <span>{example.label}</span>
              <CountryFlag code={example.destination} size={14} />
            </Chip>
          ))}
        </div>
      ) : null}

      {/* Plain conditional, not AnimatePresence: this list only ever needs
          to fade in, never out — it disappears the instant real results (or
          an error) exist. Animating its *exit* pulled in AnimatePresence's
          unmount-on-exit-complete lifecycle, which left a zero-opacity,
          zero-content but still-laid-out node behind indefinitely. A plain
          conditional unmounts on the next render, unconditionally, the way
          React normally does — no animation library callback required. */}
      {stage >= 0 && !data ? (
        <motion.ul
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col gap-1.5 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white p-4"
        >
          {PIPELINE.map((label, i) => (
            <li
              key={label}
              className={`flex items-center gap-2 text-[13px] ${
                i <= stage ? "text-[var(--color-ink)]" : "text-[var(--color-faint)]"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  i < stage
                    ? "bg-[var(--color-ok)]"
                    : i === stage
                      ? "animate-pulse bg-[var(--color-purple)]"
                      : "bg-[var(--color-line-strong)]"
                }`}
              />
              {label}
              {i < stage ? <span className="text-[var(--color-ok)]">✓</span> : null}
            </li>
          ))}
        </motion.ul>
      ) : null}

      {data ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]"
        >
          <div className="flex flex-col gap-2">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
              Railor read your question as
            </p>
            <InterpretationBar
              tokens={data.interpretation.tokens}
              missing={data.interpretation.missing}
              optionsByField={optionsByField}
              fieldLabels={fieldLabels}
              onChange={editToken}
              dense
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-[var(--color-line)] py-3">
            <Metric value={data.providersChecked} label="providers checked" />
            <Metric value={data.counts.supported} label="appear compatible" tone="ok" />
            <Metric
              value={data.counts.additional_requirements}
              label="need additional KYB"
              tone="warn"
            />
            <Metric value={data.counts.unavailable} label="unavailable" tone="bad" />
            {data.counts.unknown ? (
              <Metric value={data.counts.unknown} label="insufficient data" />
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            {data.results.map((result) => (
              <ResultRow
                key={result.provider.slug}
                name={result.provider.name}
                category={result.provider.category}
                verdict={result.eligibility}
                confidence={result.confidence}
                lastVerifiedAt={result.lastVerifiedAt}
                blurred={!data.authenticated}
                onUnlock={continueToFull}
                facts={Object.entries(result.facts)
                  .filter(([, v]) => Boolean(v))
                  .slice(0, 3)
                  .map(([k, v]) => ({ label: prettyFact(k), value: String(v) }))}
              >
                <WhyPanel
                  providerName={result.provider.name}
                  verdict={result.eligibility}
                  reasons={result.reasons}
                  evidence={result.evidence}
                  lastVerifiedAt={result.lastVerifiedAt}
                />
              </ResultRow>
            ))}
          </div>

          {!data.authenticated ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] bg-[var(--color-lavender)] p-4">
              <div className="flex flex-col gap-1">
                <p className="text-[14px] font-medium text-[var(--color-purple-deep)]">
                  {data.counts.supported + data.counts.additional_requirements} providers could work
                  — see fees, limits, requirements and sources.
                </p>
                <p className="text-[12.5px] text-[var(--color-ink-soft)]">
                  Your question carries over. No forms before you see the answer.
                </p>
              </div>
              <Button onClick={continueToFull}>View full comparison</Button>
            </div>
          ) : (
            <Button onClick={() => router.push("/app/corridors")}>Open in Corridor Explorer</Button>
          )}
        </motion.div>
      ) : null}
    </div>
  );
}

function Metric({
  value,
  label,
  tone = "default",
}: {
  value: number;
  label: string;
  tone?: "default" | "ok" | "warn" | "bad";
}) {
  const color =
    tone === "ok"
      ? "text-[var(--color-ok)]"
      : tone === "warn"
        ? "text-[var(--color-warn)]"
        : tone === "bad"
          ? "text-[var(--color-bad)]"
          : "text-[var(--color-ink)]";
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`tabular text-[20px] font-semibold ${color}`}>{value}</span>
      <span className="text-[13px] text-[var(--color-muted)]">{label}</span>
    </span>
  );
}

function prettyFact(key: string) {
  const map: Record<string, string> = {
    productLabel: "Product",
    feeSummary: "Fees",
    limitSummary: "Limits",
    settlementSummary: "Settlement",
    kybSummary: "KYB",
  };
  return map[key] ?? key;
}

export { VerdictPill };
