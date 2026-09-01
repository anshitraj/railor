"use client";

import { useState } from "react";
import { cn } from "../cn.js";
import { ConfidenceDot, Freshness } from "./badges.js";

export interface EvidenceItem {
  sourceUrl: string;
  sourceTitle: string;
  sourceType: string;
  verificationType?: string;
  retrievedAt: string | Date;
  lastVerifiedAt: string | Date;
  confidence: number;
  rawExcerpt?: string;
}

const SOURCE_LABEL: Record<string, string> = {
  official_docs: "Official documentation",
  api: "Provider API",
  pricing: "Pricing page",
  help_center: "Help centre",
  terms: "Terms",
  status_page: "Status page",
  github: "Public repository",
  official_announcement: "Announcement",
  manual_verified: "Manually verified",
  third_party: "Third-party source",
};

const VERIFICATION_LABEL: Record<string, string> = {
  provider_reported: "Provider-reported",
  railor_observed: "Railor-observed",
  provider_verified: "Provider-verified",
};

/**
 * Attaches provenance to a claim. A claim with no evidence renders as
 * "Unknown" — Railor would rather say nothing than sound certain.
 */
export function EvidencePopover({
  evidence,
  label = "View evidence",
  className,
}: {
  evidence: EvidenceItem[];
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!evidence.length) {
    return (
      <span className={cn("text-[11px] text-[var(--color-muted)]", className)}>
        No verified source
      </span>
    );
  }

  return (
    <div className={cn("relative inline-block", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-[12px] font-medium text-[var(--color-purple)] underline-offset-2 hover:underline"
      >
        {label} ({evidence.length})
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[380px] rounded-2xl border border-[var(--color-line)] bg-white p-3 text-left shadow-[var(--shadow-lift)]">
          <ul className="flex flex-col gap-3">
            {evidence.map((e) => (
              <li key={e.sourceUrl} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
                    {VERIFICATION_LABEL[e.verificationType ?? "provider_reported"]} · {SOURCE_LABEL[e.sourceType] ?? e.sourceType}
                  </span>
                  <ConfidenceDot confidence={e.confidence} showValue />
                </div>
                <a
                  href={e.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-[13px] font-medium text-[var(--color-ink)] hover:text-[var(--color-purple)]"
                >
                  {e.sourceTitle} ↗
                </a>
                {e.rawExcerpt ? (
                  <p className="rounded-lg bg-[var(--color-canvas)] p-2 text-[12px] leading-snug text-[var(--color-ink-soft)]">
                    “{e.rawExcerpt}”
                  </p>
                ) : null}
                <Freshness date={e.lastVerifiedAt} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
