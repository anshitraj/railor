import type { ConfidenceBand } from "@railor/types";

export function evidenceConfidence(value: number, band: ConfidenceBand) {
  const tones = { verified: "good", high: "good", medium: "warn", needs_review: "bad", potentially_outdated: "muted" } as const;
  if (!Number.isFinite(value)) return { label: "—", ratio: 0, tone: "muted" as const };
  const ratio = Math.min(1, Math.max(0, value));
  return { label: `${Math.round(ratio * 100)}%`, ratio, tone: tones[band] };
}

export function evidenceSourceHref(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
