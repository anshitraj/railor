"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SmartPicker, cn, type PickerOption } from "@railor/ui";

type Query = Record<string, string | number | undefined>;

const ROWS: Array<{ key: string; label: string }> = [
  { key: "entityCountry", label: "Company" },
  { key: "customerType", label: "Customer" },
  { key: "sourceAsset", label: "Source" },
  { key: "sourceNetwork", label: "Network" },
  { key: "destinationCountry", label: "Destination" },
];

/**
 * The structured confirmation step: natural language got the user here, this
 * grid is what they actually correct. Every value is a real field on the
 * query, one click away from being changed — never freeform text again once
 * Railor has taken a first pass at it.
 */
export function QueryConfirmation({
  query,
  optionsByField,
  fieldLabels,
  onChange,
}: {
  query: Query;
  optionsByField: Record<string, PickerOption[]>;
  fieldLabels: Record<string, string>;
  onChange: (field: string, value: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-muted)]">
        Is this correct?
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ROWS.map((row) => (
          <FieldCell
            key={row.key}
            label={row.label}
            field={row.key}
            value={query[row.key]}
            options={optionsByField[row.key] ?? []}
            editing={editing}
            setEditing={setEditing}
            onPick={(value) => onChange(row.key, value)}
          />
        ))}

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-faint)]">
            Receive
          </span>
          <div className="flex flex-wrap gap-1.5">
            <ValuePill
              field="destinationCurrency"
              value={query.destinationCurrency}
              options={optionsByField.destinationCurrency ?? []}
              editing={editing}
              setEditing={setEditing}
              onPick={(value) => onChange("destinationCurrency", value)}
              fieldLabel={fieldLabels.destinationCurrency ?? "Currency"}
            />
            <ValuePill
              field="paymentMethod"
              value={query.paymentMethod}
              options={optionsByField.paymentMethod ?? []}
              editing={editing}
              setEditing={setEditing}
              onPick={(value) => onChange("paymentMethod", value)}
              fieldLabel={fieldLabels.paymentMethod ?? "Rail"}
              formatLabel={(l) => l.replace(/_/g, " ")}
            />
          </div>
        </div>

        <AmountCell
          value={query.amount}
          editing={editing}
          setEditing={setEditing}
          onPick={(value) => onChange("amount", value)}
        />
      </div>
    </div>
  );
}

function FieldCell({
  label,
  field,
  value,
  options,
  editing,
  setEditing,
  onPick,
}: {
  label: string;
  field: string;
  value: string | number | undefined;
  options: PickerOption[];
  editing: string | null;
  setEditing: (field: string | null) => void;
  onPick: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-faint)]">
        {label}
      </span>
      <ValuePill
        field={field}
        value={value}
        options={options}
        editing={editing}
        setEditing={setEditing}
        onPick={onPick}
        fieldLabel={label}
      />
    </div>
  );
}

function ValuePill({
  field,
  value,
  options,
  editing,
  setEditing,
  onPick,
  fieldLabel,
  formatLabel,
}: {
  field: string;
  value: string | number | undefined;
  options: PickerOption[];
  editing: string | null;
  setEditing: (field: string | null) => void;
  onPick: (value: string) => void;
  fieldLabel: string;
  formatLabel?: (label: string) => string;
}) {
  const isEditing = editing === field;
  const isSet = value !== undefined && value !== null && value !== "";
  const option = options.find((o) => o.value === String(value));
  const display = option ? (formatLabel ? formatLabel(option.label) : option.label) : String(value ?? "");

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setEditing(isEditing ? null : field)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-[13px] transition",
          isSet
            ? "border-[var(--color-line-strong)] bg-white text-[var(--color-ink)] hover:border-[var(--color-orange)]"
            : "border-dashed border-[var(--color-line-strong)] text-[var(--color-faint)] hover:border-[var(--color-orange)] hover:text-[var(--color-orange-deep)]",
        )}
      >
        {option?.emoji ? <span aria-hidden>{option.emoji}</span> : null}
        {isSet ? display : "Not specified"}
      </button>

      <AnimatePresence>
        {isEditing ? (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full z-50 mt-2 w-[300px] rounded-2xl border border-[var(--color-line)] bg-white p-3 shadow-[var(--shadow-panel)]"
          >
            <SmartPicker
              label={fieldLabel}
              options={options}
              value={isSet ? [String(value)] : []}
              onChange={(next) => {
                if (next[0]) onPick(next[0]);
                setEditing(null);
              }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function AmountCell({
  value,
  editing,
  setEditing,
  onPick,
}: {
  value: string | number | undefined;
  editing: string | null;
  setEditing: (field: string | null) => void;
  onPick: (value: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const isEditing = editing === "amount";
  const isSet = value !== undefined && value !== null && value !== "";

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && !Number.isNaN(Number(trimmed))) onPick(trimmed);
    setEditing(null);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-faint)]">
        Amount
      </span>
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setDraft(isSet ? String(value) : "");
            setEditing(isEditing ? null : "amount");
          }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-[13px] transition",
            isSet
              ? "border-[var(--color-line-strong)] bg-white text-[var(--color-ink)] hover:border-[var(--color-orange)]"
              : "border-dashed border-[var(--color-line-strong)] text-[var(--color-faint)] hover:border-[var(--color-orange)] hover:text-[var(--color-orange-deep)]",
          )}
        >
          {isSet ? value : "Not specified"}
        </button>

        <AnimatePresence>
          {isEditing ? (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 top-full z-50 mt-2 flex w-[220px] gap-1.5 rounded-2xl border border-[var(--color-line)] bg-white p-2 shadow-[var(--shadow-panel)]"
            >
              <input
                autoFocus
                type="number"
                inputMode="decimal"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && commit()}
                placeholder="e.g. 25000"
                className="w-full rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--color-orange)]"
              />
              <button
                type="button"
                onClick={commit}
                className="shrink-0 rounded-full bg-[var(--color-ink)] px-3 py-1.5 text-[12px] font-semibold text-white"
              >
                Set
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
