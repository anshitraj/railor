"use client";

import { useTransition } from "react";
import { deleteWatch } from "../../app/app/corridors/actions";

export function UnwatchButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => void (await deleteWatch(id)))}
      className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[12px] text-[var(--color-muted)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-ink)]"
    >
      {pending ? "…" : "Stop"}
    </button>
  );
}
