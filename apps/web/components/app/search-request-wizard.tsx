"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Building2, Check, ChevronDown, CircleDollarSign, Coins, Landmark, LoaderCircle, Route, Scale, Search, ShieldCheck, Timer, UserRound, Wallet } from "lucide-react";
import { Flag, currencyFlagCode, type PickerOption } from "@railor/ui";
import { RANKING_PRESET_LABEL, type RankingPreset } from "@railor/types";
import { workspacePolicySetup, type SavedSetupPolicy } from "../../lib/workspace-policy-setup";
import { CurrencyLogo } from "../marketing/currency-logo";
import { NetworkLogo } from "../marketing/network-logo";
import { missingIntentFields, type IntentDraft, type IntentOptions } from "./intent-builder";
import styles from "./search-request-wizard.module.css";
import { RouteOptionPicker } from "./route-option-picker";

const steps = ["Sender", "Funding", "Recipient", "Review"];
const endpoints = [
  ["", "Any method"], ["bank_account", "Bank account"], ["stablecoin_wallet", "Stablecoin wallet"],
  ["mobile_money", "Mobile money"], ["card", "Card"], ["virtual_account", "Virtual account"],
  ["merchant_checkout", "Merchant checkout"], ["payment_link", "Payment link"],
  ["local_instant_rail", "Local instant rail"], ["cash_pickup", "Cash pickup"],
] as const;
const rankings: Array<{ value: RankingPreset; description: string; icon: ReactNode }> = [
  { value: "balanced", description: "Balance cost, speed and reliability.", icon: <Scale /> },
  { value: "cheapest", description: "Prioritize the lowest known cost.", icon: <CircleDollarSign /> },
  { value: "fastest", description: "Prioritize the shortest settlement time.", icon: <Timer /> },
  { value: "most_reliable", description: "Prioritize provider reliability.", icon: <ShieldCheck /> },
  { value: "max_recipient_amount", description: "Prioritize what the recipient receives.", icon: <Wallet /> },
];

function Choice({ name, value, checked, onChange, icon, title, description }: {
  name: string; value: string; checked: boolean; onChange: () => void; icon: ReactNode; title: string; description?: string;
}) {
  return <label className={styles.choice} data-selected={checked}>
    <input type="radio" name={name} value={value} checked={checked} onChange={onChange} />
    <span className={styles.choiceIcon} aria-hidden>{icon}</span><span><strong>{title}</strong>{description && <small>{description}</small>}</span>
    <span className={styles.radio} aria-hidden>{checked && <Check size={11} />}</span>
  </label>;
}

function OptionPicker({ label, options, value, onChange, kind, suggested = [] }: {
  label: string; options: PickerOption[]; value: string; onChange: (value: string) => void;
  kind: "country" | "currency" | "asset" | "network"; suggested?: string[];
}) {
  const id = useId();
  const mark = (code: string) => kind === "country" ? <Flag code={code} size={19} />
    : kind === "currency" ? (currencyFlagCode(code) ? <Flag code={currencyFlagCode(code)!} size={19} /> : <CircleDollarSign size={21} />)
      : kind === "network" ? <NetworkLogo slug={code} size={24} /> : <CurrencyLogo symbol={code} size={24} />;
  return <div className={styles.field}>
    <span id={id}>{label}</span>
    <RouteOptionPicker label={label} options={options} value={value} onChange={onChange} placeholder={kind === "network" ? "Any network" : `Choose ${kind}`} renderMark={mark} />
    {suggested.length > 0 && <div className={styles.quickChoices} aria-label={`${label} shortcuts`}>
      {suggested.filter((code) => options.some((option) => option.value === code)).map((code) => <button key={code} type="button" aria-pressed={value === code} onClick={() => onChange(code)}>
        {mark(code)}{kind === "country" ? options.find((option) => option.value === code)?.label : code}
      </button>)}
    </div>}
  </div>;
}

