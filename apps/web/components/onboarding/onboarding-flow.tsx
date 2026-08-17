"use client";

import { useState, useTransition } from "react";
import { motion } from "motion/react";
import {
  ChoiceGrid,
  PasteToStructure,
  SmartPicker,
  StepFlow,
  type Choice,
  type PickerOption,
} from "@railor/ui";
import { finishOnboarding, saveStep } from "../../app/welcome/actions";

export interface OnboardingSeed {
  building?: string;
  entityCountry?: string;
  detectedCountry?: string;
  targetCountries: string[];
  settlementCurrencies: string[];
  interests: string[];
  fromQuery?: string;
}

const BUILDING: Choice[] = [
  { value: "payments", label: "Payments", hint: "Moving money for customers", icon: "→" },
  { value: "wallet", label: "Wallet", hint: "Balances and transfers", icon: "◎" },
  { value: "neobank", label: "Neobank", hint: "Accounts and cards", icon: "▤" },
  { value: "marketplace", label: "Marketplace", hint: "Paying sellers or vendors", icon: "⇄" },
  { value: "card_program", label: "Card program", hint: "Issuing and funding cards", icon: "▭" },
  { value: "treasury", label: "Treasury", hint: "Managing corporate balances", icon: "≡" },
  { value: "stablecoin_infrastructure", label: "Stablecoin infrastructure", hint: "Rails for others", icon: "◈" },
  { value: "remittances", label: "Remittances", hint: "Consumer cross-border", icon: "↔" },
  { value: "other", label: "Something else", hint: "Tell us later", icon: "•" },
];

const INTERESTS: Choice[] = [
  { value: "stablecoin_to_fiat", label: "Stablecoin → fiat", hint: "Off-ramp and payouts" },
  { value: "fiat_to_stablecoin", label: "Fiat → stablecoin", hint: "On-ramp and funding" },
  { value: "cards", label: "Cards", hint: "Issuing and spend" },
  { value: "bank_payouts", label: "Bank payouts", hint: "Local and SWIFT rails" },
  { value: "collections", label: "Collections", hint: "Getting paid locally" },
  { value: "virtual_accounts", label: "Virtual accounts", hint: "Named IBANs and equivalents" },
  { value: "kyc_kyb", label: "KYC / KYB", hint: "Verification requirements" },
  { value: "treasury", label: "Treasury", hint: "Balance and FX management" },
  { value: "wallet_infrastructure", label: "Wallet infrastructure", hint: "Custody and transfers" },
];

/**
 * Three questions, zero keystrokes required.
 *
 * Every step is answerable with a pointer, every step autosaves, every skip is
 * recorded as a visible assumption rather than a silent default, and anything
 * the visitor already told us in the public search arrives pre-filled.
 */
