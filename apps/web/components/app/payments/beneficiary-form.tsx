"use client";

import { useMemo, useState, useTransition } from "react";
import { Button, SmartPicker, type PickerOption } from "@railor/ui";
import { createBeneficiaryAction } from "../../../app/app/payments/actions";
import { FieldBlock, Segmented } from "../form-kit";

type Method = "bank_us" | "iban" | "gb" | "clabe" | "pix" | "in_bank" | "crypto_address";

const IBAN_COUNTRIES = new Set(["AE", "DE", "FR", "ES", "IT", "NL", "BE", "PT", "IE", "AT", "FI", "SE", "DK", "PL", "CH", "NO", "SA", "QA", "BH", "KW", "TR", "IL", "EG", "PK", "GB"]);
const STABLECOINS = new Set(["USDC", "USDT", "EURC", "PYUSD"]);
const NETWORKS = ["base", "ethereum", "polygon", "solana", "arbitrum", "optimism", "avalanche", "tron", "stellar"];

const METHOD_LABEL: Record<Method, string> = {
  bank_us: "US bank (ACH/wire)",
  iban: "IBAN",
  gb: "UK sort code",
  clabe: "CLABE (SPEI)",
  pix: "Pix",
  in_bank: "Indian bank (IFSC)",
  crypto_address: "Wallet address",
};

/** Which methods make sense for a country + currency — offered as clicks, never a free-typed type field. */
export function methodsFor(country: string, currency: string): Method[] {
  if (STABLECOINS.has(currency)) return ["crypto_address"];
  const out: Method[] = [];
  if (country === "US") out.push("bank_us");
  if (country === "GB") out.push("gb");
  if (IBAN_COUNTRIES.has(country)) out.push("iban");
  if (country === "MX") out.push("clabe");
  if (country === "BR") out.push("pix");
  if (country === "IN") out.push("in_bank");
  return out.length ? out : ["iban"];
}

const FIELDS: Record<Method, Array<{ key: string; label: string; placeholder?: string; inputMode?: "numeric" | "text" }>> = {
  bank_us: [
    { key: "routingNumber", label: "Routing number (ABA)", placeholder: "9 digits", inputMode: "numeric" },
    { key: "accountNumber", label: "Account number", inputMode: "numeric" },
    // Some providers (Wise, Airwallex) require the holder's address for USD payouts.
    { key: "addressLine1", label: "Street address (optional)" },
    { key: "city", label: "City (optional)" },
    { key: "state", label: "State (optional)", placeholder: "NY" },
    { key: "postalCode", label: "ZIP code (optional)", inputMode: "numeric" },
  ],
  iban: [
    { key: "iban", label: "IBAN", placeholder: "AE07 0331 2345 6789 0123 456" },
    { key: "bic", label: "BIC / SWIFT (optional)" },
  ],
  gb: [
    { key: "sortCode", label: "Sort code", placeholder: "12-34-56", inputMode: "numeric" },
    { key: "accountNumber", label: "Account number", placeholder: "8 digits", inputMode: "numeric" },
  ],
  clabe: [{ key: "clabe", label: "CLABE", placeholder: "18 digits", inputMode: "numeric" }],
  pix: [
    { key: "pixKey", label: "Pix key" },
    { key: "documentNumber", label: "CPF / CNPJ" },
  ],
  in_bank: [
    { key: "ifsc", label: "IFSC", placeholder: "HDFC0001234" },
    { key: "accountNumber", label: "Account number", placeholder: "9–18 digits", inputMode: "numeric" },
  ],
  crypto_address: [{ key: "address", label: "Wallet address", placeholder: "0x…" }],
};

export interface BeneficiarySummary {
  id: string;
  label: string;
  holderName: string;
  country: string;
  currency: string;
  method: string;
  displayHint: string;
}

