"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Radar } from "lucide-react";
import { Button } from "@railor/ui";
import { monitorCorridor, saveCorridor } from "../../app/app/corridors/actions";

/** Law 2: an empty workspace gets a real, evaluated corridor it can keep in one click. */
export function KeepSuggestedCorridor({ query, label }: { query: Record<string, unknown>; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError("");
            const saved = await saveCorridor(query, label);
            if (!saved.ok || !saved.id) {
              setError(saved.ok ? "Couldn't save the corridor." : saved.error === "corridor_limit" ? "Your plan's corridor limit is reached." : "Couldn't save the corridor.");
              return;
            }
            await monitorCorridor(saved.id);
            router.refresh();
          })
        }
      >
        <Radar size={14} /> {pending ? "Saving…" : "Save & monitor"}
      </Button>
      {error ? <span role="alert" className="text-[12px] text-[var(--color-bad)]">{error}</span> : null}
    </div>
  );
}
