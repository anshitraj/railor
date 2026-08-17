"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
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

const EXAMPLES = [
  "Indian company sending USDC to a UAE supplier who receives AED",
  "USDC off-ramp to NGN for a Nigerian business",
  "Virtual cards for a UAE company",
  "EUR payouts from a Singapore entity",
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
    setPending(true);
    setStage(0);
    const ticker = window.setInterval(
      () => setStage((s) => (s < PIPELINE.length - 1 ? s + 1 : s)),
      160,
    );
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: text, query: overrides }),
      });
      const json: SearchResponse = await response.json();
      setData(json);
    } finally {
      window.clearInterval(ticker);
      setStage(-1);
      setPending(false);
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
        <div className="flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-white p-2 pl-5 shadow-[var(--shadow-soft)] transition focus-within:border-[var(--color-violet)] focus-within:shadow-[var(--shadow-lift)]">
          <span className="text-[var(--color-faint)]" aria-hidden>
            ⌕
          </span>
          <div className="relative flex-1">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full bg-transparent py-2.5 text-[15px] outline-none"
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
          <Button type="submit" disabled={pending}>
            {pending ? "Checking…" : "Search rails"}
          </Button>
        </div>
      </form>

      {!data ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-[var(--color-faint)]">Try</span>
          {EXAMPLES.map((example) => (
            <Chip
              key={example}
              onClick={() => {
                setInput(example);
                void run(example);
              }}
              className="text-[13px]"
            >
              {example}
            </Chip>
          ))}
        </div>
      ) : null}

      <AnimatePresence>
        {stage >= 0 ? (
          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
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
      </AnimatePresence>

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
            {data.results.map((result, i) => (
              <ResultRow
                key={result.provider.slug}
                name={result.provider.name}
                category={result.provider.category}
                verdict={result.eligibility}
                confidence={result.confidence}
                lastVerifiedAt={result.lastVerifiedAt}
                blurred={!data.authenticated && i >= 2}
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
