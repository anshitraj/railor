"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Chip, EmptyState, Freshness, SectionLabel, cn } from "@railor/ui";
import type { CompareTable } from "../../lib/compare";
import { shareComparison } from "../../app/app/compare/actions";

const TONE: Record<string, string> = {
  ok: "text-[var(--color-ok)]",
  warn: "text-[var(--color-warn)]",
  bad: "text-[var(--color-bad)]",
  neutral: "text-[var(--color-ink-soft)]",
};

/** 2–4 providers, sticky first column, and a differences-only view. */
export function CompareBoard({
  table,
  available,
  selected,
  readOnly = false,
  shareUrl,
}: {
  table: CompareTable;
  available: Array<{ slug: string; name: string }>;
  selected: string[];
  readOnly?: boolean;
  shareUrl?: string;
}) {
  const router = useRouter();
  const [diffOnly, setDiffOnly] = useState(false);
  const [link, setLink] = useState<string | undefined>(shareUrl);
  const [pending, startTransition] = useTransition();

  const grouped = useMemo(() => {
    const rows = diffOnly ? table.rows.filter((r) => r.differs) : table.rows;
    const map = new Map<string, typeof rows>();
    for (const row of rows) {
      map.set(row.group, [...(map.get(row.group) ?? []), row]);
    }
    return [...map.entries()];
  }, [table.rows, diffOnly]);

  const toggleProvider = (slug: string) => {
    const next = selected.includes(slug)
      ? selected.filter((s) => s !== slug)
      : [...selected, slug].slice(0, 4);
    router.push(`/app/compare?providers=${next.join(",")}`);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[24px] font-semibold tracking-tight">Compare providers</h1>
          <p className="text-[14px] text-[var(--color-muted)]">
            Like-for-like, from the same capability graph. Anything unevidenced reads “Unknown”.
          </p>
        </div>
        {!readOnly ? (
          <div className="flex items-center gap-2">
            <Chip active={diffOnly} onClick={() => setDiffOnly(!diffOnly)} className="text-[13px]">
              Only show differences
            </Chip>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || table.providers.length < 2}
              onClick={() =>
                startTransition(async () => {
                  const res = await shareComparison(table.providers.map((p) => p.slug));
                  if (res.ok) setLink(res.url);
                })
              }
            >
              Share comparison
            </Button>
          </div>
        ) : null}
      </div>

      {link ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] bg-[var(--color-lavender)] p-3">
          <span className="text-[12px] uppercase tracking-wide text-[var(--color-purple)]">
            Public read-only link
          </span>
          <code className="flex-1 break-all text-[12.5px]">{link}</code>
        </div>
      ) : null}

      {!readOnly ? (
        <Card className="flex flex-wrap items-center gap-2 p-4">
          <SectionLabel className="mr-1">Providers</SectionLabel>
          {available.map((p) => (
            <Chip
              key={p.slug}
              active={selected.includes(p.slug)}
              onClick={() => toggleProvider(p.slug)}
              className="text-[13px]"
            >
              {p.name}
            </Chip>
          ))}
        </Card>
      ) : null}

      {table.providers.length >= 2 ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-line)]">
                <th className="sticky left-0 z-10 bg-white p-4 text-[11px] uppercase tracking-wide text-[var(--color-faint)]">
                  Capability
                </th>
                {table.providers.map((p) => (
                  <th key={p.slug} className="p-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[14px] font-medium">{p.name}</span>
                      <span className="text-[11px] text-[var(--color-muted)]">{p.category}</span>
                      <Freshness date={p.verifiedAt} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map(([group, rows]) => (
                <>
                  <tr key={group} className="bg-[var(--color-canvas)]">
                    <td
                      colSpan={table.providers.length + 1}
                      className="px-4 py-2 text-[11px] uppercase tracking-wide text-[var(--color-muted)]"
                    >
                      {group}
                    </td>
                  </tr>
                  {rows.map((row) => (
                    <tr key={`${group}-${row.label}`} className="border-b border-[var(--color-line)]">
                      <td className="sticky left-0 z-10 bg-white px-4 py-2.5 text-[var(--color-ink-soft)]">
                        {row.label}
                      </td>
                      {row.cells.map((cell, i) => (
                        <td
                          key={`${row.label}-${i}`}
                          className={cn("px-4 py-2.5", TONE[cell.tone], row.differs && "font-medium")}
                        >
                          {cell.value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState
          what="Pick at least two providers"
          why="A comparison needs two to four providers. Railor lines them up on the same capability rows so a difference is a difference, not a formatting artefact."
          actionLabel="Open the directory"
          href="/app/providers"
        />
      )}
    </div>
  );
}
