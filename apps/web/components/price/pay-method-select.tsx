"use client";

import { ChevronDown, Landmark } from "lucide-react";
import type { CustomerContext } from "@railor/core";
import styles from "./price.module.css";

export type PayMethod = NonNullable<CustomerContext["paymentMethod"]>;

export const PAY_METHODS: Array<{ value: PayMethod; label: string; hint: string }> = [
  { value: "local_bank", label: "Local bank transfer", hint: "e.g. a US ACH transfer into your receiving account" },
  { value: "wire", label: "International wire (SWIFT)", hint: "Intermediary banks may deduct extra" },
  { value: "card", label: "Card", hint: "Card fees are usually different" },
  { value: "transfer_service", label: "Transfer app (Wise, Remitly…)", hint: "Your client sends with their own app" },
];

/** How the payer funds it — prices are only compared within one method. */
export function PayMethodSelect({ value, onChange, label = "Client pays by" }: { value: PayMethod; onChange: (value: PayMethod) => void; label?: string }) {
  const current = PAY_METHODS.find((option) => option.value === value) ?? PAY_METHODS[0]!;
  return (
    <label className={styles.payMethod} title={current.hint}>
      <Landmark size={15} aria-hidden />
      <span className={styles.payMethodLabel}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as PayMethod)} aria-label={label}>
        {PAY_METHODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <ChevronDown size={14} aria-hidden className={styles.payMethodChevron} />
    </label>
  );
}
