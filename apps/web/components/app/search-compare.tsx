"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bot, Search, ShieldCheck } from "lucide-react";
import { RANKING_PRESET_LABEL, type RankingPreset } from "@railor/types";
import type { SearchPreviewResult } from "@railor/core";
import { controlCommand } from "../../app/app/control-actions";
import { InfrastructureResults } from "./infrastructure-results";
import { IntentBuilder, defaultIntentDraft, intentFromDraft, missingIntentFields, type IntentDraft, type IntentOptions } from "./intent-builder";

const preferences: RankingPreset[] = ["balanced", "cheapest", "fastest", "most_reliable", "max_recipient_amount"];

export function SearchCompare({ policies, options, entityCountry, canDecide, defaultEmail }: {
  policies: Array<{ id: string; name: string }>; options: IntentOptions; entityCountry: string; canDecide: boolean; defaultEmail?: string;
}) {
  const [intent, setIntent] = useState<IntentDraft>(() => defaultIntentDraft(entityCountry));
  const [preference, setPreference] = useState<RankingPreset>("balanced");
  const [policyId, setPolicyId] = useState(policies[0]?.id ?? "");
  const [preview, setPreview] = useState<SearchPreviewResult | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const missing = missingIntentFields(intent);

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
    <header className="search-intro"><div><p className="product-eyebrow">Search / compare / govern</p><h1>Find your next<br /><span>permitted path.</span></h1>
      <p>Tell us where value starts and where it needs to land. Railor compares the evidence against your company policy.</p></div>
      <Link className="search-agent-link" href="/app/agent"><Bot size={20} /><span><strong>Prefer to describe it?</strong><small>Ask the Railor Agent</small></span><ArrowRight size={17} /></Link></header>
    <section className="search-builder" aria-labelledby="search-heading"><div className="search-builder-heading"><div><span className="product-index">01 / YOUR MOVEMENT</span><h2 id="search-heading">Build the request.</h2></div><span><ShieldCheck size={14} />Policy before ranking</span></div>
      <div className="space-y-6 p-5 sm:p-7">
        {!policies.length ? <div className="search-policy-empty"><ShieldCheck size={22} /><div><h3>Your company policy comes first.</h3><p>Create and activate a policy to preview permitted providers. Credentials can be connected later.</p></div><Link className="comparison-primary-action" href="/app/policies">Set up a policy <ArrowRight size={14} /></Link></div> : null}
        <fieldset disabled={pending}><IntentBuilder value={intent} onChange={(next) => { setIntent(next); setPreview(null); }} options={options} detectedEntity={entityCountry} /></fieldset>
        <div className="search-controls"><label>Active company policy<select className="product-field" value={policyId} onChange={(e) => { setPolicyId(e.target.value); setPreview(null); }} disabled={pending || !policies.length}>{!policies.length ? <option value="">Create a policy first</option> : policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>Compare by<select disabled={pending} className="product-field" value={preference} onChange={(e) => { setPreference(e.target.value as RankingPreset); setPreview(null); }}>{preferences.map((p) => <option key={p} value={p}>{RANKING_PRESET_LABEL[p]}</option>)}</select></label>
          <button type="button" disabled={pending || !policyId || missing.length > 0} onClick={runSearch} className="comparison-primary-action"><Search size={16} />{pending ? "Checking the paths…" : "Search infrastructure"}</button></div>
        {missing.length ? <p className="text-xs text-[var(--color-muted)]">Still needed: {missing.join(", ")}.</p> : null}
      </div>
    </section>
    {error ? <p role="alert" className="search-error">{error}</p> : null}
    {pending && !preview ? <div role="status" className="search-progress"><span className="search-progress-dot" /><div><strong>Checking evidence and company policy</strong><p>Quotes are requested only where pricing access is available.</p></div></div> : null}
    {preview ? <InfrastructureResults preview={preview} canDecide={canDecide} busy={pending} defaultEmail={defaultEmail} onSelect={decide} /> : !pending ? <div className="search-before"><span className="product-index">WHAT COMES NEXT</span><p>Route evidence. Policy verdicts. Pricing when available.</p><span>Unknowns will stay visible. Search does not initiate a transfer.</span></div> : null}
  </div>;
}
