"use client";

import { cn } from "../cn.js";

export type Verdict = "supported" | "additional_requirements" | "unavailable" | "unknown";
export type Stage = "live" | "beta" | "soon";

const VERDICT_STYLE: Record<Verdict, { label: string; className: string; dot: string }> = {
  supported: {
    label: "Supported",
    className: "bg-[var(--color-ok-bg)] text-[var(--color-ok)]",
    dot: "bg-[var(--color-ok)]",
  },
  additional_requirements: {
    label: "Additional requirements",
    className: "bg-[var(--color-warn-bg)] text-[var(--color-warn)]",
    dot: "bg-[var(--color-warn)]",
  },
  unavailable: {
    label: "Unavailable",
    className: "bg-[var(--color-bad-bg)] text-[var(--color-bad)]",
    dot: "bg-[var(--color-bad)]",
  },
  unknown: {
    label: "Unknown",
    className: "bg-[var(--color-unknown-bg)] text-[var(--color-unknown)]",
    dot: "bg-[var(--color-unknown)]",
  },
};

export function VerdictPill({
  verdict,
  className,
  compact,
}: {
  verdict: Verdict;
  className?: string;
  compact?: boolean;
}) {
  const style = VERDICT_STYLE[verdict];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        style.className,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", style.dot)} aria-hidden />
      {style.label}
    </span>
  );
}

/**
 * Roadmap honesty: unfinished surfaces stay in the navigation with a badge
 * rather than being hidden or faked.
 */
export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  const map: Record<Stage, string> = { live: "Live", beta: "Beta", soon: "Coming soon" };
  return (
    <span
      className={cn(
        "rounded-full border border-[var(--color-line)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        stage === "soon" ? "text-[var(--color-faint)]" : "text-[var(--color-purple)]",
        stage === "beta" && "bg-[var(--color-lavender)]",
        className,
      )}
    >
      {map[stage]}
    </span>
  );
}

export function ConfidenceDot({
  confidence,
  showValue = false,
}: {
  confidence: number;
  showValue?: boolean;
}) {
  const tone =
    confidence >= 0.95
      ? "bg-[var(--color-ok)]"
      : confidence >= 0.85
        ? "bg-[var(--color-lime)]"
        : confidence >= 0.7
          ? "bg-[var(--color-warn)]"
          : "bg-[var(--color-bad)]";
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-muted)]">
      <span className={cn("size-1.5 rounded-full", tone)} aria-hidden />
      {showValue ? `${Math.round(confidence * 100)}%` : null}
    </span>
  );
}

export function Chip({
  children,
  onClick,
  onRemove,
  active,
  className,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  onRemove?: () => void;
  active?: boolean;
  className?: string;
  title?: string;
}) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition",
        active
          ? "border-[var(--color-purple)] bg-[var(--color-lavender)] text-[var(--color-purple-deep)]"
          : "border-[var(--color-line)] bg-white text-[var(--color-ink-soft)]",
        onClick && "hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-soft)]",
        className,
      )}
    >
      {children}
      {onRemove ? (
        <span
          role="button"
          tabIndex={0}
          aria-label="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }
          }}
          className="ml-0.5 rounded-full px-1 text-[var(--color-faint)] hover:text-[var(--color-ink)]"
        >
          ×
        </span>
      ) : null}
    </Tag>
  );
}

export function Freshness({ date, prefix = "Verified" }: { date: Date | string | null; prefix?: string }) {
  if (!date) return <span className="text-[11px] text-[var(--color-faint)]">Never verified</span>;
  const d = typeof date === "string" ? new Date(date) : date;
  const mins = Math.max(1, Math.round((Date.now() - d.getTime()) / 60000));
  const label =
    mins < 60
      ? `${mins}m ago`
      : mins < 1440
        ? `${Math.round(mins / 60)}h ago`
        : `${Math.round(mins / 1440)}d ago`;
  const stale = mins > 60 * 24 * 30;
  return (
    <span
      className={cn(
        "text-[11px]",
        stale ? "text-[var(--color-warn)]" : "text-[var(--color-muted)]",
      )}
      title={d.toISOString()}
    >
      {prefix} {label}
    </span>
  );
}
