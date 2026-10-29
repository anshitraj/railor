"use client";

import { useEffect, useRef, useState } from "react";
import { postSearch } from "../../lib/search-client";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, Search } from "lucide-react";
import {
  Button,
  Chip,
  ResultRow,
  VerdictPill,
  WhyPanel,
  type PickerOption,
  type Verdict,
} from "@railor/ui";
import { QueryConfirmation } from "./query-confirmation";
import { LockedResults, type LockedResult } from "./locked-results";
import { ProviderLogo } from "../app/provider-logo";

interface SearchBase {
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
}

interface FullResult {
  provider: { slug: string; name: string; category: string; isDemo?: boolean };
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
}

/**
 * Logged in: the whole answer. Not logged in: who ranked first, locked, and no verdicts or counts at all
 * (app/api/search/route.ts withholds them, so there is nothing here to read past the lock).
 */
type SearchResponse =
  | (SearchBase & { authenticated: true; counts: Record<Verdict, number>; results: FullResult[] })
  | (SearchBase & { authenticated: false; counts: null; results: LockedResult[] });

const PLACEHOLDER = "Indian company → USDC on Base → AED business payout in UAE";

const EXAMPLES: Array<{ query: string; label: string }> = [
  { query: "USDC payouts to EUR business bank accounts", label: "USDC → EUR payouts" },
  { query: "Virtual cards for a UAE company funded with USDC", label: "Virtual cards in UAE" },
  { query: "USDT off-ramp to NGN for a Nigerian business", label: "Business off-ramp in Nigeria" },
];

const PIPELINE = [
  "Understanding request",
  "Checking providers",
  "Matching entity eligibility",
  "Checking corridor availability",
  "Comparing capabilities",
];

/**
 * A search that is slow is said to be slow, and one that is not answering is given up on, with a way to try
 * again: "Checking…" never stays on the page for good.
 */
const SLOW_AFTER_MS = 6_000;
const GIVE_UP_AFTER_MS = 25_000;

export function HeroSearch({
  optionsByField,
  fieldLabels,
}: {
  optionsByField: Record<string, PickerOption[]>;
  fieldLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [stage, setStage] = useState(-1);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [slow, setSlow] = useState(false);
  const [needsInput, setNeedsInput] = useState(false);
  const [searchError, setSearchError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const runIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  // Leaving the page ends a search still on its way.
  useEffect(() => () => controllerRef.current?.abort(), []);

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
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setPending(true);
    setSlow(false);
    setSearchError("");
    setStage(0);
    setData(null);
    const ticker = window.setInterval(() => {
      if (runIdRef.current !== runId) return;
      setStage((s) => (s < PIPELINE.length - 1 ? s + 1 : s));
    }, 160);
    const slowTimer = window.setTimeout(() => {
      if (runIdRef.current === runId) setSlow(true);
    }, SLOW_AFTER_MS);
    const giveUp = window.setTimeout(() => controller.abort(), GIVE_UP_AFTER_MS);
    try {
      const result = await postSearch<SearchResponse>({ input: text, query: overrides }, { signal: controller.signal });
      if (runIdRef.current !== runId) return;
      if (result.ok) {
        setSearchError("");
        setData(result.data);
      } else {
        setSearchError(result.message);
      }
      setStage(-1);
    } finally {
      window.clearInterval(ticker);
      window.clearTimeout(slowTimer);
      window.clearTimeout(giveUp);
      if (runIdRef.current === runId) {
        setStage(-1);
        setSlow(false);
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
          if (!input.trim()) {
            // An empty question is never a silent no-op: say what to do and put the cursor there.
            setNeedsInput(true);
            inputRef.current?.focus();
            return;
          }
          void run(input);
        }}
        className="relative"
      >
        <div className="flex flex-col gap-2 rounded-[14px] border border-[var(--color-line)] bg-white p-1.5 shadow-[var(--shadow-soft)] transition focus-within:border-[var(--color-orange)] focus-within:shadow-[var(--shadow-lift)] sm:flex-row sm:items-center sm:pl-3">
          <Search size={18} className="ml-2 hidden shrink-0 text-[var(--color-faint)] sm:block" aria-hidden />
          <div className="relative min-w-0 flex-1">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setNeedsInput(false);
              }}
              aria-invalid={needsInput || undefined}
              aria-describedby={needsInput ? "hero-search-hint" : undefined}
              placeholder={PLACEHOLDER}
              className="w-full min-w-0 bg-transparent px-2 py-2.5 text-[16px] outline-none placeholder:text-[var(--color-faint)] sm:px-0 sm:text-[11px]"
              aria-label="What are you trying to build or move?"
            />
          </div>
          <Button type="submit" disabled={pending} className="w-full shrink-0 gap-2 rounded-[10px] px-3 text-[11px] sm:w-auto">
            {pending ? "Checking…" : "Check compatibility"}<ArrowRight size={13} aria-hidden />
          </Button>
        </div>
      </form>

      {searchError ? (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-medium text-[var(--color-bad)]">
          <p>{searchError}</p>
          {input.trim() ? (
            <button type="button" onClick={() => void run(input)} className="underline underline-offset-2 hover:no-underline">
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      {needsInput ? (
        <p id="hero-search-hint" role="status" className="text-[13px] font-medium text-[var(--color-orange-deep)]">
          Describe what you need to move, or pick an example below.
        </p>
      ) : null}

      {!data ? (
        <div data-hero-examples className="flex flex-wrap items-center gap-2">
          {EXAMPLES.map((example) => (
            <Chip
              key={example.query}
              onClick={() => {
                setInput(example.query);
                void run(example.query);
              }}
              className="text-[12px]"
            >
              {example.label}
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
          {slow ? (
            <li role="status" className="mt-1 border-t border-[var(--color-line)] pt-2 text-[12.5px] text-[var(--color-muted)]">
              Still checking — the provider index is answering slowly right now.
            </li>
          ) : null}
        </motion.ul>
      ) : null}

      {data ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-4 rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]"
        >
          <QueryConfirmation
            query={data.interpretation.query}
            optionsByField={optionsByField}
            fieldLabels={fieldLabels}
            onChange={editToken}
          />

          {data.authenticated ? (
            <>
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
                    mark={<ProviderLogo slug={result.provider.slug} name={result.provider.name} size={36} />}
                    name={result.provider.name}
                    category={result.provider.category}
                    verdict={result.eligibility}
                    confidence={result.confidence}
                    lastVerifiedAt={result.lastVerifiedAt}
                    isDemo={result.provider.isDemo}
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

              <Button onClick={() => router.push("/app/corridors")}>Open in Corridor Explorer</Button>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-[var(--color-line)] py-3">
                <Metric value={data.providersChecked} label="providers checked" />
              </div>

              {data.results.length ? (
                <LockedResults results={data.results} onUnlock={continueToFull} />
              ) : (
                <p className="text-[13px] text-[var(--color-muted)]">
                  No provider matched this exact request yet. Change one of the fields above to try again.
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] bg-[var(--color-lavender)] p-4">
                <div className="flex flex-col gap-1">
                  <p className="text-[14px] font-medium text-[var(--color-purple-deep)]">
                    Log in to see the results: verdicts, fees, limits, requirements and sources.
                  </p>
                  <p className="text-[12.5px] text-[var(--color-ink-soft)]">Your question carries over.</p>
                </div>
                <Button onClick={continueToFull}>Log in</Button>
              </div>
            </>
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
