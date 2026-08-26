"use client";

import { useState, useTransition } from "react";
import { refreshCountryResearch } from "../../app/admin/actions";
import { Freshness } from "@railor/ui";

export interface CountryResearchRow {
  iso2: string;
  name: string;
  lastResearchedAt: string | null;
  sourcesUsed: number | null;
  status: string | null;
}

/**
 * Mirrors UsageMaintenance's shape: one button per row, useTransition for
 * the pending state, a short inline result message. One row per
 * RESEARCHABLE_COUNTRIES entry — this panel intentionally never offers "run
 * all five" or any other country, matching the pipeline's own scope lock.
 */
export function CountryResearchPanel({ rows }: { rows: CountryResearchRow[] }) {
  const [pending, startTransition] = useTransition();
  const [runningCode, setRunningCode] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  const refresh = (iso2: string) => {
    setRunningCode(iso2);
    startTransition(async () => {
      try {
        const report = await refreshCountryResearch(iso2);
        setResults((prev) => ({
          ...prev,
          [iso2]: report.status === "failed" ? `failed: ${report.errorMessage}` : `${report.status} · ${report.sourcesUsed} sources`,
        }));
      } catch (error) {
        setResults((prev) => ({ ...prev, [iso2]: (error as Error).message }));
      } finally {
        setRunningCode(null);
      }
    });
  };

  return (
    <ul className="flex max-h-[480px] flex-col gap-2 overflow-y-auto pr-1">
      {rows.map((row) => (
        <li key={row.iso2} className="flex flex-col gap-1 border-b border-[var(--color-line)] pb-2 last:border-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium">{row.name}</span>
            <span className="text-[11px] text-[var(--color-faint)]">{row.iso2}</span>
            <span className="flex-1" />
            {row.status ? <span className="text-[11px] text-[var(--color-muted)]">{row.status}</span> : null}
            <button
              type="button"
              disabled={pending}
              onClick={() => refresh(row.iso2)}
              className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[11px] text-[var(--color-muted)] hover:border-[var(--color-line-strong)] disabled:opacity-50"
            >
              {pending && runningCode === row.iso2 ? "Researching…" : "Refresh"}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Freshness date={row.lastResearchedAt} prefix="Researched" />
            {row.sourcesUsed !== null ? (
              <span className="text-[11px] text-[var(--color-faint)]">· {row.sourcesUsed} sources</span>
            ) : null}
          </div>
          {results[row.iso2] ? <span className="text-[11px] text-[var(--color-muted)]">{results[row.iso2]}</span> : null}
        </li>
      ))}
    </ul>
  );
}
