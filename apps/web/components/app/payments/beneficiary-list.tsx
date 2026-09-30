"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, type PickerOption } from "@railor/ui";
import { archiveBeneficiaryAction } from "../../../app/app/payments/actions";
import { BeneficiaryForm, type BeneficiarySummary } from "./beneficiary-form";

const METHOD_LABEL: Record<string, string> = { bank_us: "US bank", iban: "IBAN", gb: "UK bank", clabe: "CLABE", pix: "Pix", crypto_address: "Wallet" };

export function BeneficiaryList({
  beneficiaries,
  countries,
  currencies,
  canEdit,
}: {
  beneficiaries: BeneficiarySummary[];
  countries: PickerOption[];
  currencies: PickerOption[];
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(beneficiaries.length === 0);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        adding ? (
          <div className="product-panel p-5">
            <BeneficiaryForm
              countries={countries}
              currencies={currencies}
              onCreated={() => {
                setAdding(false);
                router.refresh();
              }}
            />
          </div>
        ) : (
          <Button className="w-fit" onClick={() => setAdding(true)}>
            <Plus size={14} /> Add beneficiary
          </Button>
        )
      ) : null}
      {beneficiaries.length ? (
        <ul className="product-panel divide-y divide-[var(--color-line)]">
          {beneficiaries.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="flex min-w-[180px] flex-1 flex-col">
                <span className="text-[14px] font-semibold">{b.label}</span>
                <span className="text-[12px] text-[var(--color-muted)]">{b.holderName}</span>
              </span>
              <span className="rounded-full bg-[var(--color-sand)] px-2 py-0.5 text-[11px] font-semibold">{METHOD_LABEL[b.method] ?? b.method}</span>
              <span className="font-mono text-[12.5px] text-[var(--color-ink-soft)]">{b.displayHint}</span>
              <span className="text-[12.5px] text-[var(--color-muted)]">
                {b.currency} · {b.country}
              </span>
              {canEdit ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`Archive ${b.label}? Existing payments keep their record; it can't be used for new ones.`)) {
                      start(async () => {
                        await archiveBeneficiaryAction(b.id);
                        router.refresh();
                      });
                    }
                  }}
                  className="rounded-full px-2.5 py-1 text-[12px] text-[var(--color-muted)] hover:bg-[var(--color-bad-bg)] hover:text-[var(--color-bad)]"
                >
                  Archive
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
