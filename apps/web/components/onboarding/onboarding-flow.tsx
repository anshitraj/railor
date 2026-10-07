"use client";

import { useState, useTransition } from "react";
import { Banknote, Wallet, Landmark, Store, CreditCard, Vault, Coins, ArrowLeftRight, CircleHelp, ArrowDownToLine, ArrowUpFromLine, ShieldCheck, Building2, BriefcaseBusiness, UserRound, Check } from "lucide-react";
import { ChoiceGrid, SmartPicker, StepFlow, Flag, type Choice, type PickerOption } from "@railor/ui";
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
  returnTo?: string;
}

const PROFILES: Choice[] = [
  { value: "business", label: "Business", hint: "Explore providers for your company or product", icon: <Building2 size={22} aria-hidden /> },
  { value: "freelancer", label: "Freelancer", hint: "Get paid by clients across borders", icon: <BriefcaseBusiness size={22} aria-hidden /> },
  { value: "personal", label: "Personal", hint: "Compare options for your own transfers", icon: <UserRound size={22} aria-hidden /> },
];
const FREELANCER_TYPES: Choice[] = [
  { value: "freelancer", label: "Independent freelancer", hint: "Explore options available to individuals" },
  { value: "freelancer_business", label: "Registered business", hint: "Explore options available to businesses" },
];

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
  ["How will you use Railor?", "Let’s find the right providers for you. Choose the closest fit."],
  ["Where is your company based?", "This helps us find providers that can work with your business."],
  ["Where does money need to go?", "Choose the markets you want to reach."],
  ["Which currencies do you use?", "Choose how you want money to arrive."],
  ["What would you like to explore?", "Select the tools that matter to you."],
] as const;
const SKIPPED = [
  "Account use not specified — Railor assumed general business payments. Confirm your customer type.",
  "Home country not specified — Railor used US for suggested routes. Confirm your country.",
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
  const selectedBuilding = building[0];
  const profile = selectedBuilding === "personal" ? "personal" : selectedBuilding?.startsWith("freelancer") ? "freelancer" : selectedBuilding ? "business" : undefined;
  const isBusiness = Boolean(selectedBuilding && selectedBuilding !== "personal" && selectedBuilding !== "freelancer");
  const quickCountries = countries.filter((item) => [seed.detectedCountry, "IN", "US", "GB", "AE", "SG", "DE"].includes(item.value));
  const quickCurrencies = currencies.filter((item) => ["USD", "EUR", "GBP", "INR", "AED", "SGD"].includes(item.value));
  const choices = (items: PickerOption[]): Choice[] => items.map((item) => ({ value: item.value, label: item.label, hint: item.value, icon: <Flag code={item.value} size={20} /> }));
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
        if (step === 4) await finishOnboarding(nextAnswers, seed.returnTo);
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
      } catch (cause) {
        // Next.js server-action redirects are successful control flow.
        if (cause && typeof cause === "object" && "digest" in cause && String(cause.digest).startsWith("NEXT_REDIRECT")) throw cause;
        setError("We couldn’t save your answers. Please try again.");
      }
    });
  };

  const question = step === 1 && !isBusiness
    ? ["Where are you based?", "Your home country helps us check which providers are available to you."]
    : QUESTIONS[step]!;
  const labelFor = (options: PickerOption[], values: string[]) => values.map((value) => options.find((item) => item.value === value)?.label ?? value).join(", ") || "Decide later";
  const review = [
    { label: "Using Railor for", value: selectedBuilding === "freelancer_business" ? "Freelancer · registered business" : selectedBuilding === "freelancer" ? "Freelancer · independent" : profile === "business" ? `Business · ${BUILDING.find((item) => item.value === selectedBuilding)?.label ?? "Payments"}` : PROFILES.find((item) => item.value === profile)?.label ?? "Decide later", step: 0 },
    { label: isBusiness ? "Company country" : "Home country", value: labelFor(countries, entityCountry), step: 1 },
    { label: "Destination markets", value: labelFor(countries, targets), step: 2 },
    { label: "Currencies", value: labelFor(currencies, settlement), step: 3 },
  ];
  return <StepFlow className="onboarding-screen" step={step} total={5} title={question[0]} subtitle={question[1]}
    onBack={step > 0 && !pending ? () => { setError(""); setStep(step - 1); } : undefined}
    onNext={() => advance()} onSkip={!pending ? () => advance(true) : undefined}
    nextLabel={pending ? (step === 4 ? "Opening workspace…" : "Saving…") : step === 4 ? "Open my workspace" : "Continue"}
    nextDisabled={pending || !selections[step]!.length} skipLabel="Decide later"
    footnote={step === 0 && seed.fromQuery ? <>Pre-filled from your search: “{seed.fromQuery}”.</> : <>Your answers save as you continue. You can change them later.</>}>
    <fieldset disabled={pending} className="min-w-0">
      {step === 0 ? <div className="space-y-6">
        <ChoiceGrid className="onboarding-choices onboarding-profiles" options={PROFILES} value={profile ? [profile] : []} onChange={([value]) => setBuilding([value === "business" ? "payments" : value!])} columns={3} name="How will you use Railor" />
        {profile === "business" ? <div className="railor-step-in space-y-3"><h2 className="text-sm font-semibold">What are you building or managing?</h2><ChoiceGrid className="onboarding-choices" options={BUILDING} value={building} onChange={setBuilding} columns={3} name="Business purpose" /></div> : null}
        {profile === "freelancer" ? <div className="railor-step-in space-y-3"><h2 className="text-sm font-semibold">How do you work with clients?</h2><ChoiceGrid className="onboarding-choices" options={FREELANCER_TYPES} value={building} onChange={setBuilding} columns={2} name="Freelancer customer type" /></div> : null}
        <p className="text-xs leading-relaxed text-[var(--color-muted)]">This sets up your comparisons and workspace. Each provider has its own account verification process.</p>
      </div> : null}
      {step === 1 ? <div className="space-y-5"><ChoiceGrid className="onboarding-choices onboarding-quick" options={choices(quickCountries)} value={entityCountry} onChange={setEntityCountry} name="Common home countries" /><SmartPicker suggestionCount={0} label={isBusiness ? "Company country" : "Home country"} options={countries} value={entityCountry} onChange={setEntityCountry} detected={seed.detectedCountry} placeholder="Search all countries" /></div> : null}
      {step === 2 ? <div className="space-y-5"><ChoiceGrid className="onboarding-choices onboarding-quick" options={choices(quickCountries)} value={targets} onChange={setTargets} multiple name="Common destination markets" /><SmartPicker suggestionCount={0} label="Target markets" options={countries} value={targets} onChange={setTargets} multiple placeholder="Search all markets" /></div> : null}
      {step === 3 ? <div className="space-y-5"><ChoiceGrid className="onboarding-choices onboarding-quick" options={choices(quickCurrencies).map((item) => ({ ...item, icon: <CurrencyLogo symbol={item.value} size={20} /> }))} value={settlement} onChange={setSettlement} multiple name="Common settlement currencies" /><SmartPicker suggestionCount={0} label="Settlement currencies" options={currencies} value={settlement} onChange={setSettlement} multiple placeholder="Search all currencies" renderMark={(option) => <CurrencyLogo symbol={option.value} size={20} />} /></div> : null}
      {step === 4 ? <ChoiceGrid className="onboarding-choices onboarding-interests" options={INTERESTS} value={interests} onChange={setInterests} multiple columns={3} name="Which infrastructure matters" /> : null}
    </fieldset>
    {error ? <p role="alert" className="text-sm text-[var(--color-bad)]">{error}</p> : null}
    {step === 4 ? <section className="onboarding-review" aria-label="Review your answers"><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Check size={16} aria-hidden />Your workspace, at a glance</div><dl>{review.map((item) => <div key={item.label} className="onboarding-review-row"><div><dt className="text-xs text-[var(--color-muted)]">{item.label}</dt><dd className="mt-1 text-sm">{item.value}</dd></div><button type="button" disabled={pending} className="text-xs font-medium text-[var(--color-purple)]" aria-label={`Edit ${item.label.toLowerCase()}`} onClick={() => setStep(item.step)}>Edit</button></div>)}</dl></section> : null}
    {step === 4 && assumptions.length ? <details className="rounded-xl border border-[var(--color-line)] p-4 text-xs text-[var(--color-muted)]"><summary className="cursor-pointer">Review skipped answers ({assumptions.length})</summary><ul className="mt-3 space-y-2">{assumptions.map((item) => <li key={item}>{item}</li>)}</ul></details> : null}
  </StepFlow>;
}
