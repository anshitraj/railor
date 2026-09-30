"use client";

import { SmartPicker, type PickerOption } from "@railor/ui";
import { CurrencyLogo } from "../marketing/currency-logo";
import { NetworkLogo } from "../marketing/network-logo";
import { FieldBlock, NumberWithPresets, Segmented } from "./form-kit";

export interface IntentOptions {
  countries: PickerOption[];
  currencies: PickerOption[];
  assets: PickerOption[];
  networks: PickerOption[];
  currencyByCountry: Record<string, string>;
}

export interface IntentDraft {
  sourceKind: "fiat" | "asset";
  sourceEntityCountry: string;
  sourceEntityType: "business" | "individual";
  beneficiaryType: "business" | "individual";
  sourceCurrency: string;
  sourceAsset: string;
  sourceNetwork: string;
  destinationCountry: string;
  destinationCurrency: string;
  amount: number | undefined;
}

export function defaultIntentDraft(entityCountry = "IN"): IntentDraft {
  return {
    sourceKind: "fiat",
    sourceEntityCountry: entityCountry,
    sourceEntityType: "business",
    beneficiaryType: "business",
    sourceCurrency: entityCountry === "IN" ? "INR" : "USD",
    sourceAsset: "USDC",
    sourceNetwork: "base",
    destinationCountry: "AE",
    destinationCurrency: "AED",
    amount: 1000,
  };
}

/** Accepts a partial agent/API draft and fills only the gaps the builder needs to render. */
export function draftFromPartial(partial: Record<string, unknown>, entityCountry = "IN"): IntentDraft {
  const base = defaultIntentDraft(entityCountry);
  const str = (key: string) => (typeof partial[key] === "string" ? (partial[key] as string) : undefined);
  const asset = str("sourceAsset");
  return {
    ...base,
    sourceKind: asset ? "asset" : "fiat",
    sourceEntityCountry: str("sourceEntityCountry") ?? base.sourceEntityCountry,
    sourceEntityType: str("sourceEntityType") === "individual" ? "individual" : "business",
    beneficiaryType: str("beneficiaryType") === "individual" ? "individual" : "business",
    sourceCurrency: str("sourceCurrency") ?? base.sourceCurrency,
    sourceAsset: asset ?? base.sourceAsset,
    sourceNetwork: str("sourceNetwork") ?? base.sourceNetwork,
    destinationCountry: str("destinationCountry") ?? "",
    destinationCurrency: str("destinationCurrency") ?? "",
    amount: typeof partial.amount === "number" ? partial.amount : undefined,
  };
}

/** The PaymentIntent the server validates. Amount is always in the funding unit — no FX. */
export function intentFromDraft(draft: IntentDraft): Record<string, unknown> {
  const common = {
    sourceEntityCountry: draft.sourceEntityCountry,
    sourceEntityType: draft.sourceEntityType,
    beneficiaryType: draft.beneficiaryType,
    destinationCountry: draft.destinationCountry,
    destinationCurrency: draft.destinationCurrency || undefined,
    amount: draft.amount,
  };
  return draft.sourceKind === "fiat"
    ? { ...common, sourceCurrency: draft.sourceCurrency, amountCurrency: draft.sourceCurrency }
    : { ...common, sourceAsset: draft.sourceAsset, sourceNetwork: draft.sourceNetwork || undefined };
}

export function missingIntentFields(draft: IntentDraft): string[] {
  const missing: string[] = [];
  if (!draft.sourceEntityCountry) missing.push("entity country");
  if (!draft.destinationCountry) missing.push("destination country");
  if (draft.sourceKind === "fiat" && !draft.sourceCurrency) missing.push("source currency");
  if (draft.sourceKind === "asset" && !draft.sourceAsset) missing.push("source asset");
  if (!draft.amount || draft.amount <= 0) missing.push("amount");
  return missing;
}

const AMOUNT_PRESETS = [
  { value: 1_000, label: "1K" },
  { value: 10_000, label: "10K" },
  { value: 100_000, label: "100K" },
  { value: 1_000_000, label: "1M" },
];

/**
 * A payment route, built entirely from pickers. Picking a destination country
 * pre-selects its local currency (inferred, visibly editable — never silent).
 */
/** Token and chain logos on the asset and network pickers (countries and currencies carry flags). */
const assetMark = (option: PickerOption) => <CurrencyLogo symbol={option.value} size={16} />;
const networkMark = (option: PickerOption) => <NetworkLogo slug={option.value} size={16} />;

