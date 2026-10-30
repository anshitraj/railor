"use client";

import { useEffect, useState, useTransition } from "react";
import { Banknote, Wallet, Landmark, Store, CreditCard, Vault, Coins, ArrowLeftRight, CircleHelp, ArrowDownToLine, ArrowUpFromLine, ShieldCheck, Building2, BriefcaseBusiness, UserRound, Check, ChevronRight, Code2 } from "lucide-react";
import { ChoiceGrid, SmartPicker, StepFlow, Flag, type Choice, type PickerOption } from "@railor/ui";
import { completeOnboarding, saveStep } from "../../app/welcome/actions";
import { CurrencyLogo } from "../marketing/currency-logo";
import { OnboardingComplete, OnboardingVisual } from "./onboarding-feedback";
import styles from "./onboarding.module.css";

export interface OnboardingSeed {
  workspaceId?: string;
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
] as const;
const SKIPPED = [
  "Account use not specified — Railor assumed general business payments. Confirm your customer type.",
  "Home country not specified — Railor used US for suggested routes. Confirm your country.",
  "Target markets not specified — Railor suggested the United Arab Emirates.",
];

export function OnboardingFlow({ seed, countries, currencies }: { seed: OnboardingSeed; countries: PickerOption[]; currencies: PickerOption[] }) {
  const [step, setStep] = useState(Math.max(0, Math.min(2, seed.initialStep ?? 0)));
  const [building, setBuilding] = useState<string[]>(seed.building ? [seed.building] : []);
  const [entityCountry, setEntityCountry] = useState<string[]>(seed.entityCountry ? [seed.entityCountry] : seed.detectedCountry ? [seed.detectedCountry] : []);
  const [targets, setTargets] = useState(seed.targetCountries);
  const [settlement, setSettlement] = useState(seed.settlementCurrencies);
  const [interests, setInterests] = useState(seed.interests);
  const [assumptions, setAssumptions] = useState(seed.assumptions ?? []);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [setupApi, setSetupApi] = useState(seed.returnTo === "/app/developers");
  const [completed, setCompleted] = useState<{ destination: string; markets: string[] } | null>(null);
  const apiPreferenceKey = seed.workspaceId ? `railor:onboarding:${seed.workspaceId}:api` : null;
  useEffect(() => {
    if (!apiPreferenceKey) return;
    try {
      const saved = sessionStorage.getItem(apiPreferenceKey);
      if (saved !== null) setSetupApi(saved === "true");
    } catch { /* Storage can be disabled; in-memory setup still works. */ }
  }, [apiPreferenceKey]);
  const toggleApi = () => {
    const next = !setupApi;
    setSetupApi(next);
    if (apiPreferenceKey) try { sessionStorage.setItem(apiPreferenceKey, String(next)); } catch { /* Optional preference only. */ }
  };
  const selectedBuilding = building[0];
  const profile = selectedBuilding === "personal" ? "personal" : selectedBuilding?.startsWith("freelancer") ? "freelancer" : selectedBuilding ? "business" : undefined;
  const isBusiness = Boolean(selectedBuilding && selectedBuilding !== "personal" && selectedBuilding !== "freelancer");
  const quickCountries = countries.filter((item) => [seed.detectedCountry, "IN", "US", "GB", "AE", "SG", "DE"].includes(item.value));
  const choices = (items: PickerOption[]): Choice[] => items.map((item) => ({ value: item.value, label: item.label, hint: item.value, icon: <Flag code={item.value} size={20} /> }));
  const selections = [building, entityCountry, targets];
  const answers = () => ({ building: building[0], entityCountry: entityCountry[0], targetCountries: targets, settlementCurrencies: settlement, interests: interests.length ? interests : ["bank_payouts"], assumptions });

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
    }
    startTransition(async () => {
      try {
        if (step === 2) {
          const result = await completeOnboarding(nextAnswers, setupApi && (!seed.returnTo || seed.returnTo === "/app") ? "/app/developers" : seed.returnTo);
          if (apiPreferenceKey) try { sessionStorage.removeItem(apiPreferenceKey); } catch { /* Optional preference only. */ }
          setCompleted({ destination: result.destination, markets: nextAnswers.targetCountries });
        }
        else {
          const result = await saveStep(step + 1, nextAnswers);
          if (!result.ok) throw new Error("Workspace unavailable");
          if (skip) {
            if (step === 0) setBuilding([]);
            if (step === 1) setEntityCountry([]);
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
  if (completed) return <OnboardingComplete {...completed} />;
  return <section className={styles.shell} aria-label="Personalize your workspace">
    <OnboardingVisual step={step} country={entityCountry[0]} targets={targets} />
    <div className={styles.stepNames} aria-hidden="true">{["About you", "Your country", "Your markets"].map((label, index) => <span key={label} data-active={step === index}><i>{index < step ? <Check size={11} /> : index + 1}</i>{label}{index < 2 && <ChevronRight size={11} />}</span>)}</div>
    <StepFlow className={`onboarding-screen ${styles.flow}`} step={step} total={3} title={question[0]} subtitle={question[1]}
    onBack={step > 0 && !pending ? () => { setError(""); setStep(step - 1); } : undefined}
    onNext={() => advance()} onSkip={!pending ? () => advance(true) : undefined}
    nextLabel={pending ? (step === 2 ? "Preparing your workspace…" : "Saving…") : step === 2 ? "Finish setup" : "Continue"}
    nextDisabled={pending || !selections[step]!.length} skipLabel="Decide later"
    footnote={step === 0 && seed.fromQuery ? <>Pre-filled from your search: “{seed.fromQuery}”.</> : <>Your answers save as you continue. You can change them later.</>}>
    <fieldset disabled={pending} className="min-w-0">
      {step === 0 ? <div className="space-y-6">
        <ChoiceGrid className="onboarding-choices onboarding-profiles" options={PROFILES} value={profile ? [profile] : []} onChange={([value]) => setBuilding([value === "business" ? "payments" : value!])} columns={3} name="How will you use Railor" />
        {profile === "business" ? <details className="rounded-xl border border-[var(--color-line)] p-4 text-sm"><summary className="cursor-pointer">Business purpose · optional</summary><div className="railor-step-in mt-4 space-y-3"><h2 className="text-sm font-semibold">What are you building or managing?</h2><ChoiceGrid className="onboarding-choices" options={BUILDING} value={building} onChange={setBuilding} columns={3} name="Business purpose" /></div></details> : null}
        {profile === "freelancer" ? <div className="railor-step-in space-y-3"><h2 className="text-sm font-semibold">How do you work with clients?</h2><ChoiceGrid className="onboarding-choices" options={FREELANCER_TYPES} value={building} onChange={setBuilding} columns={2} name="Freelancer customer type" /></div> : null}
        <button type="button" role="checkbox" aria-checked={setupApi} onClick={toggleApi} className={styles.apiChoice}><Code2 size={21} aria-hidden /><span><strong>Set up the API or an AI agent</strong><small>Compare and explore routes from your own tools.</small></span><i aria-hidden>{setupApi && <Check size={12} />}</i></button>
      </div> : null}
      {step === 1 ? <div className="space-y-5"><ChoiceGrid className="onboarding-choices onboarding-quick" options={choices(quickCountries)} value={entityCountry} onChange={setEntityCountry} name="Common home countries" /><SmartPicker suggestionCount={0} label={isBusiness ? "Company country" : "Home country"} options={countries} value={entityCountry} onChange={setEntityCountry} detected={seed.detectedCountry} placeholder="Search all countries" /></div> : null}
      {step === 2 ? <div className="space-y-5"><ChoiceGrid className="onboarding-choices onboarding-quick" options={choices(quickCountries)} value={targets} onChange={setTargets} multiple name="Common destination markets" /><p className={styles.selectionHint} role="status"><Check size={13} aria-hidden />{targets.length ? `${targets.length} market${targets.length === 1 ? "" : "s"} selected. You can choose more than one.` : "Choose as many as you like. You can add more later."}</p><SmartPicker suggestionCount={0} label="Target markets" options={countries} value={targets} onChange={setTargets} multiple placeholder="Search all markets" /></div> : null}
      {step === 2 ? <details className="rounded-xl border border-[var(--color-line)] p-4 text-sm"><summary className="cursor-pointer">Currency & product preferences · optional</summary><div className="mt-4 space-y-5"><SmartPicker suggestionCount={0} label="Receiving currencies" options={currencies} value={settlement} onChange={setSettlement} multiple placeholder="Choose currencies" renderMark={option => <CurrencyLogo symbol={option.value} size={20} />} /><ChoiceGrid className="onboarding-choices onboarding-interests" options={INTERESTS} value={interests} onChange={setInterests} multiple columns={3} name="Which infrastructure matters" /></div></details> : null}
    </fieldset>
    {error ? <p role="alert" className="text-sm text-[var(--color-bad)]">{error}</p> : null}
    {step === 2 ? <details className="onboarding-review" aria-label="Review your answers"><summary className="cursor-pointer text-sm font-semibold">Review your answers</summary><section><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Check size={16} aria-hidden />Your workspace, at a glance</div><dl>{review.map((item) => <div key={item.label} className="onboarding-review-row"><div><dt className="text-xs text-[var(--color-muted)]">{item.label}</dt><dd className="mt-1 text-sm">{item.value}</dd></div><button type="button" disabled={pending} className="text-xs font-medium text-[var(--color-purple)]" aria-label={`Edit ${item.label.toLowerCase()}`} onClick={() => setStep(Math.min(2, item.step))}>Edit</button></div>)}</dl></section></details> : null}
    {step === 2 && assumptions.length ? <details className="rounded-xl border border-[var(--color-line)] p-4 text-xs text-[var(--color-muted)]"><summary className="cursor-pointer">Review skipped answers ({assumptions.length})</summary><ul className="mt-3 space-y-2">{assumptions.map((item) => <li key={item}>{item}</li>)}</ul></details> : null}
  </StepFlow></section>;
}
