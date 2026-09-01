"use client";

import { cn } from "../cn.js";
import { Freshness, VerdictPill, type Verdict } from "./badges.js";
import { EvidencePopover, type EvidenceItem } from "./evidence.js";

export interface Reason {
  code: string;
  message: string;
  alsoTrue: string[];
  wouldChange: string[];
}

export interface ChangeEntry {
  detectedAt: string | Date;
  summary: string;
  previousValue?: string | null;
  currentValue?: string | null;
}

/**
 * The explanation surface. Railor never renders a bare "Unsupported": a
 * verdict always arrives with the reason, what is nonetheless true, what would
 * change it, the sources, and when the claim was last verified.
 */
/** Turns a snake_case ranking-input key into the short label a result card already shows it under. */
const RANKING_INPUT_LABEL: Record<string, string> = {
  cost: "Fees",
  speed: "Settlement speed",
  onboarding: "Onboarding time",
  reliability: "Reliability",
  coverage: "Coverage",
  confidence: "Evidence confidence",
  recipientAmount: "Recipient amount",
  eta: "ETA",
};
const rankingInputLabel = (key: string) => RANKING_INPUT_LABEL[key] ?? key;

export function WhyPanel({
  providerName,
  verdict,
  reasons,
  evidence,
  lastVerifiedAt,
  outstandingRequirements = [],
  history = [],
  rankingConfidence,
  rankingInputsUsed = [],
  rankingInputsMissing = [],
  className,
}: {
  providerName: string;
  verdict: Verdict;
  reasons: Reason[];
  evidence: EvidenceItem[];
  lastVerifiedAt: string | Date | null;
  outstandingRequirements?: string[];
  history?: ChangeEntry[];
  /** How much of the ranking score is backed by real data (0-1) — omit to hide this section entirely. */
  rankingConfidence?: number;
  rankingInputsUsed?: string[];
  rankingInputsMissing?: string[];
  className?: string;
}) {
  const alsoTrue = [...new Set(reasons.flatMap((r) => r.alsoTrue))];
  const wouldChange = [...new Set(reasons.flatMap((r) => r.wouldChange))];

  return (
    <div className={cn("grid gap-6 lg:grid-cols-[1.4fr_1fr]", className)}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <VerdictPill verdict={verdict} />
          <span className="text-sm font-medium text-[var(--color-ink)]">{providerName}</span>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">Reason</p>
          {reasons.map((r) => (
            <p key={r.code + r.message} className="text-[14px] leading-relaxed text-[var(--color-ink)]">
              {r.message}
            </p>
          ))}
        </div>

        {outstandingRequirements.length ? (
          <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-warn-bg)]/50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-[var(--color-warn)]">
              Outstanding for your organization
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {outstandingRequirements.map((r) => (
                <li key={r} className="text-[13px] text-[var(--color-ink-soft)]">
                  • {r}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {alsoTrue.length ? (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
              Also true
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {alsoTrue.map((a) => (
                <li key={a} className="text-[13px] text-[var(--color-ink-soft)]">
                  • {a}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {wouldChange.length ? (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
              What would change this
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {wouldChange.map((w) => (
                <li key={w} className="text-[13px] text-[var(--color-ink-soft)]">
                  → {w}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-canvas)] p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">Evidence</p>
          <EvidencePopover evidence={evidence} />
        </div>
        <ul className="flex flex-col gap-2">
          {evidence.slice(0, 3).map((e) => (
            <li key={e.sourceUrl} className="flex flex-col">
              <a
                href={e.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-[13px] text-[var(--color-ink)] hover:text-[var(--color-purple)]"
              >
                {e.sourceTitle} ↗
              </a>
              <Freshness date={e.lastVerifiedAt} />
            </li>
          ))}
          {!evidence.length ? (
            <li className="text-[13px] text-[var(--color-muted)]">
              Railor could not verify this claim from a sufficiently reliable source.
            </li>
          ) : null}
        </ul>

        <div className="border-t border-[var(--color-line)] pt-3">
          <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
            Last verified
          </p>
          <Freshness date={lastVerifiedAt} prefix="" />
        </div>

        {rankingConfidence !== undefined ? (
          <div className="border-t border-[var(--color-line)] pt-3">
            <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
              Ranking confidence
            </p>
            <p className="text-[13px] text-[var(--color-ink-soft)]">
              {Math.round(rankingConfidence * 100)}% of the score is backed by real data
              {rankingInputsUsed.length ? ` — ${rankingInputsUsed.map(rankingInputLabel).join(", ")}` : ""}.
            </p>
            {rankingInputsMissing.length ? (
              <p className="mt-1 text-[12px] text-[var(--color-faint)]">
                No data yet for: {rankingInputsMissing.map(rankingInputLabel).join(", ")} — never guessed, dropped from the score instead.
              </p>
            ) : null}
          </div>
        ) : null}

        {history.length ? (
          <div className="border-t border-[var(--color-line)] pt-3">
            <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
              Change history
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {history.slice(0, 4).map((h, i) => (
                <li key={i} className="flex flex-col">
                  <span className="text-[12px] text-[var(--color-ink-soft)]">{h.summary}</span>
                  <span className="text-[11px] text-[var(--color-faint)]">
                    {new Date(h.detectedAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {h.previousValue && h.currentValue
                      ? ` · ${h.previousValue} → ${h.currentValue}`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
