"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Mail } from "lucide-react";
import { CHANGE_KIND_LABEL, type ChangeKind } from "@railor/types";
import { cn } from "@railor/ui";
import { updateWatch } from "../../app/app/corridors/actions";
import { PresetChip, Segmented } from "./form-kit";

const KINDS = Object.keys(CHANGE_KIND_LABEL) as ChangeKind[];

/** Per-monitor delivery: digest cadence, email on/off and which change kinds count — all clicks. */
export function WatchSettings({
  id,
  digest,
  channelEmail,
  kinds,
  readOnly,
}: {
  id: string;
  digest: string;
  channelEmail: boolean;
  kinds: string[];
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ digest, channelEmail, kinds });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const save = (patch: Partial<typeof state>) => {
    const next = { ...state, ...patch };
    if (!next.kinds.length) {
      setError("Keep at least one change type.");
      return;
    }
    setState(next);
    setError("");
    start(async () => {
      const result = await updateWatch(id, patch);
      if (!result.ok) {
        setError("Couldn't save. Try again.");
        setState(state);
      } else router.refresh();
    });
  };

  if (readOnly) return null;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex w-fit items-center gap-1 text-[11.5px] font-semibold text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
      >
        {state.digest === "instant" ? "Instant" : state.digest === "daily" ? "Daily digest" : "Weekly digest"} · {state.channelEmail ? "email on" : "dashboard only"}
        <ChevronDown size={13} className={cn("transition-transform", open && "rotate-180")} />
        {pending ? <span className="ml-1 text-[var(--color-faint)]">saving…</span> : null}
      </button>
      {open ? (
        <div className="railor-pop flex flex-col gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] p-3">
          <Segmented
            label="Digest"
            size="sm"
            value={state.digest}
            onChange={(v) => save({ digest: v })}
            options={[
              { value: "instant", label: "Instant" },
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
            ]}
          />
          <PresetChip active={state.channelEmail} onClick={() => save({ channelEmail: !state.channelEmail })}>
            <span className="inline-flex items-center gap-1.5">
              <Mail size={12} /> Email {state.channelEmail ? "on" : "off"}
            </span>
          </PresetChip>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Change types">
            {KINDS.map((kind) => (
              <PresetChip
                key={kind}
                active={state.kinds.includes(kind)}
                onClick={() => save({ kinds: state.kinds.includes(kind) ? state.kinds.filter((k) => k !== kind) : [...state.kinds, kind] })}
              >
                {CHANGE_KIND_LABEL[kind]}
              </PresetChip>
            ))}
          </div>
          {error ? <p role="alert" className="text-[12px] text-[var(--color-bad)]">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