export function IntentBuilder({
  value,
  onChange,
  options,
  detectedEntity,
}: {
  value: IntentDraft;
  onChange: (next: IntentDraft) => void;
  options: IntentOptions;
  detectedEntity?: string;
}) {
  const set = <K extends keyof IntentDraft>(key: K, next: IntentDraft[K]) => onChange({ ...value, [key]: next });
  const inferredCurrency = value.destinationCountry ? options.currencyByCountry[value.destinationCountry] : undefined;
  const fundingUnit = value.sourceKind === "fiat" ? value.sourceCurrency || "source currency" : value.sourceAsset || "asset";

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-3">
        <FieldBlock label="Funding type" className="md:col-span-1">
          <Segmented
            label="Funding type"
            value={value.sourceKind}
            onChange={(next) => set("sourceKind", next)}
            options={[
              { value: "fiat", label: "Fiat" },
              { value: "asset", label: "Stablecoin" },
            ]}
          />
        </FieldBlock>
        <FieldBlock label="Sender">
          <Segmented
            label="Sender type"
            size="sm"
            value={value.sourceEntityType}
            onChange={(next) => set("sourceEntityType", next)}
            options={[
              { value: "business", label: "Business" },
              { value: "individual", label: "Individual" },
            ]}
          />
        </FieldBlock>
        <FieldBlock label="Recipient">
          <Segmented
            label="Recipient type"
            size="sm"
            value={value.beneficiaryType}
            onChange={(next) => set("beneficiaryType", next)}
            options={[
              { value: "business", label: "Business" },
              { value: "individual", label: "Individual" },
            ]}
          />
        </FieldBlock>
      </div>

      <div className="grid gap-5 rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] p-4 md:grid-cols-2 sm:p-5">
        <div className="flex flex-col gap-4">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-orange-deep)]">From</p>
          <SmartPicker
            label="Entity country"
            options={options.countries}
            value={value.sourceEntityCountry ? [value.sourceEntityCountry] : []}
            onChange={(next) => set("sourceEntityCountry", next[0] ?? "")}
            detected={detectedEntity}
            suggestionCount={5}
          />
          {value.sourceKind === "fiat" ? (
            <SmartPicker
              label="Source currency"
              options={options.currencies}
              value={value.sourceCurrency ? [value.sourceCurrency] : []}
              onChange={(next) => set("sourceCurrency", next[0] ?? "")}
              detected={options.currencyByCountry[value.sourceEntityCountry]}
              suggestionCount={5}
            />
          ) : (
            <>
              <SmartPicker
                label="Source asset"
                renderMark={assetMark}
                options={options.assets}
                value={value.sourceAsset ? [value.sourceAsset] : []}
                onChange={(next) => set("sourceAsset", next[0] ?? "")}
                suggestionCount={5}
              />
              <SmartPicker
                label="Source network"
                renderMark={networkMark}
                options={options.networks}
                value={value.sourceNetwork ? [value.sourceNetwork] : []}
                onChange={(next) => set("sourceNetwork", next[0] ?? "")}
                suggestionCount={5}
              />
            </>
          )}
        </div>
        <div className="flex flex-col gap-4 md:border-l md:border-[var(--color-line)] md:pl-5">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-orange-deep)]">To</p>
          <SmartPicker
            label="Destination country"
            options={options.countries}
            value={value.destinationCountry ? [value.destinationCountry] : []}
            onChange={(next) => {
              const country = next[0] ?? "";
              const currency = options.currencyByCountry[country];
              onChange({ ...value, destinationCountry: country, destinationCurrency: currency ?? value.destinationCurrency });
            }}
            suggestionCount={5}
          />
          <SmartPicker
            label="Destination currency"
            options={options.currencies}
            value={value.destinationCurrency ? [value.destinationCurrency] : []}
            onChange={(next) => set("destinationCurrency", next[0] ?? "")}
            detected={inferredCurrency}
            suggestionCount={5}
          />
        </div>
      </div>

      <div className="grid gap-2 md:max-w-md">
        <NumberWithPresets
          label="Amount"
          value={value.amount}
          onChange={(next) => set("amount", next)}
          presets={AMOUNT_PRESETS}
          suffix={fundingUnit}
          min={0.01}
        />
        <p className="border-l-2 border-[var(--color-orange)] pl-3 text-[11.5px] leading-relaxed text-[var(--color-muted)]">
          Amount is in {fundingUnit}. No currency conversion is applied to policy thresholds.
        </p>
      </div>
    </div>
  );
}