export function SearchRequestWizard({ value, onChange, options, policies, policyId, onPolicyChange, preference, onPreferenceChange, savedPolicy, canEditPolicies, busy, onSearch }: {
  value: IntentDraft; onChange: (value: IntentDraft) => void; options: IntentOptions;
  policies: SavedSetupPolicy[]; policyId: string; onPolicyChange: (id: string) => void;
  preference: RankingPreset; onPreferenceChange: (value: RankingPreset) => void;
  savedPolicy: SavedSetupPolicy | null; canEditPolicies: boolean; busy: boolean; onSearch: () => void;
}) {
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [validation, setValidation] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(0);
  const reducedMotion = useReducedMotion();
  const groupId = useId();
  const set = <K extends keyof IntentDraft>(key: K, next: IntentDraft[K]) => onChange({ ...value, [key]: next });
  const unit = value.sourceKind === "fiat" ? value.sourceCurrency : value.sourceAsset;
  const countryName = (code: string) => options.countries.find((option) => option.value === code)?.label ?? code;
  const policy = workspacePolicySetup(false, savedPolicy, canEditPolicies);
  const title = ["Who’s sending?", "What are you sending?", "Where should it arrive?", "Ready to compare?"][step];
  const description = ["Choose the sender’s profile and home country.", "Choose your funding currency or stablecoin, then enter the amount.", "Tell us who receives the funds and how they should arrive.", "Review your route and choose what matters most."][step];

  useEffect(() => {
    if (previousStep.current !== step) { heading.current?.focus({ preventScroll: true }); previousStep.current = step; }
  }, [step]);

  function navigate(next: number) {
    const missing = missingIntentFields(value);
    const required = next > step ? missing.filter((field) => step === 0 ? field === "entity country" : step === 1 ? ["source currency", "source asset", "amount"].includes(field) : step === 2 ? field === "destination country" : true) : [];
    if (required.length) { setValidation(`Please add ${required.join(" and ")} to continue.`); return; }
    setValidation(""); setFurthest(Math.max(furthest, next)); setStep(next);
  }

  return <section className={styles.wizard} aria-label="Build your route">
    <nav className={styles.stepper} aria-label="Route setup steps">{steps.map((label, index) => <button type="button" key={label} aria-current={step === index ? "step" : undefined} disabled={busy || index > furthest} onClick={() => navigate(index)}>
      <span>{index < step ? <Check size={13} /> : index + 1}</span>{label}
    </button>)}</nav>
    <div className={styles.layout}>
      <form className={styles.form} onChange={() => setValidation("")} onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        if (step < 3) navigate(step + 1);
        else if (missingIntentFields(value).length) setValidation(`Please add ${missingIntentFields(value).join(", ")}.`);
        else if (policyId) onSearch();
      }}>
        <div className={styles.stepHeading}><span className={styles.eyebrow}>STEP {step + 1} OF 4</span><h2 ref={heading} tabIndex={-1}>{title}</h2><p>{description}</p></div>
        <fieldset disabled={busy} className={styles.fields}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={step} initial={reducedMotion ? false : { opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -4 }} transition={{ duration: reducedMotion ? 0 : 0.16 }} className={styles.stepBody}>
              {step === 0 && <>
                <fieldset className={styles.choiceGroup}><legend>I’m sending as</legend><div className={styles.twoChoices}>
                  <Choice name={`${groupId}-sender`} value="business" title="A business" description="Company or registered organization" icon={<Building2 />} checked={value.sourceEntityType === "business"} onChange={() => set("sourceEntityType", "business")} />
                  <Choice name={`${groupId}-sender`} value="individual" title="An individual" description="Personal or freelance payment" icon={<UserRound />} checked={value.sourceEntityType === "individual"} onChange={() => set("sourceEntityType", "individual")} />
                </div></fieldset>
                <OptionPicker label="Sender’s country" kind="country" options={options.countries} value={value.sourceEntityCountry} onChange={(next) => set("sourceEntityCountry", next)} suggested={["IN", "US", "SG"]} />
                <p className={styles.note}>Use the country where the sender lives or the business is registered.</p>
              </>}
              {step === 1 && <>
                <fieldset className={styles.choiceGroup}><legend>Funds start as</legend><div className={styles.twoChoices}>
                  <Choice name={`${groupId}-funding`} value="fiat" title="Bank currency" description="USD, INR, EUR and more" icon={<Landmark />} checked={value.sourceKind === "fiat"} onChange={() => set("sourceKind", "fiat")} />
                  <Choice name={`${groupId}-funding`} value="asset" title="Stablecoin" description="USDC, USDT and more" icon={<Coins />} checked={value.sourceKind === "asset"} onChange={() => set("sourceKind", "asset")} />
                </div></fieldset>
                {value.sourceKind === "fiat" ? <OptionPicker label="Sending currency" kind="currency" options={options.currencies} value={value.sourceCurrency} onChange={(next) => set("sourceCurrency", next)} suggested={["USD", "INR", "EUR"]} /> : <>
                  <OptionPicker label="Sending stablecoin" kind="asset" options={options.assets} value={value.sourceAsset} onChange={(next) => set("sourceAsset", next)} suggested={["USDC", "USDT", "EURC"]} />
                  <OptionPicker label="Sending network (optional)" kind="network" options={options.networks} value={value.sourceNetwork} onChange={(next) => set("sourceNetwork", next)} suggested={["base", "ethereum", "solana"]} />
                </>}
                <label className={styles.field}>Amount to send<div className={styles.amount}><input aria-label="Amount to send" inputMode="decimal" type="number" min="0.01" step="any" value={value.amount ?? ""} onChange={(e) => set("amount", e.target.value === "" ? undefined : Number(e.target.value))} /><span>{unit || "Choose currency"}</span></div></label>
                <div className={styles.quickChoices} aria-label="Amount shortcuts">{[1000, 10000, 100000, 1000000].map((amount) => <button type="button" key={amount} aria-pressed={value.amount === amount} onClick={() => set("amount", amount)}>{amount.toLocaleString("en-US")}</button>)}</div>
                <p className={styles.note}>Amount is in {unit || "your funding currency"}. Policy thresholds use this amount without currency conversion.</p>
              </>}
              {step === 2 && <>
                <fieldset className={styles.choiceGroup}><legend>The recipient is</legend><div className={styles.twoChoices}>
                  <Choice name={`${groupId}-recipient`} value="business" title="A business" icon={<Building2 />} checked={value.beneficiaryType === "business"} onChange={() => set("beneficiaryType", "business")} />
                  <Choice name={`${groupId}-recipient`} value="individual" title="An individual" icon={<UserRound />} checked={value.beneficiaryType === "individual"} onChange={() => set("beneficiaryType", "individual")} />
                </div></fieldset>
                <div className={styles.twoFields}>
                  <OptionPicker label="Receiving country" kind="country" options={options.countries} value={value.destinationCountry} onChange={(country) => onChange({ ...value, destinationCountry: country, destinationCurrency: options.currencyByCountry[country] ?? value.destinationCurrency })} />
                  <OptionPicker label="Receiving currency" kind="currency" options={options.currencies} value={value.destinationCurrency} onChange={(next) => set("destinationCurrency", next)} />
                </div><p className={styles.note}>We suggest the country’s local currency. You can change it.</p>
                <fieldset className={styles.choiceGroup}><legend>How should it arrive?</legend><div className={styles.threeChoices}>
                  {endpoints.slice(0, 3).map(([endpoint, label], index) => <Choice key={endpoint} name={`${groupId}-endpoint`} value={endpoint} title={label} icon={index === 0 ? <Route /> : index === 1 ? <Landmark /> : <Wallet />} checked={value.endpointType === endpoint} onChange={() => set("endpointType", endpoint)} />)}
                </div></fieldset>
                <details className={styles.advanced}><summary>Other receiving methods & rail <ChevronDown size={14} /></summary><div>
                  <div className={styles.field}><label htmlFor={`${groupId}-receiving-method`}>Receiving method</label><select id={`${groupId}-receiving-method`} value={value.endpointType} onChange={(e) => set("endpointType", e.target.value)}>{endpoints.map(([endpoint, label]) => <option key={endpoint} value={endpoint}>{label}</option>)}</select></div>
                  <label className={styles.field}>Named rail (optional)<input value={value.namedRail} onChange={(e) => set("namedRail", e.target.value)} placeholder="e.g. SEPA_INSTANT" maxLength={80} /></label>
                </div></details>
              </>}
              {step === 3 && <>
                <div className={styles.review}><div><small>You send</small><strong>{value.amount?.toLocaleString("en-US")} {unit}</strong><span>{countryName(value.sourceEntityCountry)} → {countryName(value.destinationCountry)}</span></div><button type="button" onClick={() => navigate(1)}>Edit amount <ArrowLeft size={13} /></button></div>
                <fieldset className={styles.choiceGroup}><legend>What matters most?</legend><div className={styles.rankingChoices}>
                  {rankings.map((ranking) => <Choice key={ranking.value} name={`${groupId}-ranking`} value={ranking.value} title={RANKING_PRESET_LABEL[ranking.value]} description={ranking.description} icon={ranking.icon} checked={preference === ranking.value} onChange={() => onPreferenceChange(ranking.value)} />)}
                </div></fieldset>
                {policies.length ? <div className={styles.policy}><ShieldCheck size={19} aria-hidden /><div><span>Active company policy</span>{policies.length > 1 ? <select aria-label="Active company policy" value={policyId} onChange={(e) => onPolicyChange(e.target.value)}>{policies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : <strong>{policies[0]?.name}</strong>}<small>Providers must pass your guardrails before ranking.</small></div></div> : <div className={styles.policyEmpty}><ShieldCheck size={20} aria-hidden /><div><strong>{policy.title}</strong><p>{policy.description}</p><Link href={policy.href}>{policy.action} <ArrowRight size={13} /></Link></div></div>}
              </>}
            </motion.div>
          </AnimatePresence>
        </fieldset>
        {validation && <p className={styles.validation} role="alert">{validation}</p>}
        <footer className={styles.footer}>
          {step > 0 ? <button className={styles.back} type="button" disabled={busy} onClick={() => navigate(step - 1)}><ArrowLeft size={15} />Back</button> : <span className={styles.footerHint}>Four steps. No account credentials needed.</span>}
          <button type="submit" className={styles.primary} disabled={busy || (step === 3 && !policyId)}>{busy ? <><LoaderCircle size={16} className={styles.spinner} />Checking routes…</> : step === 3 ? <><Search size={16} />Compare routes</> : <>Continue<ArrowRight size={16} /></>}</button>
        </footer>
      </form>
      <aside className={styles.summary} aria-label="Your route summary" data-review={step === 3}>
        <div className={styles.summaryHeading}><span className={styles.routeIcon}><Route size={19} /></span><span>Your route<small>Updates as you choose</small></span></div>
        <ol className={styles.routeStops}>
          <li><span className={styles.stopMark}>{value.sourceEntityCountry ? <Flag code={value.sourceEntityCountry} size={22} /> : <Building2 size={20} />}</span><div><small>FROM · {value.sourceEntityType === "business" ? "BUSINESS" : "INDIVIDUAL"}</small><strong>{countryName(value.sourceEntityCountry) || "Choose a country"}</strong></div></li>
          <li><span className={styles.stopMark}>{unit ? value.sourceKind === "asset" ? <CurrencyLogo symbol={unit} size={29} /> : currencyFlagCode(unit) ? <Flag code={currencyFlagCode(unit)!} size={22} /> : <CircleDollarSign size={23} /> : <Coins size={23} />}</span><div><small>YOU SEND</small><strong>{value.amount?.toLocaleString("en-US") ?? "—"} {unit}</strong>{value.sourceKind === "asset" && value.sourceNetwork && <span className={styles.network}><NetworkLogo slug={value.sourceNetwork} size={13} />{options.networks.find((network) => network.value === value.sourceNetwork)?.label ?? value.sourceNetwork}</span>}</div></li>
          <li><span className={styles.stopMark}>{value.destinationCountry ? <Flag code={value.destinationCountry} size={22} /> : <Landmark size={20} />}</span><div><small>TO · {value.beneficiaryType === "business" ? "BUSINESS" : "INDIVIDUAL"}</small><strong>{countryName(value.destinationCountry) || "Choose a country"}</strong><span>{value.destinationCurrency || "Any currency"} · {endpoints.find(([endpoint]) => endpoint === value.endpointType)?.[1]}</span>{value.namedRail && <span>{value.namedRail}</span>}</div></li>
        </ol>
        <p className={styles.summaryNote}><Search size={15} /><span>We’ll check coverage, policy and pricing where available. Comparing doesn’t send money.</span></p>
      </aside>
    </div>
  </section>;
}
