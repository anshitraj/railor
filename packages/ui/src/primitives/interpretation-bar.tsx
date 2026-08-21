"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
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
  const close = () => setEditing(null);

  return (
    <div className={cn("relative flex flex-wrap items-center gap-2", className)}>
      {/* A dimmed backdrop, not just an absolutely-positioned box: without it
          the picker panel floats over whatever happens to sit below it in the
          page (results, other rows) and that content bleeds in around the
          panel's edges. The backdrop gives the open picker a surface of its
          own and doubles as click-outside-to-close. */}
      <AnimatePresence>
        {editing ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-[rgb(23_23_27/0.24)] backdrop-blur-[2px]"
            onClick={close}
            aria-hidden
          />
        ) : null}
      </AnimatePresence>

      {tokens.map((token) => {
        const editable = Boolean(onChange && optionsByField[token.field]?.length);
        const inferred = !token.matchedText;
        const isEditing = editing === token.field;
        return (
          <div key={`${token.field}:${token.value}`} className="relative">
            <Chip
              active
              onClick={editable ? () => setEditing(isEditing ? null : token.field) : undefined}
              onRemove={onRemove ? () => onRemove(token.field) : undefined}
              className={cn(dense && "py-1 text-[13px]", isEditing && "relative z-50")}
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

            {isEditing ? (
              <div
                className="absolute left-0 top-full z-50 mt-2 w-[320px] rounded-2xl border border-[var(--color-line)] bg-white p-3 shadow-[var(--shadow-panel)]"
                onClick={(e) => e.stopPropagation()}
              >
                <SmartPicker
                  label={fieldLabels[token.field] ?? token.field}
                  options={optionsByField[token.field] ?? []}
                  value={[String(token.value)]}
                  onChange={(next) => {
                    if (next[0]) onChange?.(token.field, next[0]);
                    close();
                  }}
                />
              </div>
            ) : null}
          </div>
        );
      })}

      {missing.map((field) => {
        const isEditing = editing === field;
        return (
          <div key={`missing:${field}`} className="relative">
            <Chip
              onClick={() => setEditing(isEditing ? null : field)}
              className={cn(
                "border-dashed text-[var(--color-muted)]",
                dense && "py-1 text-[13px]",
                isEditing && "relative z-50",
              )}
            >
              + {fieldLabels[field] ?? field}
            </Chip>
            {isEditing ? (
              <div
                className="absolute left-0 top-full z-50 mt-2 w-[320px] rounded-2xl border border-[var(--color-line)] bg-white p-3 shadow-[var(--shadow-panel)]"
                onClick={(e) => e.stopPropagation()}
              >
                <SmartPicker
                  label={fieldLabels[field] ?? field}
                  options={optionsByField[field] ?? []}
                  value={[]}
                  onChange={(next) => {
                    if (next[0]) onChange?.(field, next[0]);
                    close();
                  }}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
