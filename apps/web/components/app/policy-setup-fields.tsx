"use client";

import { useId, useState } from "react";
import styles from "./policy-setup.module.css";

export interface PolicyChoice { value: string; label: string; description?: string; tag?: string }
export function PolicyChoices({ label, value, options, onChange }: { label: string; value: string; options: PolicyChoice[]; onChange: (value: string) => void }) {
  const group = useId();
  return <fieldset className={styles.choices}>
    <legend className="sr-only">{label}</legend>
    {options.map((option) => <label key={option.value} className={styles.choice}>
      <span className={styles.choiceText}><span className={styles.choiceTitle}>{option.label}{option.tag && <span className={styles.tag}>{option.tag}</span>}</span>{option.description && <span className={styles.choiceDescription}>{option.description}</span>}</span>
      <input type="radio" name={group} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
    </label>)}
  </fieldset>;
}

export function PolicyNumberQuestion({ label, value, onChange, presets, offLabel, customLabel, unit, factor = 1, allowZero = false, integer = false, onError }: {
  label: string; value: number | undefined; onChange: (value: number | undefined) => void;
  presets: Array<{ value: number; label: string; description?: string; tag?: string }>;
  offLabel: string; customLabel: string; unit: string; factor?: number; allowZero?: boolean; integer?: boolean;
  onError: (error: string) => void;
}) {
  const [custom, setCustom] = useState(value !== undefined && !presets.some((preset) => preset.value === value));
  const [raw, setRaw] = useState(value === undefined ? "" : String(value / factor));
  const [error, setError] = useState("");
  const id = useId();
  const validate = (text: string) => {
    const number = Number(text) * factor;
    const message = !text.trim() || !Number.isFinite(number) || (allowZero ? number < 0 : number <= 0) || (integer && !Number.isInteger(number))
      ? `Enter ${integer ? "a whole number" : "a number"} ${allowZero ? "of zero or more" : "greater than zero"}.` : "";
    setError(message); onError(message);
    if (!message) onChange(number);
  };
  return <div className={styles.numberChoices}>
    <PolicyChoices label={label} value={custom ? "custom" : value === undefined ? "off" : String(value)} options={[
      { value: "off", label: offLabel }, ...presets.map((preset) => ({ ...preset, value: String(preset.value) })), { value: "custom", label: "Choose a custom amount" },
    ]} onChange={(next) => {
      setCustom(next === "custom");
      if (next === "custom") validate(raw);
      else { setError(""); onError(""); const number = next === "off" ? undefined : Number(next); setRaw(number === undefined ? "" : String(number / factor)); onChange(number); }
    }} />
    {custom && <div className={styles.customNumber}>
      <label htmlFor={id}>{customLabel}</label>
      <div><input id={id} type="number" inputMode="decimal" min={allowZero ? 0 : integer ? 1 : "0.000001"} step={integer ? 1 : "any"} value={raw} onChange={(event) => { setRaw(event.target.value); validate(event.target.value); }} aria-invalid={Boolean(error)} aria-describedby={`${id}-unit${error ? ` ${id}-error` : ""}`} /><span id={`${id}-unit`}>{unit}</span></div>
      {error && <p id={`${id}-error`} role="alert">{error}</p>}
    </div>}
  </div>;
}
