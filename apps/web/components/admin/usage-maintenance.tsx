"use client";

import { useState, useTransition } from "react";
import { runUsageMaintenance } from "../../app/admin/actions";

/**
 * Manual trigger for the usage rollup + retention job. Production should
 * call POST /api/internal/usage-rollup on a schedule instead — no cron is
 * wired up yet, so this button is the only way to run it until one is.
 */
export function UsageMaintenance() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {result ? <span className="text-[11px] text-[var(--color-muted)]">{result}</span> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await runUsageMaintenance();
            setResult(`rolled up ${res.rollup.rowsWritten} rows · pruned ${res.pruned.deleted}`);
          })
        }
        className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[11px] text-[var(--color-muted)] hover:border-[var(--color-line-strong)] disabled:opacity-50"
      >
        {pending ? "Running…" : "Run rollup now"}
      </button>
    </div>
  );
}
