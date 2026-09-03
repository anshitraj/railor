"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import {
  Button,
  Card,
  Chip,
  CodeSample,
  EmptyState,
  InterpretationBar,
  ResultRow,
  SectionLabel,
  WhyPanel,
  type PickerOption,
  type Verdict,
} from "@railor/ui";
import { saveCorridor, monitorCorridor } from "../../app/app/corridors/actions";

type Query = Record<string, string | number | undefined>;

interface SearchPayload {
  interpretation: {
    tokens: Array<{
      field: string;
      value: string | number;
      label: string;
      confidence: number;
      matchedText?: string;
    }>;
    missing: string[];
    query: Query;
  };
  providersChecked: number;
  counts: Record<Verdict, number>;
  results: Array<{
    provider: { slug: string; name: string; category: string; isDemo?: boolean };
    eligibility: Verdict;
    confidence: number;
    lastVerifiedAt: string | null;
    reasons: Array<{ code: string; message: string; alsoTrue: string[]; wouldChange: string[] }>;
    outstandingRequirements: string[];
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
    receivingMode: {
      stablecoinMode: string;
      endpointType: string | null;
      namedRail: string | null;
      settlementEstimate: string | null;
      complianceDocs: string | null;
    } | null;
    /** How complete the evidence is for the exact requested route — a different axis from `eligibility`. Null when the query never asked for a full route. */
    routeConfirmation: string | null;
    confirmedDimensions: string[];
    unconfirmedDimensions: string[];
    rankingConfidence: number;
    rankingInputsUsed: string[];
    rankingInputsMissing: string[];
  }>;
  countryContext: {
    iso2: string;
    countryName: string | null;
    cryptoStatus: string | null;
    stablecoinStatus: string | null;
    instantPaymentSystem: string | null;
    localPaymentRails: string[];
    kycRequirements: string[];
    kybRequirements: string[];
    amlRequirements: string[];
    crossBorderRestrictions: string[];
    lastResearchedAt: string | null;
  } | null;
}

const ROUTE_CONFIRMATION_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  partially_confirmed: "Partially confirmed",
  unconfirmed: "Unconfirmed",
  unsupported: "Unsupported",
  unknown: "Unknown",
};

const ROUTE_CONFIRMATION_STYLE: Record<string, string> = {
  confirmed: "bg-[var(--color-ok-bg)] text-[var(--color-ok)]",
  partially_confirmed: "bg-[var(--color-lavender)] text-[var(--color-purple-deep)]",
  unconfirmed: "bg-[var(--color-canvas)] text-[var(--color-muted)]",
  unsupported: "bg-[var(--color-bad-bg)] text-[var(--color-bad)]",
  unknown: "bg-[var(--color-canvas)] text-[var(--color-muted)]",
};

const STABLECOIN_MODE_LABEL: Record<string, string> = {
  direct_stablecoin: "Direct stablecoin",
  stablecoin_funded_fiat: "Stablecoin-funded fiat",
  fiat_only: "Fiat only",
  stablecoin_only: "Stablecoin only",
  hybrid: "Hybrid",
  unknown: "Unknown mode",
};

const PRESETS: Array<{ value: string; label: string; hint: string }> = [
  { value: "balanced", label: "Balanced", hint: "Default ranking across cost, speed and reliability" },
  { value: "cheapest", label: "Cheapest", hint: "Weights published fees and FX spread" },
  { value: "fastest", label: "Fastest settlement", hint: "Weights advertised settlement time" },
  { value: "easiest_onboarding", label: "Easiest onboarding", hint: "Weights documents and days to live" },
  { value: "widest_coverage", label: "Widest coverage", hint: "Weights published destination reach" },
  { value: "max_recipient_amount", label: "Max recipient amount", hint: "Weights published fees, proxying for what the recipient would net" },
  { value: "most_reliable", label: "Most reliable", hint: "Weights observed uptime over cost or speed" },
];

const FACT_LABELS: Record<string, string> = {
  productLabel: "Product",
  feeSummary: "Fees",
  limitSummary: "Limits",
  settlementSummary: "Settlement",
  kybSummary: "KYB",
};

