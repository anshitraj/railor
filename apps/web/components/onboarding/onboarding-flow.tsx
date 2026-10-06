"use client";

import { useState, useTransition } from "react";
import { Banknote, Wallet, Landmark, Store, CreditCard, Vault, Coins, ArrowLeftRight, CircleHelp, ArrowDownToLine, ArrowUpFromLine, ShieldCheck, Building2 } from "lucide-react";
import { ChoiceGrid, SmartPicker, StepFlow, type Choice, type PickerOption } from "@railor/ui";
import { finishOnboarding, saveStep } from "../../app/welcome/actions";
import { CurrencyLogo } from "../marketing/currency-logo";

export interface OnboardingSeed {
  building?: string;
  entityCountry?: string;
  detectedCountry?: string;
  targetCountries: string[];
  settlementCurrencies: string[];
  interests: string[];
  assumptions?: string[];
  initialStep?: number;
  fromQuery?: string;
}

const BUILDING: Choice[] = [
  { value: "payments", label: "Payments", hint: "Move money for customers", icon: <Banknote size={20} aria-hidden /> },
  { value: "wallet", label: "Wallet", hint: "Balances and transfers", icon: <Wallet size={20} aria-hidden /> },
  { value: "neobank", label: "Neobank", hint: "Accounts and cards", icon: <Landmark size={20} aria-hidden /> },
  { value: "marketplace", label: "Marketplace", hint: "Pay sellers or vendors", icon: <Store size={20} aria-hidden /> },
  { value: "card_program", label: "Card program", hint: "Issue and fund cards", icon: <CreditCard size={20} aria-hidden /> },
  { value: "treasury", label: "Treasury", hint: "Manage company balances", icon: <Vault size={20} aria-hidden /> },
  { value: "stablecoin_infrastructure", label: "Stablecoin infrastructure", hint: "Build rails for others", icon: <Coins size={20} aria-hidden /> },
  { value: "remittances", label: "Remittances", hint: "Cross-border transfers", icon: <ArrowLeftRight size={20} aria-hidden /> },
  { value: "other", label: "Something else", hint: "Start exploring", icon: <CircleHelp size={20} aria-hidden /> },
];
const INTERESTS: Choice[] = [
  { value: "stablecoin_to_fiat", label: "Stablecoin → fiat", icon: <ArrowDownToLine size={20} aria-hidden /> },
  { value: "fiat_to_stablecoin", label: "Fiat → stablecoin", icon: <ArrowUpFromLine size={20} aria-hidden /> },
  { value: "cards", label: "Cards", icon: <CreditCard size={20} aria-hidden /> },
  { value: "bank_payouts", label: "Bank payouts", icon: <Landmark size={20} aria-hidden /> },
  { value: "collections", label: "Collections", icon: <Banknote size={20} aria-hidden /> },
  { value: "virtual_accounts", label: "Virtual accounts", icon: <Building2 size={20} aria-hidden /> },
  { value: "kyc_kyb", label: "KYC / KYB", icon: <ShieldCheck size={20} aria-hidden /> },
  { value: "treasury", label: "Treasury", icon: <Vault size={20} aria-hidden /> },
  { value: "wallet_infrastructure", label: "Wallet infrastructure", icon: <Wallet size={20} aria-hidden /> },
];
const QUESTIONS = [
  ["What are you building?", "Choose the closest fit. You can change this later."],
  ["Where is your company based?", "This helps us find providers that can work with your business."],
  ["Where does money need to go?", "Choose the markets you want to reach."],
  ["Which currencies do you use?", "Choose how you want money to arrive."],
  ["What would you like to explore?", "Select the tools that matter to you."],
] as const;
const SKIPPED = [
  "Product type not specified — Railor assumed general payments.",
  "Company country not specified — Railor used US for suggested routes. Confirm your company country.",
  "Target markets not specified — Railor suggested the United Arab Emirates.",
  "Settlement currencies not specified — no currency filter was applied to suggested routes.",
  "Infrastructure focus not specified — Railor assumed bank payouts.",
];