export function OnboardingFlow({
  seed,
  countries,
  currencies,
}: {
  seed: OnboardingSeed;
  countries: PickerOption[];
  currencies: PickerOption[];
}) {
  const [step, setStep] = useState(0);
  const [building, setBuilding] = useState<string[]>(seed.building ? [seed.building] : []);
  const [entityCountry, setEntityCountry] = useState<string[]>(
    seed.entityCountry ? [seed.entityCountry] : seed.detectedCountry ? [seed.detectedCountry] : [],
  );
  const [targets, setTargets] = useState<string[]>(seed.targetCountries);
  const [settlement, setSettlement] = useState<string[]>(seed.settlementCurrencies);
  const [interests, setInterests] = useState<string[]>(seed.interests);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const answers = () => ({
    building: building[0] === "__unsure__" ? undefined : building[0],
    entityCountry: entityCountry[0],
    targetCountries: targets,
    settlementCurrencies: settlement,
    interests: interests.filter((i) => i !== "__unsure__"),
    assumptions,
  });

  const advance = (next: number, assumption?: string) => {
    const nextAssumptions = assumption ? [...assumptions, assumption] : assumptions;
    if (assumption) setAssumptions(nextAssumptions);
    startTransition(async () => {
      await saveStep(next, { ...answers(), assumptions: nextAssumptions });
      setStep(next);
    });
  };

  const finish = () => {
    startTransition(async () => {
      await finishOnboarding(answers());
    });
  };

  if (step === 0) {
    return (
      <StepFlow
        step={0}
        total={3}
        title="What are you building?"
        subtitle="This decides which products, corridors and requirements Railor puts in front of you first. One tap is enough."
        onNext={() => advance(1)}
        onSkip={() => advance(1, "Product type not specified — Railor assumed general payments.")}
        nextDisabled={!building.length || pending}
        footnote={
          seed.fromQuery ? (
            <>Pre-filled from your search: “{seed.fromQuery}”. Change anything.</>
          ) : null
        }
      >
        <ChoiceGrid options={BUILDING} value={building} onChange={setBuilding} columns={3} name="What are you building" />
      </StepFlow>
    );
  }

  if (step === 1) {
    return (
      <StepFlow
        step={1}
        total={3}
        title="Where do you operate?"
        subtitle="Entity jurisdiction decides who can onboard you. Target markets decide where value has to land."
        onBack={() => setStep(0)}
        onNext={() => advance(2)}
        onSkip={() =>
          advance(2, "Markets not specified — Railor used the most common corridor in the dataset.")
        }
        nextDisabled={pending}
      >
        <div className="flex flex-col gap-6 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white p-5">
          <SmartPicker
            label="Company jurisdiction"
            options={countries}
            value={entityCountry}
            onChange={setEntityCountry}
            detected={seed.detectedCountry}
            placeholder="Search countries"
          />
          <SmartPicker
            label="Target customer countries"
            options={countries}
            value={targets}
            onChange={setTargets}
            multiple
            placeholder="Add a market"
          />
          <SmartPicker
            label="Primary settlement currencies"
            options={currencies}
            value={settlement}
            onChange={setSettlement}
            multiple
            placeholder="Add a currency"
          />
          <PasteToStructure
            compact
            placeholder="Or paste a list — “IN, AE, SG” or a spreadsheet column"
            hint="Railor turns pasted text into chips you can edit before anything is applied."
            parse={(input) => {
              const parts = input
                .split(/[,\n\t;]+/)
                .map((p) => p.trim().toLowerCase())
                .filter(Boolean);
              const matchedCountries = countries.filter(
                (c) => parts.includes(c.value.toLowerCase()) || parts.includes(c.label.toLowerCase()),
              );
              const matchedCurrencies = currencies.filter((c) =>
                parts.includes(c.value.toLowerCase()),
              );
              return [
                ...matchedCountries.map((c) => ({
                  field: "targetCountries",
                  value: c.value,
                  label: `${c.emoji ?? ""} ${c.label}`.trim(),
                })),
                ...matchedCurrencies.map((c) => ({
                  field: "settlementCurrencies",
                  value: c.value,
                  label: c.value,
                })),
              ];
            }}
            onConfirm={(items) => {
              setTargets([
                ...new Set([
                  ...targets,
                  ...items.filter((i) => i.field === "targetCountries").map((i) => i.value),
                ]),
              ]);
              setSettlement([
                ...new Set([
                  ...settlement,
                  ...items.filter((i) => i.field === "settlementCurrencies").map((i) => i.value),
                ]),
              ]);
            }}
          />
        </div>
      </StepFlow>
    );
  }

  return (
    <StepFlow
      step={2}
      total={3}
      title="Which infrastructure matters?"
      subtitle="Pick everything that applies. Railor uses this to build your first corridors and decide what to monitor."
      onBack={() => setStep(1)}
      onNext={finish}
      nextLabel={pending ? "Building…" : "Build my infrastructure map"}
      nextDisabled={pending}
      onSkip={() =>
        startTransition(async () => {
          await finishOnboarding({
            ...answers(),
            interests: ["bank_payouts"],
            assumptions: [...assumptions, "Infrastructure focus not specified — Railor assumed bank payouts."],
          });
        })
      }
    >
      <ChoiceGrid
        options={INTERESTS}
        value={interests}
        onChange={setInterests}
        multiple
        columns={3}
        name="Which infrastructure matters"
      />
      {assumptions.length ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-warn-bg)]/60 p-3"
        >
          <p className="text-[11px] uppercase tracking-wide text-[var(--color-warn)]">
            Assumptions Railor recorded
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {assumptions.map((a) => (
              <li key={a} className="text-[12.5px] text-[var(--color-ink-soft)]">
                • {a}
              </li>
            ))}
          </ul>
        </motion.div>
      ) : null}
    </StepFlow>
  );
}
