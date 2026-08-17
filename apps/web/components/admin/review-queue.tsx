"use client";

import { useState, useTransition } from "react";
import { Button, Card, Freshness, SectionLabel } from "@railor/ui";
import { approveChange, rejectChange } from "../../app/admin/actions";

export interface ReviewItem {
  id: string;
  provider: string;
  kind: string;
  field: string;
  previousValue: string | null;
  currentValue: string | null;
  summary: string;
  confidence: number;
  detectedAt: string;
  sourceUrl: string | null;
  sourceTitle: string | null;
}

/** Human review is the gate between detection and publication. */
export function ReviewQueue({ items }: { items: ReviewItem[] }) {
  const [queue, setQueue] = useState(items);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const resolve = (id: string, action: "approve" | "reject") =>
    startTransition(async () => {
      const res = action === "approve" ? await approveChange(id) : await rejectChange(id);
      if (res.ok) {
        setQueue((current) => current.filter((item) => item.id !== id));
        setNote(
          action === "approve"
            ? "applied" in res && res.applied
              ? "Approved and applied to the capability graph."
              : "Approved and recorded — this field is not mechanically applicable."
            : "Rejected. The detected change stays in history, unpublished.",
        );
      }
    });

  if (!queue.length) {
    return (
      <Card className="flex flex-col gap-2 p-5">
        <SectionLabel>Review queue</SectionLabel>
        <p className="text-[14px] text-[var(--color-ink-soft)]">
          Nothing is waiting for review. Detected changes land here when confidence is below
          threshold or the field can break a live integration.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {note ? (
        <p className="rounded-[var(--radius-card)] bg-[var(--color-lavender)] px-4 py-2 text-[13px] text-[var(--color-purple-deep)]">
          {note}
        </p>
      ) : null}

      {queue.map((item) => (
        <Card key={item.id} className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--color-lavender)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-purple)]">
              {item.kind.replace(/_/g, " ")}
            </span>
            <span className="text-[14px] font-medium">{item.provider}</span>
            <code className="text-[12px] text-[var(--color-muted)]">{item.field}</code>
            <span className="flex-1" />
            <Freshness date={item.detectedAt} prefix="Detected" />
          </div>

          <p className="text-[14px] leading-snug">{item.summary}</p>

          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Previous" value={item.previousValue ?? "—"} />
            <Field label="Detected" value={item.currentValue ?? "—"} highlight />
            <Field label="Confidence" value={item.confidence.toFixed(2)} />
          </div>

          {item.sourceUrl ? (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[13px] text-[var(--color-purple)]"
            >
              {item.sourceTitle ?? item.sourceUrl} ↗
            </a>
          ) : null}

          <div className="flex items-center gap-2 border-t border-[var(--color-line)] pt-3">
            <Button size="sm" disabled={pending} onClick={() => resolve(item.id, "approve")}>
              Approve
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => resolve(item.id, "reject")}
            >
              Reject
            </Button>
            <span className="text-[12px] text-[var(--color-muted)]">
              Approving publishes this to every surface, including the API and MCP.
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-line)] p-3">
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-faint)]">{label}</p>
      <p
        className={`text-[13.5px] ${highlight ? "font-medium text-[var(--color-purple)]" : "text-[var(--color-ink-soft)]"}`}
      >
        {value}
      </p>
    </div>
  );
}