const ENDPOINT_TYPE_LABEL: Record<string, string> = {
  bank_account: "Bank account",
  mobile_money: "Mobile money",
  card: "Card",
  stablecoin_wallet: "Stablecoin wallet",
  virtual_account: "Virtual account",
  merchant_checkout: "Merchant checkout",
  payment_link: "Payment link",
  local_instant_rail: "Local instant rail",
  cash_pickup: "Cash pickup",
};

/**
 * The signature operational screen. It opens with a working answer on the
 * Balanced preset — filters refine, they are never a prerequisite.
 */
export function CorridorExplorer({
  initial,
  initialQuery,
  optionsByField,
  fieldLabels,
  savedCorridorId,
  apiKey,
}: {
  initial: SearchPayload;
  initialQuery: Query;
  optionsByField: Record<string, PickerOption[]>;
  fieldLabels: Record<string, string>;
  savedCorridorId?: string;
  apiKey?: string;
}) {
  const [query, setQuery] = useState<Query>(initialQuery);
  const [preset, setPreset] = useState("balanced");
  const [data, setData] = useState<SearchPayload>(initial);
  const [loading, setLoading] = useState(false);
  const [savedId, setSavedId] = useState<string | undefined>(savedCorridorId);
  const [monitored, setMonitored] = useState(false);
  const [showApi, setShowApi] = useState(false);
  const [pending, startTransition] = useTransition();
  const [first, setFirst] = useState(true);
  const [naturalInput, setNaturalInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const skipNextFetch = useRef(false);

  useEffect(() => {
    if (first) {
      setFirst(false);
      return;
    }
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, preset }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(query), preset]);

  /**
   * The only "type a sentence" entry point once you're signed in — the
   * homepage's version is logged-out only. Reuses the same /api/search the
   * homepage and every other query path here already calls, so a full
   * corridor swap costs one request instead of two: this fetch's own
   * response replaces `data` directly, and the effect above skips its own
   * redundant refetch for the `query` change this triggers.
   */
  const runNaturalSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!naturalInput.trim() || parsing) return;
    setParsing(true);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: naturalInput }),
      });
      const json: SearchPayload = await response.json();
      skipNextFetch.current = true;
      setData(json);
      setQuery(json.interpretation.query);
      setSavedId(undefined);
      setMonitored(false);
      setNaturalInput("");
    } finally {
      setParsing(false);
    }
  };

  const setField = (field: string, value: string) => setQuery((q) => ({ ...q, [field]: value }));
  const clearField = (field: string) =>
    setQuery((q) => {
      const next = { ...q };
      delete next[field];
      return next;
    });

  const save = () =>
    startTransition(async () => {
      const res = await saveCorridor(query);
      if (res.ok && res.id) setSavedId(res.id);
    });

  const monitor = () =>
    startTransition(async () => {
      let id = savedId;
      if (!id) {
        const res = await saveCorridor(query);
        if (!res.ok || !res.id) return;
        id = res.id;
        setSavedId(id);
      }
      const res = await monitorCorridor(id);
      if (res.ok) setMonitored(true);
    });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[24px] font-semibold tracking-tight">Corridor Explorer</h1>
          <p className="text-[14px] text-[var(--color-muted)]">
            Every mapped provider, evaluated against this route — with the reason attached.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={save} disabled={pending}>
            {savedId ? "Saved ✓" : "Save corridor"}
          </Button>
          <Button size="sm" onClick={monitor} disabled={pending || monitored}>
            {monitored ? "Monitoring ✓" : "Monitor"}
          </Button>
        </div>
      </div>

      <form
        onSubmit={runNaturalSearch}
        className="flex flex-col gap-2 rounded-[20px] border border-[var(--color-line-strong)] bg-white p-2 shadow-[var(--shadow-soft)] transition focus-within:border-[var(--color-orange)] focus-within:shadow-[var(--shadow-lift)] sm:flex-row sm:items-center sm:rounded-full sm:pl-5"
      >
        <Search size={16} className="ml-2 hidden shrink-0 text-[var(--color-faint)] sm:block" aria-hidden />
        <input
          value={naturalInput}
          onChange={(e) => setNaturalInput(e.target.value)}
          placeholder="Describe a different route — “USDT off-ramp to NGN for a Nigerian business”"
          className="w-full flex-1 bg-transparent px-2 py-2.5 text-[14px] outline-none sm:px-0 sm:text-[15px]"
          aria-label="Describe a new route"
        />
        <Button type="submit" size="sm" disabled={parsing || !naturalInput.trim()} className="w-full shrink-0 sm:w-auto">
          {parsing ? "Reading…" : "Search"}
        </Button>
      </form>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-2">
          <SectionLabel>Route</SectionLabel>
          <InterpretationBar
            tokens={data.interpretation.tokens}
            missing={[
              ...data.interpretation.missing,
              ...["sourceNetwork", "paymentMethod", "product", "customerType"].filter(
                (f) => !data.interpretation.tokens.some((t) => t.field === f),
              ),
            ]}
            optionsByField={optionsByField}
            fieldLabels={fieldLabels}
            onChange={setField}
            onRemove={clearField}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] pt-4">
          <SectionLabel className="mr-1">Rank by</SectionLabel>
          {PRESETS.map((p) => (
            <Chip
              key={p.value}
              active={preset === p.value}
              onClick={() => setPreset(p.value)}
              title={p.hint}
              className="text-[13px]"
            >
              {p.label}
            </Chip>
          ))}
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setShowApi((v) => !v)}
            className="text-[12.5px] font-medium text-[var(--color-purple)]"
          >
            {showApi ? "Hide API call" : "Copy as API call"}
          </button>
        </div>

        {showApi ? (
          <CodeSample
            apiKey={apiKey}
            variants={[
              {
                language: "curl",
                label: "cURL",
                code: `curl ${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/v1/corridors/search \\
  -H "Authorization: Bearer RAILOR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(toSnake(query), null, 2)}'`,
              },
              {
                language: "ts",
                label: "TypeScript",
                code: `const routes = await railor.corridors.search(${JSON.stringify(query, null, 2)})`,
              },
            ]}
            caption="This is the exact query behind the results below."
          />
        ) : null}
      </Card>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Count value={data.providersChecked} label="providers checked" />
        <Count value={data.counts.supported} label="compatible" tone="ok" />
        <Count value={data.counts.additional_requirements} label="need additional KYB" tone="warn" />
        <Count value={data.counts.unavailable} label="unavailable" tone="bad" />
        <Count value={data.counts.unknown} label="insufficient data" />
        {loading ? <span className="text-[12px] text-[var(--color-muted)]">Re-evaluating…</span> : null}
      </div>

      {data.countryContext ? (
        <Card className="flex flex-col gap-2 p-5">
          <SectionLabel>
            {data.countryContext.countryName ?? data.countryContext.iso2} — regulatory context
          </SectionLabel>
          <div className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
            {data.countryContext.cryptoStatus ? (
              <p>
                <span className="font-medium">Crypto: </span>
                <span className="text-[var(--color-muted)]">{data.countryContext.cryptoStatus}</span>
              </p>
            ) : null}
            {data.countryContext.stablecoinStatus ? (
              <p>
                <span className="font-medium">Stablecoins: </span>
                <span className="text-[var(--color-muted)]">{data.countryContext.stablecoinStatus}</span>
              </p>
            ) : null}
            {data.countryContext.instantPaymentSystem ? (
              <p>
                <span className="font-medium">Instant rail: </span>
                <span className="text-[var(--color-muted)]">{data.countryContext.instantPaymentSystem}</span>
              </p>
            ) : null}
            {data.countryContext.localPaymentRails.length ? (
              <p>
                <span className="font-medium">Local rails: </span>
                <span className="text-[var(--color-muted)]">
                  {data.countryContext.localPaymentRails.join(", ")}
                </span>
              </p>
            ) : null}
          </div>
          <p className="text-[11px] text-[var(--color-faint)]">
            Country-level research, not a per-provider statement — it never changes a verdict above, only
            explains the market.
          </p>
        </Card>
      ) : null}

      {data.results.length ? (
        <div className="flex flex-col gap-2">
          {data.results.map((result) => (
            <ResultRow
              key={result.provider.slug}
              name={result.provider.name}
              category={result.provider.category}
              verdict={result.eligibility}
              confidence={result.confidence}
              lastVerifiedAt={result.lastVerifiedAt}
              isDemo={result.provider.isDemo}
              facts={[
                ...Object.entries(result.facts)
                  .filter(([, v]) => Boolean(v))
                  .map(([k, v]) => ({ label: FACT_LABELS[k] ?? k, value: String(v) })),
                ...(result.receivingMode
                  ? [
                      {
                        label: "Receiving mode",
                        value:
                          STABLECOIN_MODE_LABEL[result.receivingMode.stablecoinMode] ??
                          result.receivingMode.stablecoinMode,
                      },
                      ...(result.receivingMode.namedRail
                        ? [{ label: "Named rail", value: result.receivingMode.namedRail }]
                        : []),
                      ...(result.receivingMode.endpointType
                        ? [
                            {
                              label: "Endpoint",
                              value:
                                ENDPOINT_TYPE_LABEL[result.receivingMode.endpointType] ??
                                result.receivingMode.endpointType,
                            },
                          ]
                        : []),
                      ...(result.receivingMode.settlementEstimate
                        ? [{ label: "Settlement", value: result.receivingMode.settlementEstimate }]
                        : []),
                      ...(result.receivingMode.complianceDocs
                        ? [{ label: "Compliance docs", value: result.receivingMode.complianceDocs }]
                        : []),
                    ]
                  : []),
              ]}
              actions={
                <Link
                  href={`/app/providers/${result.provider.slug}`}
                  className="text-[12.5px] font-medium text-[var(--color-purple)]"
                >
                  Profile →
                </Link>
              }
            >
              {result.routeConfirmation ? (
                <div className="flex flex-col gap-2 border-b border-[var(--color-line)] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--color-faint)]">
                      Route confirmation
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        ROUTE_CONFIRMATION_STYLE[result.routeConfirmation] ?? ROUTE_CONFIRMATION_STYLE.unknown
                      }`}
                    >
                      {ROUTE_CONFIRMATION_LABEL[result.routeConfirmation] ?? result.routeConfirmation}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                    {result.confirmedDimensions.map((d) => (
                      <span key={d} className="text-[var(--color-ok)]">
                        {d} ✓
                      </span>
                    ))}
                    {result.unconfirmedDimensions.map((d) => (
                      <span key={d} className="text-[var(--color-faint)]">
                        {d} ✗
                      </span>
                    ))}
                  </div>
                  {result.routeConfirmation === "partially_confirmed" || result.routeConfirmation === "unconfirmed" ? (
                    <p className="text-[11.5px] text-[var(--color-muted)]">
                      Railor understood exactly what you asked for — the pieces above are real, individually-verified
                      facts. It has no single source proving they hold together as one route yet.
                    </p>
                  ) : null}
                </div>
              ) : null}
              <WhyPanel
                providerName={result.provider.name}
                verdict={result.eligibility}
                reasons={result.reasons}
                evidence={result.evidence}
                lastVerifiedAt={result.lastVerifiedAt}
                outstandingRequirements={result.outstandingRequirements}
                rankingConfidence={result.rankingConfidence}
                rankingInputsUsed={result.rankingInputsUsed}
                rankingInputsMissing={result.rankingInputsMissing}
              />
            </ResultRow>
          ))}
        </div>
      ) : (
        <EmptyState
          what="No providers evaluated"
          why="Add at least a destination or an asset and Railor will evaluate every mapped provider against it."
          actionLabel="Add a destination"
          onAction={() => setField("destinationCountry", "AE")}
        />
      )}
    </div>
  );
}

function Count({
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
      <span className={`tabular text-[19px] font-semibold ${color}`}>{value}</span>
      <span className="text-[13px] text-[var(--color-muted)]">{label}</span>
    </span>
  );
}

function toSnake(query: Query) {
  const map: Record<string, string> = {
    entityCountry: "entity_country",
    customerType: "customer_type",
    sourceCountry: "source_country",
    destinationCountry: "destination_country",
    sourceAsset: "asset",
    sourceNetwork: "network",
    destinationCurrency: "destination_currency",
    paymentMethod: "payment_method",
  };
  return Object.fromEntries(
    Object.entries(query)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [map[k] ?? k, v]),
  );
}