export function BeneficiaryForm({
  countries,
  currencies,
  initialCountry = "",
  initialCurrency = "",
  lockDestination = false,
  onCreated,
}: {
  countries: PickerOption[];
  currencies: PickerOption[];
  initialCountry?: string;
  initialCurrency?: string;
  lockDestination?: boolean;
  onCreated?: (b: BeneficiarySummary) => void;
}) {
  const [country, setCountry] = useState(initialCountry);
  const [currency, setCurrency] = useState(initialCurrency);
  const [holderType, setHolderType] = useState<"business" | "individual">("business");
  const [holderName, setHolderName] = useState("");
  const methods = useMemo(() => methodsFor(country, currency), [country, currency]);
  const [method, setMethod] = useState<Method>(methods[0]!);
  const [network, setNetwork] = useState("base");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const activeMethod = methods.includes(method) ? method : methods[0]!;

  const submit = () =>
    start(async () => {
      setError("");
      setFields({});
      const result = await createBeneficiaryAction({
        holderType,
        holderName,
        country,
        currency,
        method: activeMethod,
        network: activeMethod === "crypto_address" ? network : undefined,
        details,
      });
      if (!result.ok) {
        setError(result.error);
        setFields(result.fields ?? {});
        return;
      }
      const data = result.data as { beneficiary: BeneficiarySummary; created: boolean } | undefined;
      if (data) {
        onCreated?.(data.beneficiary);
        setDetails({});
        setHolderName("");
      }
    });

  return (
    <div className="flex flex-col gap-4">
      {!lockDestination ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SmartPicker label="Country" options={countries} value={country ? [country] : []} onChange={(v) => setCountry(v[0] ?? "")} suggestionCount={5} />
          <SmartPicker label="Currency" options={currencies} value={currency ? [currency] : []} onChange={(v) => setCurrency(v[0] ?? "")} suggestionCount={5} />
        </div>
      ) : (
        <p className="text-[12.5px] text-[var(--color-muted)]">
          Receives <strong className="text-[var(--color-ink)]">{currency}</strong> in <strong className="text-[var(--color-ink)]">{country}</strong>.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <FieldBlock label="Holder">
          <Segmented label="Holder type" size="sm" value={holderType} onChange={setHolderType} options={[{ value: "business", label: "Business" }, { value: "individual", label: "Individual" }]} />
        </FieldBlock>
        <FieldBlock label="Receives by">
          <Segmented label="Payment method" size="sm" value={activeMethod} onChange={(v) => setMethod(v)} options={methods.map((m) => ({ value: m, label: METHOD_LABEL[m] }))} />
        </FieldBlock>
      </div>
      <label className="flex flex-col gap-1 text-[12px] font-bold text-[var(--color-ink-soft)]">
        {holderType === "business" ? "Registered business name" : "Full legal name"}
        <input value={holderName} onChange={(e) => setHolderName(e.target.value)} className="product-field !mt-0 font-normal" autoComplete="off" />
        {fields.holderName ? <span className="text-[11.5px] font-normal text-[var(--color-bad)]">{fields.holderName}</span> : null}
      </label>
      {activeMethod === "crypto_address" ? (
        <FieldBlock label="Network">
          <div className="flex flex-wrap gap-1.5">
            {NETWORKS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={network === n}
                onClick={() => setNetwork(n)}
                className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold capitalize transition ${network === n ? "border-[var(--color-orange)] bg-[var(--color-lavender)] text-[var(--color-orange-deep)]" : "border-[var(--color-line)] hover:border-[var(--color-line-strong)]"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </FieldBlock>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {FIELDS[activeMethod].map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-[12px] font-bold text-[var(--color-ink-soft)]">
            {f.label}
            <input
              value={details[f.key] ?? ""}
              onChange={(e) => setDetails((d) => ({ ...d, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              inputMode={f.inputMode}
              autoComplete="off"
              spellCheck={false}
              className="product-field !mt-0 font-mono font-normal"
            />
            {fields[`details.${f.key}`] ? <span className="text-[11.5px] font-normal text-[var(--color-bad)]">{fields[`details.${f.key}`]}</span> : null}
          </label>
        ))}
        {activeMethod !== "crypto_address" ? (
          <label className="flex flex-col gap-1 text-[12px] font-bold text-[var(--color-ink-soft)]">
            Bank name
            <input value={details.bankName ?? ""} onChange={(e) => setDetails((d) => ({ ...d, bankName: e.target.value }))} className="product-field !mt-0 font-normal" />
          </label>
        ) : null}
      </div>
      <p className="text-[11.5px] leading-relaxed text-[var(--color-muted)]">
        Account details are checked (checksums, formats), encrypted at rest, and only decrypted inside a provider call. Railor shows a masked hint afterwards.
      </p>
      {error ? <p role="alert" className="text-[12.5px] text-[var(--color-bad)]">{error}</p> : null}
      <div>
        <Button size="sm" disabled={pending || !country || !currency || holderName.trim().length < 2} onClick={submit}>
          {pending ? "Saving…" : "Save beneficiary"}
        </Button>
      </div>
    </div>
  );
}
