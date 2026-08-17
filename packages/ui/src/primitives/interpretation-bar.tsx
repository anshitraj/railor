"use client";

import { useState } from "react";
import { cn } from "../cn.js";
import { Chip, ConfidenceDot } from "./badges.js";
import { SmartPicker, type PickerOption } from "./smart-picker.js";

export interface InterpretedToken {
  field: string;
  value: string | number;
  label: string;
  confidence: number;
  matchedText?: string;
}

/**
 * Railor's AI is visible as *structure*, never as a personality: whatever the
 * interpreter decided is rendered as editable chips. Correcting Railor costs
 * one click, and chips without `matchedText` are marked inferred so the user
 * knows what was assumed on their behalf.
 */
export function InterpretationBar({
  tokens,
  missing = [],
  optionsByField = {},
  fieldLabels = {},
  onChange,
  onRemove,
  className,
  dense,
}: {
  tokens: InterpretedToken[];
  missing?: string[];
  optionsByField?: Record<string, PickerOption[]>;
  fieldLabels?: Record<string, string>;
  onChange?: (field: string, value: string) => void;
  onRemove?: (field: string) => void;
  className?: string;
  dense?: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {tokens.map((token) => {
        const editable = Boolean(onChange && optionsByField[token.field]?.length);
        const inferred = !token.matchedText;
        return (
          <div key={`${token.field}:${token.value}`} className="relative">
            <Chip
              active
              onClick={editable ? () => setEditing(editing === token.field ? null : token.field) : undefined}
              onRemove={onRemove ? () => onRemove(token.field) : undefined}
              className={cn(dense && "py-1 text-[13px]")}
              title={
                inferred
                  ? "Railor inferred this — click to change"
                  : `Matched “${token.matchedText}”`
              }
            >
              <ConfidenceDot confidence={token.confidence} />
              {token.label}
              {inferred ? (
                <span className="ml-1 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                  Inferred
                </span>
              ) : null}
            </Chip>

            {editing === token.field ? (
              <div className="absolute left-0 top-full z-40 mt-2 w-[320px] rounded-2xl border border-[var(--color-line)] bg-white p-3 shadow-[var(--shadow-lift)]">
                <SmartPicker
                  label={fieldLabels[token.field] ?? token.field}
                  options={optionsByField[token.field] ?? []}
                  value={[String(token.value)]}
                  onChange={(next) => {
                    if (next[0]) onChange?.(token.field, next[0]);
                    setEditing(null);
                  }}
                />
              </div>
            ) : null}
          </div>
        );
      })}

      {missing.map((field) => (
        <div key={`missing:${field}`} className="relative">
          <Chip
            onClick={() => setEditing(editing === field ? null : field)}
            className={cn("border-dashed text-[var(--color-muted)]", dense && "py-1 text-[13px]")}
          >
            + {fieldLabels[field] ?? field}
          </Chip>
          {editing === field ? (
            <div className="absolute left-0 top-full z-40 mt-2 w-[320px] rounded-2xl border border-[var(--color-line)] bg-white p-3 shadow-[var(--shadow-lift)]">
              <SmartPicker
                label={fieldLabels[field] ?? field}
                options={optionsByField[field] ?? []}
                value={[]}
                onChange={(next) => {
                  if (next[0]) onChange?.(field, next[0]);
                  setEditing(null);
                }}
              />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
