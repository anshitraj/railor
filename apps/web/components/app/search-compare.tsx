"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bot } from "lucide-react";
import type { RankingPreset } from "@railor/types";
import type { SearchPreviewResult } from "@railor/core";
import { controlCommand } from "../../app/app/control-actions";
import { InfrastructureResults } from "./infrastructure-results";
import { defaultIntentDraft, intentFromDraft, type IntentDraft, type IntentOptions } from "./intent-builder";
import { SearchRequestWizard } from "./search-request-wizard";
import type { SavedSetupPolicy } from "../../lib/workspace-policy-setup";

export function SearchCompare({ policies, options, entityCountry, canDecide, defaultEmail, savedPolicy = null, canEditPolicies = false }: {
  policies: Array<{ id: string; name: string }>; options: IntentOptions; entityCountry: string; canDecide: boolean; defaultEmail?: string;
  savedPolicy?: SavedSetupPolicy | null; canEditPolicies?: boolean;
}) {
  const [intent, setIntent] = useState<IntentDraft>(() => defaultIntentDraft(entityCountry));
  const [preference, setPreference] = useState<RankingPreset>("balanced");
  const [policyId, setPolicyId] = useState(policies[0]?.id ?? "");
  const [preview, setPreview] = useState<SearchPreviewResult | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const results = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (preview) { results.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }); results.current?.focus({ preventScroll: true }); }
  }, [preview]);

  function runSearch() {
    setError(""); setPreview(null);
    start(async () => {
      try {
        const result = await controlCommand({ action: "search_preview", intent: { ...intentFromDraft(intent), preference }, policyId });
        if (!result.ok) setError(result.error ?? "Search failed. Please retry.");
        else setPreview(result.data as SearchPreviewResult);
      } catch { setError("The connection dropped. Please try again."); }
    });
  }
  function decide(provider: string) {
    if (!preview) return;
    setError("");
    start(async () => {
      try {
        const result = await controlCommand({ action: "decision", intent: preview.intent, policyId: preview.policyId, mode: "enforce", provider });
        if (!result.ok) setError(result.error ?? "Decision failed. Please retry.");
        else if (result.href) router.push(result.href);
      } catch { setError("The connection dropped. Please try again."); }
    });
  }

  return <div className="product-page space-y-7">
    <header className="search-intro"><div><p className="product-eyebrow">Search & compare</p><h1 style={{ fontSize: "clamp(30px, 3vw, 42px)" }}>Find your route.</h1>
      <p>A few simple choices. Compare providers against your company policy.</p></div>
      <Link className="search-agent-link" href="/app/agent"><Bot size={20} /><span><strong>Prefer to describe it?</strong><small>Ask the Railor Agent</small></span><ArrowRight size={17} /></Link></header>
    <SearchRequestWizard value={intent} onChange={(next) => { setIntent(next); setPreview(null); setError(""); }} options={options}
      policies={policies} policyId={policyId} onPolicyChange={(next) => { setPolicyId(next); setPreview(null); setError(""); }}
      preference={preference} onPreferenceChange={(next) => { setPreference(next); setPreview(null); setError(""); }}
      savedPolicy={savedPolicy} canEditPolicies={canEditPolicies} busy={pending} onSearch={runSearch} />
    {error ? <p role="alert" className="search-error">{error}</p> : null}
    {pending && !preview ? <div role="status" className="search-progress"><span className="search-progress-dot" /><div><strong>Checking evidence and company policy</strong><p>Quotes are requested only where pricing access is available.</p></div></div> : null}
    {preview ? <div ref={results} tabIndex={-1} aria-label="Route comparison results" style={{ scrollMarginTop: 90, outline: "none" }}><InfrastructureResults preview={preview} canDecide={canDecide} busy={pending} defaultEmail={defaultEmail} onSelect={decide} /></div> : null}
  </div>;
}
