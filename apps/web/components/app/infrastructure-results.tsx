"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, ChevronDown, CircleHelp, Clock3, ShieldCheck } from "lucide-react";
import type { SearchPreviewCandidate, SearchPreviewResult } from "@railor/core";
import { RANKING_PRESET_LABEL } from "@railor/types";
import { ProviderLogo } from "./provider-logo";
import { AccessRequestButton } from "./access-request";

export const QUOTE_LABELS = {
  LIVE_CONNECTED: "Live account quote", INDICATIVE: "Indicative price", CONNECT_TO_QUOTE: "Connect for live pricing",
  QUOTE_UNAVAILABLE: "Live pricing unavailable", ROUTE_UNAVAILABLE: "Route unsupported", UNKNOWN: "More evidence needed",
};
const readable = (value: string | null) => value ? value.replaceAll("_", " ") : "Unknown";
const number = (value: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 6 }).format(value);

export function InfrastructureResults({ preview, canDecide = true, busy = false, defaultEmail, onSelect, onExplain }: {
  preview: SearchPreviewResult; canDecide?: boolean; busy?: boolean; defaultEmail?: string;
  onSelect?: (provider: string) => void; onExplain?: (provider: string) => void;
}) {
  const relevant = preview.candidates.filter((c) => c.routeConfirmation === "confirmed" || c.routeConfirmation === "partially_confirmed")
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.provider.localeCompare(b.provider));
  const gaps = preview.candidates.filter((c) => !relevant.some((candidate) => candidate.providerId === c.providerId));
  const best = preview.bestCandidate;
  const hasConfirmedRoute = relevant.some((candidate) => candidate.routeConfirmation === "confirmed");
  return <section className="infrastructure-results" aria-label="Infrastructure comparison">
    <div className="comparison-heading"><div><p className="product-eyebrow">Infrastructure / compared against your policy</p><h2>{relevant.length ? hasConfirmedRoute ? "Your available paths." : "Routes need more evidence." : "Let’s close the evidence gap."}</h2></div>
      <span className="comparison-observation"><Clock3 size={13} />Checked {new Date(preview.evaluatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>
    <div className="comparison-counts">{[
      [preview.evidenceSummary.providersChecked, "providers checked"], [relevant.length, "with route evidence"],
      [preview.permittedCandidates.length, "policy permitted"], [preview.evidenceSummary.withCurrentQuote, "price observations"],
    ].map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
    {best ? <div className="comparison-recommendation"><ShieldCheck size={20} aria-hidden /><div><p>Best permitted · {RANKING_PRESET_LABEL[preview.intent.preference]}</p><strong>{best.provider}</strong><span>{best.comparisonReason} {QUOTE_LABELS[best.quoteState]}.</span></div></div>
      : relevant.length ? <div className="comparison-qualification"><CircleHelp size={18} /><div><strong>No supported winner for {RANKING_PRESET_LABEL[preview.intent.preference].toLowerCase()} yet.</strong><p>{preview.permittedCandidates.length ? "Permitted routes are visible below. The requested ranking needs data we don’t have yet." : "The current policy or missing evidence prevents a recommendation. Each provider’s reason is shown below."}</p></div></div>
      : <div className="comparison-gap"><div className="comparison-gap-mark" aria-hidden><span /><span /><span /><ArrowRight size={22} /></div>
          <div><h3>No verified end-to-end path yet.</h3><p>We checked the indexed providers, but current evidence does not confirm this movement. Your request is valid; the coverage is incomplete.</p>
            <div className="mt-4 flex flex-wrap gap-4"><Link href="/app/corridors">Explore route evidence <ArrowUpRight size={14} /></Link><Link href="/app/evidence">Review the sources <ArrowUpRight size={14} /></Link></div></div></div>}
    <div className="comparison-candidates">{relevant.map((candidate, index) => <CandidateCard key={candidate.providerId} candidate={candidate} preview={preview} index={index}
      best={best?.providerId === candidate.providerId} canDecide={canDecide} busy={busy} defaultEmail={defaultEmail} onSelect={onSelect} onExplain={onExplain} />)}</div>
    {gaps.length ? <details className="comparison-other"><summary><span>{gaps.length} other providers · unsupported or awaiting evidence</span><ChevronDown size={16} aria-hidden /></summary>
      <p className="comparison-other-note">Unknown means we cannot confirm the route. Unsupported means the indexed evidence says it is unavailable.</p>
      <div className="comparison-other-list">{gaps.map((candidate) => <div key={candidate.providerId}><span>{candidate.provider}</span><span>{candidate.quoteState === "ROUTE_UNAVAILABLE" ? "Unsupported" : "Unknown"}</span>
        <span>{candidate.unavailableReason ?? candidate.missingInformation[0] ?? "Exact route evidence is missing."}</span></div>)}</div></details> : null}
    {preview.warnings.length ? <details className="comparison-other"><summary><span>{preview.warnings.length} pricing observations need attention</span><ChevronDown size={16} /></summary><ul className="space-y-2 px-5 pb-5 text-xs text-[var(--color-muted)]">{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details> : null}
    <p className="comparison-footnote"><ShieldCheck size={14} />Policy is evaluated before ranking. Recording a decision checks current conditions again. Execution has not been initiated by this search.</p>
  </section>;
}

function CandidateCard({ candidate: c, preview, index, best, canDecide, busy, defaultEmail, onSelect, onExplain }: {
  candidate: SearchPreviewCandidate; preview: SearchPreviewResult; index: number; best: boolean; canDecide: boolean; busy: boolean;
  defaultEmail?: string; onSelect?: (provider: string) => void; onExplain?: (provider: string) => void;
}) {
  const unit = preview.intent.destinationCurrency ?? "";
  const tone = c.policyPreview === "pass" ? "good" : c.policyPreview === "fail" ? "bad" : "warn";
  const policyLabel = c.policyPreview === "pass" ? "Allowed by policy" : c.policyPreview === "fail" ? "Blocked by policy" : "Policy needs evidence";
  return <article className="comparison-card" data-best={best || undefined} aria-label={`${c.provider} comparison`}>
    <div className="comparison-card-top"><div className="comparison-provider"><span className="comparison-index">{String(index + 1).padStart(2, "0")}</span><ProviderLogo slug={c.providerSlug} name={c.provider} size={36} /><div><h3>{c.provider}</h3><p>{QUOTE_LABELS[c.quoteState]}</p></div></div>
      <span className="comparison-policy" data-tone={tone}>{c.policyPreview === "pass" ? <Check size={13} /> : <ShieldCheck size={13} />}{policyLabel}</span></div>
    <div className="comparison-route-facts"><span>Route <strong>{readable(c.routeConfirmation)}</strong></span><span>Entity <strong>{readable(c.entityEligibility)}</strong></span><span>Account <strong>{c.connectionState === "connected" ? "Connected" : "Not connected"}</strong></span>{c.activeIncident ? <span className="text-[var(--color-bad)]">Active incident</span> : null}</div>
    <dl className="comparison-metrics"><Metric label={c.quoteAccountContext === "railor_network" ? "Reference conversion" : "Recipient receives"} value={c.recipientAmount === null ? "Awaiting quote" : `${number(c.recipientAmount)} ${unit}`} note={c.quoteAccountContext === "railor_network" ? "Railor account · payout fee excluded" : c.quoteState === "INDICATIVE" ? "Reference price · not guaranteed" : c.quoteState === "LIVE_CONNECTED" ? "From your connected account" : "Connect for account pricing"} />
      <Metric label="Known fees" value={c.knownCost ? `${number(c.knownCost.amount)} ${c.knownCost.currency ?? ""}` : "Not priced"} note={c.knownCost ? `${c.costCompleteness} cost${c.costCompleteness === "partial" ? " · excludes unknown charges" : ""}` : "Unknown fees stay unknown"} />
      <Metric label="Arrival estimate" value={c.etaMinutes === null ? c.advertisedSettlement ?? "Not observed" : `~${number(c.etaMinutes)} min`} note={c.etaMinutes === null ? c.advertisedSettlement ? "Provider advertised" : "No estimate in the evidence" : "Quoted estimate"} />
      <Metric label="Reliability" value={c.reliabilityObserved === null ? "Not observed" : `${number(c.reliabilityObserved * 100)}%`} note={c.reliabilityObserved === null ? "No observed health data" : "Observed health checks"} /></dl>
    <div className="comparison-card-context"><p>{c.unavailableReason ?? c.comparisonReason ?? c.missingInformation[0] ?? "Current evidence and policy are shown above."}</p>
      <span>Evidence {c.evidenceFreshness ? `verified ${new Date(c.evidenceFreshness).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}` : "awaiting verification"}</span></div>
    <div className="comparison-card-actions">{onSelect && canDecide && c.policyPreview === "pass" && c.routeConfirmation === "confirmed" ? <button type="button" className="comparison-primary-action" disabled={busy} onClick={() => onSelect(c.providerSlug)}>Record decision <ArrowRight size={14} /></button> : null}
      {c.connectionState !== "connected" ? <AccessRequestButton provider={c.providerSlug} providerName={c.provider} feature="provider_connection" supportsCredentials={c.supportsCredentialConnection} defaultEmail={defaultEmail} /> : <Link className="comparison-secondary-action" href="/app/settings/connections">Manage account <ArrowUpRight size={14} /></Link>}
      {onExplain ? <button type="button" className="comparison-text-action" onClick={() => onExplain(c.providerSlug)}>Why {c.provider}?</button> : null}
      <details className="comparison-evidence"><summary>Evidence & reasons</summary><div><p className="text-xs leading-relaxed">{c.comparisonReason}</p>{c.policyReasonCodes.length ? <p className="mt-2 font-mono text-[10px]">{c.policyReasonCodes.join(" · ")}</p> : null}
        {c.missingInformation.map((missing) => <p className="mt-2 text-xs" key={missing}>{missing}</p>)}
        {c.evidence.map((source, i) => source.sourceUrl ? <a key={source.id ?? i} href={source.sourceUrl} target="_blank" rel="noopener noreferrer">{source.title ?? "Evidence source"}<ArrowUpRight size={12} /></a> : null)}</div></details>
      {canDecide && c.policyPreview === "pass" ? <AccessRequestButton provider={c.providerSlug} providerName={c.provider} defaultEmail={defaultEmail} className="comparison-text-action ml-auto" label="Execution beta" /> : null}</div>
  </article>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd><p>{note}</p></div>;
}