export function OnboardingFlow({ seed, countries, currencies }: { seed: OnboardingSeed; countries: PickerOption[]; currencies: PickerOption[] }) {
  const [step, setStep] = useState(Math.max(0, Math.min(4, seed.initialStep ?? 0)));
  const [building, setBuilding] = useState<string[]>(seed.building ? [seed.building] : []);
  const [entityCountry, setEntityCountry] = useState<string[]>(seed.entityCountry ? [seed.entityCountry] : seed.detectedCountry ? [seed.detectedCountry] : []);
  const [targets, setTargets] = useState(seed.targetCountries);
  const [settlement, setSettlement] = useState(seed.settlementCurrencies);
  const [interests, setInterests] = useState(seed.interests);
  const [assumptions, setAssumptions] = useState(seed.assumptions ?? []);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const selections = [building, entityCountry, targets, settlement, interests];
  const answers = () => ({ building: building[0], entityCountry: entityCountry[0], targetCountries: targets, settlementCurrencies: settlement, interests, assumptions });

  const advance = (skip = false) => {
    if (pending) return;
    setError("");
    const skippedAnswer = SKIPPED[step]!;
    const nextAssumptions = [...new Set([...assumptions.filter((item) => item !== skippedAnswer), ...(skip ? [skippedAnswer] : [])])];
    const nextAnswers = { ...answers(), assumptions: nextAssumptions };
    if (skip) {
      // A skipped answer must not remain populated from a previous visit.
      if (step === 0) nextAnswers.building = undefined;
      if (step === 1) nextAnswers.entityCountry = undefined;
      if (step === 2) nextAnswers.targetCountries = [];
      if (step === 3) nextAnswers.settlementCurrencies = [];
      if (step === 4) nextAnswers.interests = ["bank_payouts"];
    }
    startTransition(async () => {
      try {
        if (step === 4) await finishOnboarding(nextAnswers);
        else {
          const result = await saveStep(step + 1, nextAnswers);
          if (!result.ok) throw new Error("Workspace unavailable");
          if (skip) {
            if (step === 0) setBuilding([]);
            if (step === 1) setEntityCountry([]);
            if (step === 2) setTargets([]);
            if (step === 3) setSettlement([]);
          }
          setAssumptions(nextAssumptions);
          setStep(step + 1);
        }
      } catch { setError("We couldn’t save your answers. Please try again."); }
    });
  };

  const question = QUESTIONS[step]!;
  return <StepFlow className="onboarding-screen" step={step} total={5} title={question[0]} subtitle={question[1]}
    onBack={step > 0 && !pending ? () => { setError(""); setStep(step - 1); } : undefined}
    onNext={() => advance()} onSkip={!pending ? () => advance(true) : undefined}
    nextLabel={pending ? (step === 4 ? "Opening workspace…" : "Saving…") : step === 4 ? "Open my workspace" : "Continue"}
    nextDisabled={pending || !selections[step]!.length} skipLabel="Decide later"
    footnote={step === 0 && seed.fromQuery ? <>Pre-filled from your search: “{seed.fromQuery}”.</> : null}>
    <fieldset disabled={pending} className="min-w-0">
      {step === 0 ? <ChoiceGrid className="onboarding-choices" options={BUILDING} value={building} onChange={setBuilding} columns={3} name="What are you building" /> : null}
      {step === 1 ? <SmartPicker label="Company country" options={countries} value={entityCountry} onChange={setEntityCountry} detected={seed.detectedCountry} placeholder="Search countries" /> : null}
      {step === 2 ? <SmartPicker label="Target markets" options={countries} value={targets} onChange={setTargets} multiple placeholder="Add a market" /> : null}
      {step === 3 ? <SmartPicker label="Settlement currencies" options={currencies} value={settlement} onChange={setSettlement} multiple placeholder="Add a currency" renderMark={(option) => <CurrencyLogo symbol={option.value} size={20} />} /> : null}
      {step === 4 ? <ChoiceGrid className="onboarding-choices" options={INTERESTS} value={interests} onChange={setInterests} multiple columns={3} name="Which infrastructure matters" /> : null}
    </fieldset>
    {error ? <p role="alert" className="text-sm text-[var(--color-bad)]">{error}</p> : null}
    {step === 4 && assumptions.length ? <details className="rounded-xl border border-[var(--color-line)] p-4 text-xs text-[var(--color-muted)]"><summary className="cursor-pointer">Review skipped answers ({assumptions.length})</summary><ul className="mt-3 space-y-2">{assumptions.map((item) => <li key={item}>{item}</li>)}</ul></details> : null}
  </StepFlow>;
}
