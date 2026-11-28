"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Clock3, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import type { SearchPreviewCandidate, SearchPreviewResult } from "@railor/core";
import { ProviderWordmark } from "./provider-wordmark";
import { AccessRequestButton } from "./access-request";
import { QUOTE_LABELS } from "./infrastructure-results";
import { sortRelevantCandidates } from "../../lib/agent-presentation";
import styles from "./agent-comparison.module.css";

const INITIAL_VISIBLE = 3;
const readable = (value: string | null) => (value ? value.replaceAll("_", " ") : "Unknown");
const formatNum = (value: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 4 }).format(value);

/**
 * Compact, chat-native provider comparison for Railor Agent.
 * Shows only the top actionable providers by default (omitting blank
 * "Not priced / Not observed" filler columns) and folds remaining
 * providers, raw evidence, and unsupported coverage behind clean toggles.
 */
export function AgentComparison({
  preview,
  canDecide = true,
  busy = false,
  defaultEmail,
  onSelect,
  onExplain,
}: {
  preview: SearchPreviewResult;
  canDecide?: boolean;
  busy?: boolean;
  defaultEmail?: string;
  onSelect?: (provider: string) => void;
  onExplain?: (provider: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const relevant = sortRelevantCandidates(preview);
  const relevantIds = new Set(relevant.map((c) => c.providerId));
  const gaps = preview.candidates.filter((c) => !relevantIds.has(c.providerId));
  const best = preview.bestCandidate;
  const visible = showAll ? relevant : relevant.slice(0, INITIAL_VISIBLE);
  const hiddenCount = Math.max(0, relevant.length - INITIAL_VISIBLE);
  const ruled = preview.policyId !== "explore";
  const checkedAt = new Date(preview.evaluatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <section className={styles.wrap} aria-label="Provider comparison">
      <div className={styles.metaBar}>
        <span className={styles.metaSummary}>
          <span><strong>{preview.evidenceSummary.providersChecked}</strong> checked</span>
          <i aria-hidden>·</i>
          <span><strong>{relevant.length}</strong> {relevant.length === 1 ? "route match" : "route matches"}</span>
          {preview.evidenceSummary.withCurrentQuote > 0 ? (
            <>
              <i aria-hidden>·</i>
              <span><strong>{preview.evidenceSummary.withCurrentQuote}</strong> priced</span>
            </>
          ) : null}
          {ruled ? (
            <>
              <i aria-hidden>·</i>
              <span><strong>{preview.permittedCandidates.length}</strong> permitted</span>
            </>
          ) : null}
        </span>
        <span className={styles.metaTime}><Clock3 size={12} aria-hidden />{checkedAt}</span>
      </div>

      {relevant.length ? (
        <div className={styles.list}>
          {visible.map((candidate, index) => (
            <CompactProviderRow
              key={candidate.providerId}
              candidate={candidate}
              preview={preview}
              index={index}
              best={best?.providerId === candidate.providerId}
              ruled={ruled}
              expanded={expandedId === candidate.providerId}
              onToggle={() => setExpandedId((current) => (current === candidate.providerId ? null : candidate.providerId))}
              canDecide={canDecide}
              busy={busy}
              defaultEmail={defaultEmail}
              onSelect={onSelect}
              onExplain={onExplain}
            />
          ))}

          {hiddenCount > 0 ? (
            <button
              type="button"
              className={styles.moreButton}
              aria-expanded={showAll}
              onClick={() => setShowAll((open) => !open)}
            >
              <span>{showAll ? "Show fewer providers" : `Show ${hiddenCount} more ${hiddenCount === 1 ? "provider" : "providers"} with route coverage`}</span>
              <ChevronDown size={15} aria-hidden className={styles.chevron} data-open={showAll || undefined} />
            </button>
          ) : null}
        </div>
      ) : (
        <div className={styles.emptyCard}>
          <p>No indexed provider has confirmed end-to-end coverage for this exact route yet.</p>
          <div className={styles.emptyLinks}>
            <Link href="/app/corridors">Explore corridors <ArrowUpRight size={13} aria-hidden /></Link>
            <Link href="/app/evidence">Review sources <ArrowUpRight size={13} aria-hidden /></Link>
          </div>
        </div>
      )}

      {(gaps.length > 0 || preview.warnings.length > 0) ? (
        <div className={styles.disclosures}>
          {gaps.length > 0 ? (
            <details className={styles.disclosure}>
              <summary>
                <span>{gaps.length} unsupported or unverified providers</span>
                <ChevronDown size={14} aria-hidden />
              </summary>
              <p className={styles.disclosureNote}>Unknown means route evidence is incomplete. Unsupported means indexed evidence marks this route unavailable.</p>
              <div className={styles.gapList}>
                {gaps.map((candidate) => (
                  <div key={candidate.providerId} className={styles.gapRow}>
                    <strong>{candidate.provider}</strong>
                    <span className={styles.gapTag}>{candidate.quoteState === "ROUTE_UNAVAILABLE" ? "Unsupported" : "Unknown"}</span>
                    <span className={styles.gapReason}>{candidate.unavailableReason ?? candidate.missingInformation[0] ?? "Route evidence missing."}</span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          {preview.warnings.length > 0 ? (
            <details className={styles.disclosure}>
              <summary>
                <span>{preview.warnings.length} pricing {preview.warnings.length === 1 ? "note" : "notes"}</span>
                <ChevronDown size={14} aria-hidden />
              </summary>
              <ul className={styles.warningList}>
                {preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      <p className={styles.footnote}>
        <ShieldCheck size={13} aria-hidden />
        <span>Policy checked before ranking · No transfer is initiated here.</span>
      </p>
    </section>
  );
}

function CompactProviderRow({
  candidate: c,
  preview,
  index,
  best,
  ruled,
  expanded,
  onToggle,
  canDecide,
  busy,
  defaultEmail,
  onSelect,
  onExplain,
}: {
  candidate: SearchPreviewCandidate;
  preview: SearchPreviewResult;
  index: number;
  best: boolean;
  ruled: boolean;
  expanded: boolean;
  onToggle: () => void;
  canDecide: boolean;
  busy: boolean;
  defaultEmail?: string;
  onSelect?: (provider: string) => void;
  onExplain?: (provider: string) => void;
}) {
  const unit = preview.intent.destinationCurrency ?? "";
  const policyTone = c.policyPreview === "pass" ? "good" : c.policyPreview === "fail" ? "bad" : "warn";
  const hasPrice = c.recipientAmount !== null;

  // Build only real, observed sub-metrics — never print "Not priced" or "Not observed".
  const observedMeta: string[] = [];
  if (c.knownCost) {
    observedMeta.push(`Fee ${formatNum(c.knownCost.amount)} ${c.knownCost.currency ?? ""}`.trim());
  }
  if (c.etaMinutes !== null) {
    observedMeta.push(`~${formatNum(c.etaMinutes)} min`);
  } else if (c.advertisedSettlement) {
    observedMeta.push(c.advertisedSettlement);
  }
  if (c.reliabilityObserved !== null) {
    observedMeta.push(`${formatNum(c.reliabilityObserved * 100)}% health`);
  }

  const quoteHint = c.quoteState === "LIVE_CONNECTED"
    ? "Live account quote"
    : c.quoteState === "INDICATIVE"
      ? (c.quoteAccountContext === "railor_network" ? "Reference rate" : "Indicative")
      : c.quoteState === "CONNECT_TO_QUOTE"
        ? "Connect for live quote"
        : QUOTE_LABELS[c.quoteState];

  return (
    <article className={styles.row} data-best={best || undefined} data-expanded={expanded || undefined} aria-label={`${c.provider} comparison`}>
      <div className={styles.rowHeader}>
        <button type="button" className={styles.rowTrigger} aria-expanded={expanded} onClick={onToggle}>
          <span className={styles.rank} data-best={best || undefined}>{index + 1}</span>
          <span className={styles.providerInfo}>
            <span className={styles.providerLine}>
              <ProviderWordmark slug={c.providerSlug} name={c.provider} size="compact" />
              {best ? <span className={styles.bestBadge}><Sparkles size={11} aria-hidden />Top pick</span> : null}
              {ruled ? (
                <span className={styles.policyPill} data-tone={policyTone}>
                  {c.policyPreview === "pass" ? <Check size={11} aria-hidden /> : <ShieldAlert size={11} aria-hidden />}
                  {c.policyPreview === "pass" ? "Allowed" : c.policyPreview === "fail" ? "Blocked" : "Needs check"}
                </span>
              ) : null}
              {c.activeIncident ? <span className={styles.incidentPill}>Active incident</span> : null}
            </span>
            <span className={styles.subLine}>
              <span>{quoteHint}</span>
              <i aria-hidden>·</i>
              <span>{c.routeConfirmation === "confirmed" ? "Confirmed route" : "Partial route evidence"}</span>
            </span>
          </span>

          <span className={styles.valueCol}>
            {hasPrice ? (
              <>
                <strong className={styles.payout}>{formatNum(c.recipientAmount!)} {unit}</strong>
                <span className={styles.valueMeta}>
                  {observedMeta.length ? observedMeta.join(" · ") : (c.quoteState === "INDICATIVE" ? "Not guaranteed" : "Quoted")}
                </span>
              </>
            ) : (
              <>
                <span className={styles.unpricedPill}>
                  {c.quoteState === "CONNECT_TO_QUOTE" ? "Connect to price" : "Awaiting quote"}
                </span>
                {observedMeta.length ? <span className={styles.valueMeta}>{observedMeta.join(" · ")}</span> : null}
              </>
            )}
          </span>
          <ChevronDown size={15} aria-hidden className={styles.chevron} data-open={expanded || undefined} />
        </button>
      </div>

      {expanded ? (
        <div className={styles.drawer}>
          <p className={styles.reason}>
            {c.unavailableReason ?? c.comparisonReason ?? c.missingInformation[0] ?? "Current route evidence and policy check are summarized below."}
          </p>

          <dl className={styles.facts}>
            <div><dt>Route</dt><dd>{readable(c.routeConfirmation)}</dd></div>
            <div><dt>Entity</dt><dd>{readable(c.entityEligibility)}</dd></div>
            <div><dt>Account</dt><dd>{c.connectionState === "connected" ? "Connected" : "Not connected"}</dd></div>
            <div><dt>Evidence</dt><dd>{c.evidenceFreshness ? new Date(c.evidenceFreshness).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" }) : "Unverified"}</dd></div>
          </dl>

          {c.missingInformation.length > 0 ? (
            <ul className={styles.missingList}>
              {c.missingInformation.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : null}

          {c.evidence.some((s) => s.sourceUrl) ? (
            <div className={styles.sources}>
              {c.evidence.filter((s) => s.sourceUrl).slice(0, 4).map((source, i) => (
                <a key={source.id ?? i} href={source.sourceUrl!} target="_blank" rel="noopener noreferrer">
                  {source.title ?? "Evidence source"}<ArrowUpRight size={11} aria-hidden />
                </a>
              ))}
            </div>
          ) : null}

          <div className={styles.actions}>
            {onSelect && canDecide && c.policyPreview === "pass" && c.routeConfirmation === "confirmed" ? (
              <button type="button" className={styles.primaryAction} disabled={busy} onClick={() => onSelect(c.providerSlug)}>
                Record decision <ArrowRight size={13} aria-hidden />
              </button>
            ) : null}
            {c.connectionState !== "connected" ? (
              <AccessRequestButton
                provider={c.providerSlug}
                providerName={c.provider}
                feature="provider_connection"
                supportsCredentials={c.supportsCredentialConnection}
                defaultEmail={defaultEmail}
                className={styles.secondaryAction}
              />
            ) : (
              <Link className={styles.secondaryAction} href="/app/settings/connections">
                Manage account <ArrowUpRight size={13} aria-hidden />
              </Link>
            )}
            {onExplain ? (
              <button type="button" className={styles.textAction} onClick={() => onExplain(c.providerSlug)}>
                Why {c.provider}?
              </button>
            ) : null}
            {canDecide && c.policyPreview === "pass" ? (
              <AccessRequestButton
                provider={c.providerSlug}
                providerName={c.provider}
                defaultEmail={defaultEmail}
                className={`${styles.textAction} ${styles.pushRight}`}
                label="Execution beta"
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}
