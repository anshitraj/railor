"use client";

import { useState } from "react";
import { cn } from "../cn.js";
import { Button } from "./base.js";
import { Chip } from "./badges.js";

export interface ParsedItem {
  field: string;
  value: string;
  label: string;
}

/**
 * Paste is an input method.
 *
 * Anywhere Railor wants structure, it accepts the unstructured thing the user
 * already has — a sentence, a provider's requirement email, a CSV column of
 * corridors — parses it, and hands back editable chips for confirmation.
 * Nothing is applied until the user confirms.
 */
export function PasteToStructure({
  placeholder = "Paste a sentence, a checklist, or a comma-separated list…",
  parse,
  onConfirm,
  hint,
  className,
  compact,
}: {
  placeholder?: string;
  parse: (input: string) => Promise<ParsedItem[]> | ParsedItem[];
  onConfirm: (items: ParsedItem[]) => void;
  hint?: string;
  className?: string;
  compact?: boolean;
}) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<ParsedItem[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (value: string) => {
    if (!value.trim()) return;
    setBusy(true);
    try {
      setItems(await parse(value));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--color-line-strong)] bg-white p-4",
        className,
      )}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          if (pasted.trim()) void run(pasted);
        }}
        onBlur={() => void run(text)}
        placeholder={placeholder}
        rows={compact ? 2 : 3}
        className="w-full resize-none bg-transparent text-[14px] leading-relaxed outline-none placeholder:text-[var(--color-faint)]"
      />

      {hint && !items ? (
        <p className="text-[12px] text-[var(--color-faint)]">{hint}</p>
      ) : null}

      {busy ? <p className="text-[12px] text-[var(--color-muted)]">Reading…</p> : null}

      {items ? (
        <div className="flex flex-col gap-3 border-t border-[var(--color-line)] pt-3">
          <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
            Railor read this as — remove anything wrong
          </p>
          {items.length ? (
            <div className="flex flex-wrap gap-2">
              {items.map((item) => (
                <Chip
                  key={`${item.field}:${item.value}`}
                  active
                  onRemove={() =>
                    setItems(items.filter((x) => !(x.field === item.field && x.value === item.value)))
                  }
                >
                  {item.label}
                </Chip>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-[var(--color-muted)]">
              Nothing recognisable yet. Add a country, currency, asset or requirement and Railor
              will pick it up.
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={!items.length}
              onClick={() => {
                onConfirm(items);
                setItems(null);
                setText("");
              }}
            >
              Use these {items.length ? `(${items.length})` : ""}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setItems(null)}>
              Discard
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
