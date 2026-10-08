"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, SmartPicker, type PickerOption } from "@railor/ui";
import { controlCommand } from "../../app/app/control-actions";
import { CurrencyLogo } from "../marketing/currency-logo";
import { NetworkLogo } from "../marketing/network-logo";
import { FieldBlock, PresetChip, ResultNotice, Segmented } from "./form-kit";
import { PolicyRules } from "@railor/types";
import { ArrowLeft, ArrowRight, Check, Pencil, ShieldCheck } from "lucide-react";
import { RuleSummary } from "./product-ui";
import { PolicyChoices, PolicyNumberQuestion } from "./policy-setup-fields";
import { POLICY_CHECKS, POLICY_STAGES, SCOPE_RULES, applyGuardrailProfile, clearRules, guardrailProfile, hasPolicyLimits, hasPolicyScope, listRule, numberRule, parsePolicyRules, policyStage, policySteps, type DraftRules, type GuardrailProfile, type PolicyStep } from "./policy-setup";
import styles from "./policy-setup.module.css";
import { ProviderLogo } from "./provider-logo";
import {
  IntentBuilder,
  defaultIntentDraft,
  intentFromDraft,
  missingIntentFields,
  type IntentDraft,
  type IntentOptions,
} from "./intent-builder";

const field = "product-field";

/** Logos on the provider, asset and network pickers. */
const providerMark = (option: PickerOption) => <ProviderLogo slug={option.value} name={option.label} size={18} />;
const assetMark = (option: PickerOption) => <CurrencyLogo symbol={option.value} size={16} />;
const networkMark = (option: PickerOption) => <NetworkLogo slug={option.value} size={16} />;

export function useCommand() {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [data, setData] = useState<unknown>();
  const router = useRouter();
  function run(value: unknown, onResult?: (data: unknown) => void) {
    setError("");
    start(async () => {
      try {
        const result = await controlCommand(value);
        if (!result.ok) setError(humanError(result.error));
        else {
          setData(result.data ?? { saved: true });
          onResult?.(result.data);
          if (result.href) router.push(result.href);
          else router.refresh();
        }
      } catch {
        setError("Connection failed. Please retry.");
      }
    });
  }
  return { pending, error, data, run, setError };
}

/** Server error codes are stable identifiers; show people a sentence. */
function humanError(code?: string) {
  if (!code) return "Action failed.";
  const known: Record<string, string> = {
    active_policy_required: "That policy has no active version yet. Activate one on the policy page first.",
    policy_not_found: "That policy no longer exists.",
    decision_not_found: "That decision could not be found in this workspace.",
    forbidden: "Your role can't do that. Ask a workspace owner or admin.",
    organization_required: "Finish creating your workspace first.",
  };
  return known[code] ?? code.replaceAll("_", " ");
}

export function PolicyEditor({
  policyId, initialRules = {}, initialName = "Production policy", canEdit, providers, options, entityCountry,
}: {
  policyId?: string; initialRules?: DraftRules; initialName?: string; canEdit: boolean;
  providers: Array<{ slug: string; name: string }>; options: IntentOptions; entityCountry?: string;
}) {
  const [name, setName] = useState(initialName);
  const [rules, setRules] = useState<DraftRules>(() => PolicyRules.parse(initialRules));
  const [profile, setProfile] = useState<GuardrailProfile>(() => guardrailProfile(initialRules));
  const [limits, setLimits] = useState(() => hasPolicyLimits(initialRules));
  const [scope, setScope] = useState(() => hasPolicyScope(initialRules));
  const [step, setStep] = useState<PolicyStep>(policyId ? "checks" : "name");
  const [editingReview, setEditingReview] = useState(false);
  const [inputError, setInputError] = useState("");
  const [intent, setIntent] = useState<IntentDraft>(() => defaultIntentDraft(entityCountry));
  const [advanced, setAdvanced] = useState("");
  const [advancedError, setAdvancedError] = useState("");
  const [simulation, setSimulation] = useState<SimulationSummary | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const nameId = useId();
  const c = useCommand();
  const sim = useCommand();
  const steps = policySteps(profile, limits, scope, Boolean(policyId));
  const position = steps.indexOf(step);
  const stage = policyStage(step);
  const stages = policyId ? POLICY_STAGES.filter((item) => item !== "Basics") : POLICY_STAGES;
  const fingerprint = JSON.stringify({ rules, intent });
  const currentSimulationInput = useRef(fingerprint);
  currentSimulationInput.current = fingerprint;
  useEffect(() => {
    setSimulation(null);
    sim.setError("");
  }, [rules, intent]); // A comparison is valid only for the inputs it evaluated.
  useEffect(() => {
    setInputError("");
    if (step !== (policyId ? "checks" : "name")) {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: "nearest" });
    }
  }, [step, policyId]);
  const update = (key: string, value: unknown) => setRules((previous) => {
    const next = { ...previous, [key]: value };
    if (value === undefined) delete next[key];
    return next;
  });
  const move = (next: PolicyStep) => { c.setError(""); setInputError(""); setStep(next); };
  const edit = (next: PolicyStep) => { setEditingReview(true); move(next); };
  const chooseProfile = (next: string) => {
    setProfile(next as GuardrailProfile);
    setRules((previous) => applyGuardrailProfile(previous, next as GuardrailProfile));
  };
  const providerOptions: PickerOption[] = providers.map((p) => ({ value: p.slug, label: p.name }));
  const check = POLICY_CHECKS.find(({ key }) => key === step);
  const titles: Partial<Record<PolicyStep, [string, string]>> = {
    name: ["What would you like to call this policy?", "A policy is your workspace's set of rules for evaluating payments. Give it a name your team will recognize."],
    checks: ["What checks should every route pass?", "Start with a set of checks, or choose your own. These checks decide which routes can pass your policy."],
    evidence: ["How recent should route evidence be?", "This is the age of the evidence about a route, not the age of a quote. Older evidence will fail this check."],
    approval: ["When should a person approve a payment?", "Payments above this amount need human review. The threshold uses each payment's funding currency or asset; Railor does not convert it to a common currency."],
    limits: ["Do you want fee and delivery limits?", "You can cap the quoted cost and the estimated settlement time. Both limits are optional."],
    cost: ["What is the highest quoted fee you'll allow?", "Choose a percentage of the payment amount. A cost limit requires a live quote with known fees; routes without that information cannot pass."],
    settlement: ["How quickly must a payment arrive?", "Choose the longest estimated settlement time. A time limit requires a live quote with a delivery estimate; routes without it cannot pass."],
    scope: ["Do you want to narrow the choices?", "Use all eligible providers, assets and networks, or choose specific ones. Every route must still pass your other checks."],
    providerAllowlist: ["Which providers may Railor consider?", "Choose the providers your team wants to use. Leave this empty to consider any eligible provider."],
    providerDenylist: ["Are there any providers to exclude?", "These providers will be blocked even if they meet every other rule. Leave this empty if you have no exclusions."],
    allowedAssets: ["Which digital assets may a payment use?", "Choose the assets your team supports. Leave this empty to allow any asset. This list does not restrict fiat currencies."],
    allowedNetworks: ["Which blockchain networks may a payment use?", "Choose the networks your team supports. Leave this empty to allow any network."],
    review: ["Does everything look right?", "Review your answers, edit anything, and save a draft. You can activate it separately after reviewing the saved version."],
  };
  const [title, hint] = check ? [check.question, check.hint] : titles[step]!;
  const validation = PolicyRules.safeParse(rules);
  const blocked = c.pending || sim.pending || Boolean(inputError) || (step === "name" && (!name.trim() || name.trim().length > 120));
  const namesOf = (key: string, choices: PickerOption[], empty: string) => {
    const values = listRule(rules, key);
    return values.length ? values.map((value) => choices.find((option) => option.value === value)?.label ?? value).join(", ") : empty;
  };
  const age = numberRule(rules, "maximumEvidenceAgeHours");
  const approval = numberRule(rules, "humanApprovalAboveAmount");
  const cost = numberRule(rules, "maximumKnownCostBps");
  const eta = numberRule(rules, "maximumEtaMinutes");
  const guidedKeys = [...POLICY_CHECKS.map(({ key }) => key), ...SCOPE_RULES, "maximumEvidenceAgeHours", "humanApprovalAboveAmount", "maximumKnownCostBps", "maximumEtaMinutes"];
  const extraRules = Object.fromEntries(Object.entries(rules).filter(([key, value]) =>
    !guidedKeys.includes(key) && value !== undefined && value !== false && !(Array.isArray(value) && value.length === 0) &&
    !((key === "allowAggregators" || key === "allowPrefunding") && value === true)
  ));
  const reviewRows: Array<{ title: string; text: string; step: PolicyStep }> = [
    ...(policyId ? [] : [{ title: "Policy name", text: name, step: "name" as const }]),
    { title: "Route checks", text: POLICY_CHECKS.map(({ key, label }) => `${label}: ${rules[key] ? "required" : "not required"}`).join(" · "), step: "checks" },
    { title: "Evidence freshness", text: age === undefined ? "No evidence age limit" : `Evidence no older than ${age % 24 === 0 ? `${age / 24} days` : `${age} hours`}`, step: "evidence" },
    { title: "Human approval", text: approval === undefined ? "No amount-based approval step" : `Required above ${approval.toLocaleString()} in each payment's funding currency or asset`, step: "approval" },
    { title: "Fees and delivery", text: `${cost === undefined ? "No fee cap" : `Maximum quoted fee: ${cost / 100}%`} · ${eta === undefined ? "No settlement time cap" : `Maximum settlement: ${eta >= 60 && eta % 60 === 0 ? `${eta / 60} hours` : `${eta} minutes`}`}`, step: "limits" },
    { title: "Providers", text: `Allowed: ${namesOf("providerAllowlist", providerOptions, "any eligible provider")}. Excluded: ${namesOf("providerDenylist", providerOptions, "none")}.`, step: scope ? "providerAllowlist" : "scope" },
    { title: "Assets and networks", text: `Assets: ${namesOf("allowedAssets", options.assets, "any")}. Networks: ${namesOf("allowedNetworks", options.networks, "any")}.`, step: scope ? "allowedAssets" : "scope" },
  ];
  const numberQuestion = (key: string, presets: Array<{ value: number; label: string; description?: string; tag?: string }>, offLabel: string, customLabel: string, unit: string, extra: { factor?: number; integer?: boolean; allowZero?: boolean } = {}) =>
    <PolicyNumberQuestion label={title} value={numberRule(rules, key)} onChange={(value) => update(key, value)} presets={presets} offLabel={offLabel} customLabel={customLabel} unit={unit} onError={setInputError} {...extra} />;

  return <Card className={styles.wizard}>
    <header className={styles.header}>
      <div><span className="product-index">{policyId ? "POLICY / NEW VERSION" : "POLICY / GUIDED SETUP"}</span><h2>{policyId ? "Create a new version" : "Create policy"}</h2><p>One question at a time. Choose your rules, then review your draft.</p></div>
      <span className="product-badge" data-tone="warn">Draft only</span>
    </header>
    <div className={styles.progress} role="progressbar" aria-label="Policy setup progress" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={position + 1} aria-valuetext={`Question ${position + 1} of ${steps.length}: ${stage}`}><span style={{ width: `${((position + 1) / steps.length) * 100}%` }} /></div>
    <div className={styles.layout}>
      <aside className={styles.sidebar} aria-label="Setup stages">
        <ol>{stages.map((item, index) => <li key={item} className={styles.stage} aria-current={stage === item ? "step" : undefined} data-complete={stages.indexOf(stage) > index}><span>{stages.indexOf(stage) > index ? <Check size={13} aria-hidden="true" /> : String(index + 1).padStart(2, "0")}</span>{item}</li>)}</ol>
        <p className={styles.sidebarNote}><ShieldCheck size={20} aria-hidden="true" />Your answers become a draft.<br />Extra questions appear only when you choose custom rules.</p>
      </aside>
      <div className={styles.body}>
        <section key={step} className={styles.question} aria-labelledby={`${nameId}-question`}>
          <span className={styles.eyebrow}>Question {String(position + 1).padStart(2, "0")} of {String(steps.length).padStart(2, "0")} / {stage}</span>
          <h3 id={`${nameId}-question`} ref={heading} tabIndex={-1}>{title}</h3>
          <p className={styles.hint}>{hint}</p>
          {step === "name" && <>
            <div className={styles.nameField}><label htmlFor={nameId}>Policy name</label><input id={nameId} autoComplete="off" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Team payment policy" /></div>
            <div className={styles.examples}><span>Try:</span>{["Production policy", "Supplier payments", "Treasury policy"].map((example) => <button type="button" key={example} onClick={() => setName(example)}>{example}</button>)}</div>
          </>}
          {step === "checks" && <PolicyChoices label={title} value={profile} onChange={chooseProfile} options={[
            { value: "verified", label: "Verified and eligible routes", tag: "Suggested starting point", description: "Require exact route evidence and confirmed company eligibility. Block providers during active incidents." },
            { value: "strict", label: "Connected accounts with live quotes", description: "All the checks above, plus a connected provider account and a fresh live quote. Routes without either are blocked." },
            { value: "custom", label: "Choose each check myself", description: "Answer a few yes-or-no questions. Existing custom rules stay as they are until you change them." },
          ]} />}
          {check && <PolicyChoices label={title} value={rules[check.key] ? "yes" : "no"} onChange={(value) => update(check.key, value === "yes")} options={[{ value: "yes", label: check.yes }, { value: "no", label: check.no }]} />}
          {step === "evidence" && numberQuestion("maximumEvidenceAgeHours", [
            { value: 24, label: "Within 1 day" }, { value: 72, label: "Within 3 days" }, { value: 168, label: "Within 7 days" }, { value: 720, label: "Within 30 days" },
          ], "No age limit", "Maximum evidence age", "hours", { integer: true })}
          {step === "approval" && numberQuestion("humanApprovalAboveAmount", [
            { value: 1000, label: "Above 1,000" }, { value: 10000, label: "Above 10,000" }, { value: 100000, label: "Above 100,000" },
          ], "No amount-based approval", "Approval required above", "funding units")}
          {step === "limits" && <PolicyChoices label={title} value={limits ? "custom" : "none"} options={[
            { value: "none", label: "Continue without fee or time caps", description: "Your route checks still apply. Fees and delivery times won't add another restriction." },
            { value: "custom", label: "Set fee and delivery limits", description: "Choose a fee cap and a settlement time in the next two questions. You can leave either one uncapped." },
          ]} onChange={(value) => { setLimits(value === "custom"); if (value === "none") setRules((previous) => clearRules(previous, ["maximumKnownCostBps", "maximumEtaMinutes"])); }} />}
          {step === "cost" && numberQuestion("maximumKnownCostBps", [
            { value: 25, label: "Up to 0.25%" }, { value: 50, label: "Up to 0.5%" }, { value: 100, label: "Up to 1%" }, { value: 200, label: "Up to 2%" },
          ], "No fee cap", "Maximum quoted fee", "% of payment amount", { factor: 100, allowZero: true })}
          {step === "settlement" && numberQuestion("maximumEtaMinutes", [
            { value: 15, label: "Within 15 minutes" }, { value: 60, label: "Within 1 hour" }, { value: 1440, label: "Within 1 day" },
          ], "No time cap", "Maximum settlement time", "minutes")}
          {step === "scope" && <PolicyChoices label={title} value={scope ? "custom" : "any"} options={[
            { value: "any", label: "Consider all eligible options", description: "No extra allowlists or provider exclusions. Your route checks and limits still decide what can pass." },
            { value: "custom", label: "Choose providers, assets or networks", description: "Pick one list at a time. You can leave any list empty to keep that choice open." },
          ]} onChange={(value) => { setScope(value === "custom"); if (value === "any") setRules((previous) => clearRules(previous, SCOPE_RULES)); }} />}
          {SCOPE_RULES.some((key) => key === step) && <div className={styles.picker}>
            <SmartPicker multiple renderMark={step === "allowedAssets" ? assetMark : step === "allowedNetworks" ? networkMark : providerMark} options={step === "allowedAssets" ? options.assets : step === "allowedNetworks" ? options.networks : providerOptions} value={listRule(rules, step)} onChange={(value) => update(step, value.length ? value : undefined)} placeholder={step === "allowedAssets" ? "Search assets…" : step === "allowedNetworks" ? "Search networks…" : "Search providers…"} suggestionCount={5} />
            <p className={styles.pickerNote}>{listRule(rules, step).length ? `${listRule(rules, step).length} selected. Click a selected choice to remove it.` : step === "providerDenylist" ? "No providers excluded. Continue if you don't need exclusions." : "No restrictions selected. Continue to keep all eligible options available."}</p>
          </div>}
          {step === "review" && <>
            <div className={styles.review}>{reviewRows.map((row) => <div className={styles.reviewRow} key={row.title}><div><h4>{row.title}</h4><p>{row.text}</p></div><button type="button" aria-label={`Edit ${row.title.toLowerCase()}`} onClick={() => edit(row.step)}>Edit <Pencil size={11} className="inline" aria-hidden="true" /></button></div>)}</div>
            {Object.keys(extraRules).length > 0 && <div className={styles.optional}><p className="mb-3 text-xs font-semibold">Additional rules from this policy</p><RuleSummary rules={extraRules} /></div>}
            <details className={styles.optional}>
              <summary>Test these rules on a sample payment <span className="font-normal text-[var(--color-muted)]">· optional</span></summary>
              <div className="space-y-4">
                <p className="text-xs leading-relaxed text-[var(--color-muted)]">Compare the current rules with this draft. This test does not send a payment.</p>
                <IntentBuilder value={intent} onChange={setIntent} options={options} detectedEntity={entityCountry} />
                <Button type="button" disabled={sim.pending || !validation.success || missingIntentFields(intent).length > 0} onClick={() => {
                  const evaluatedInput = fingerprint;
                  sim.run({ action: "simulate", intent: intentFromDraft(intent), baseline: initialRules, rules }, (data) => {
                    if (currentSimulationInput.current === evaluatedInput) setSimulation(data as SimulationSummary);
                  });
                }}>{sim.pending ? "Testing…" : "Compare with current rules"}</Button>
                {missingIntentFields(intent).length > 0 && <p className="text-xs text-[var(--color-muted)]">Still needed: {missingIntentFields(intent).join(", ")}.</p>}
                {sim.error && <p role="alert" className={styles.error}>{sim.error}</p>}
                {simulation && <SimulationResult result={simulation} providers={providers} />}
              </div>
            </details>
            <details className={styles.optional} open={advancedOpen} onToggle={(event) => {
              if (event.currentTarget.open && !advancedOpen) { setAdvanced(JSON.stringify(rules, null, 2)); setAdvancedError(""); }
              setAdvancedOpen(event.currentTarget.open);
            }}>
              <summary>Advanced rules <span className="font-normal text-[var(--color-muted)]">· JSON editor</span></summary>
              <div className="space-y-3"><label className="block text-xs font-semibold">Rules JSON<textarea className={`${field} font-mono`} rows={10} value={advanced} onChange={(event) => setAdvanced(event.target.value)} /></label>
                <Button type="button" variant="ghost" onClick={() => {
                  const result = parsePolicyRules(advanced);
                  if (result.error) { setAdvancedError(result.error); return; }
                  setRules(result.rules!); setProfile(guardrailProfile(result.rules!)); setLimits(hasPolicyLimits(result.rules!)); setScope(hasPolicyScope(result.rules!)); setAdvancedError(""); setAdvancedOpen(false);
                }}>Apply JSON to draft</Button>
                {advancedError && <p role="alert" className={styles.error}>{advancedError}</p>}
              </div>
            </details>
            <p className={styles.saveNote}><ShieldCheck size={15} aria-hidden="true" />Saving creates a draft. It does not activate this policy or send a payment.</p>
            {!canEdit && <p className={styles.error}>Only owners and admins can save policies.</p>}
            {c.data !== undefined && !c.error && <p role="status" className="mt-3 text-sm text-[var(--color-ok)]">Draft saved. Activate it from the version history.</p>}
          </>}
        </section>
        {c.error && <p role="alert" className={styles.error}>{c.error}</p>}
        <footer className={styles.navigation}>
          <Button type="button" variant="ghost" disabled={position === 0 || c.pending || sim.pending} onClick={() => move(steps[position - 1]!)}><ArrowLeft size={15} aria-hidden="true" /> Back</Button>
          <div>
            {editingReview && step !== "review" && <button type="button" className={styles.returnLink} disabled={blocked} onClick={() => { setEditingReview(false); move("review"); }}>Return to review</button>}
            {step === "review" ? <Button type="button" disabled={blocked || !canEdit || !validation.success || (!policyId && !name.trim()) || Boolean(advancedError) || advancedOpen} onClick={() => {
              if (!validation.success) { c.setError("Check your rules before saving."); return; }
              c.run(policyId ? { action: "version_policy", policyId, rules: validation.data } : { action: "create_policy", name: name.trim(), rules: validation.data });
            }}>{c.pending ? "Saving…" : "Save draft"}<Check size={15} aria-hidden="true" /></Button> : <Button type="button" disabled={blocked} onClick={() => move(steps[position + 1]!)}>Continue <ArrowRight size={15} aria-hidden="true" /></Button>}
          </div>
        </footer>
        {step === "review" && advancedOpen && <p className="mt-3 text-xs text-[var(--color-muted)]">Apply your JSON changes or close the advanced editor before saving.</p>}
      </div>
    </div>
  </Card>;
}

interface SimulationSummary {
  allowedUnderA: string[];
  allowedUnderB: string[];
  blockedUnderA: string[];
  blockedUnderB: string[];
  recommendedProviderA: string | null;
  recommendedProviderB: string | null;
  recommendationChanged: boolean;
  rulesResponsibleForChanges: string[];
}

function SimulationResult({ result, providers }: { result: SimulationSummary; providers: Array<{ slug: string; name: string }> }) {
  const nameOf = (slug: string | null) => (slug ? providers.find((p) => p.slug === slug)?.name ?? slug : "none");
  const newlyBlocked = result.blockedUnderB.filter((s) => !result.blockedUnderA.includes(s));
  const newlyAllowed = result.allowedUnderB.filter((s) => !result.allowedUnderA.includes(s));
  return (
    <ResultNotice
      tone={result.recommendationChanged ? "warn" : "good"}
      title={result.recommendationChanged ? "This draft changes the recommendation" : "Recommendation unchanged"}
      raw={result}
    >
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-muted)]">Current version</dt>
          <dd>
            {nameOf(result.recommendedProviderA)} · {result.allowedUnderA.length} allowed / {result.blockedUnderA.length} blocked
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-muted)]">This draft</dt>
          <dd>
            {nameOf(result.recommendedProviderB)} · {result.allowedUnderB.length} allowed / {result.blockedUnderB.length} blocked
          </dd>
        </div>
      </dl>
      {newlyBlocked.length ? <p className="mt-2">Newly blocked: {newlyBlocked.map(nameOf).join(", ")}</p> : null}
      {newlyAllowed.length ? <p className="mt-1">Newly allowed: {newlyAllowed.map(nameOf).join(", ")}</p> : null}
      {result.rulesResponsibleForChanges.length ? (
        <p className="mt-1">Rules responsible: {result.rulesResponsibleForChanges.join(", ")}</p>
      ) : null}
    </ResultNotice>
  );
}

export function DecisionForm({
  policies,
  providers,
  options,
  entityCountry = "IN",
}: {
  policies: Array<{ id: string; name: string }>;
  providers: Array<{ slug: string; name: string }>;
  options: IntentOptions;
  entityCountry?: string;
}) {
  const [mode, setMode] = useState<"enforce" | "optimize">("enforce");
  const [provider, setProvider] = useState(providers[0]?.slug ?? "");
  const [policyId, setPolicy] = useState(policies[0]?.id ?? "");
  const [intent, setIntent] = useState<IntentDraft>(() => defaultIntentDraft(entityCountry));
  const c = useCommand();
  const missing = [...missingIntentFields(intent), ...(mode === "enforce" && !provider ? ["provider"] : [])];
  const providerOptions: PickerOption[] = providers.map((p) => ({ value: p.slug, label: p.name }));

  return (
    <Card className="product-panel product-form">
      <div className="product-panel-head">
        <div>
          <span className="product-index">EVALUATION / NEW REQUEST</span>
          <h2 className="mt-1">Evaluate a payment</h2>
          <p>Pick the route and how Railor should assess it. Every field is a click; typing only searches.</p>
        </div>
        <span className="product-badge" data-tone="neutral">No transfer</span>
      </div>
      <div className="space-y-6 p-5 sm:p-7">
        {!policies.length ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-[var(--color-line-strong)] bg-[var(--color-paper)] p-4">
            <div>
              <p className="text-[14px] font-semibold">No active policy yet</p>
              <p className="text-[12.5px] text-[var(--color-muted)]">Every decision is evaluated against an active policy. Create one — the defaults are sensible — and activate it.</p>
            </div>
            <Link href="/app/policies" className="rounded-full bg-[var(--color-ink)] px-4 py-2 text-[13px] font-bold text-white transition hover:bg-[var(--color-orange-deep)]">
              Create a policy →
            </Link>
          </div>
        ) : null}

        <div className="grid gap-5 md:grid-cols-2">
          <FieldBlock label="Mode">
            <Segmented
              label="Mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: "enforce", label: "Enforce", hint: "Check the provider you plan to use" },
                { value: "optimize", label: "Optimize", hint: "Rank every eligible provider" },
              ]}
            />
          </FieldBlock>
          {policies.length ? (
            <FieldBlock label="Active policy">
              {policies.length <= 3 ? (
                <Segmented label="Active policy" value={policyId} onChange={setPolicy} options={policies.map((p) => ({ value: p.id, label: p.name }))} />
              ) : (
                <SmartPicker
                  options={policies.map((p) => ({ value: p.id, label: p.name }))}
                  value={policyId ? [policyId] : []}
                  onChange={(next) => setPolicy(next[0] ?? "")}
                  suggestionCount={4}
                />
              )}
            </FieldBlock>
          ) : null}
        </div>

        {mode === "enforce" ? (
          <FieldBlock label="Proposed provider" hint="The provider you intend to route this payment through.">
            <SmartPicker
              renderMark={providerMark}
              options={providerOptions}
              value={provider ? [provider] : []}
              onChange={(next) => setProvider(next[0] ?? "")}
              placeholder="Search providers…"
              suggestionCount={5}
            />
          </FieldBlock>
        ) : null}

        <IntentBuilder value={intent} onChange={setIntent} options={options} detectedEntity={entityCountry} />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={c.pending || !policyId || missing.length > 0}
            onClick={() => c.run({ action: "decision", mode, provider, policyId, intent: intentFromDraft(intent) })}
          >
            {c.pending ? "Evaluating…" : "Evaluate payment"}
          </Button>
          {missing.length ? <span className="text-[12px] text-[var(--color-muted)]">Still needed: {missing.join(", ")}.</span> : null}
        </div>
        {c.error && <p role="alert" className="text-sm text-red-700">{c.error}</p>}
      </div>
    </Card>
  );
}

export function ControlButton({
  command,
  children,
  variant,
}: {
  command: Record<string, unknown>;
  children: React.ReactNode;
  variant?: "primary" | "ghost";
}) {
  const c = useCommand();
  return (
    <span className="inline-flex flex-col gap-2">
      <Button size="sm" variant={variant} disabled={c.pending} onClick={() => c.run(command)}>
        {c.pending ? "Working…" : children}
      </Button>
      {c.error && <span role="alert" className="text-sm text-red-700">{c.error}</span>}
    </span>
  );
}

const REVIEW_NOTES: Record<string, string[]> = {
  approve: ["Route evidence reviewed", "Amount within expected range", "Counterparty known"],
  reject: ["Evidence too old", "Provider not approved for this route", "Needs more information"],
  revoke: ["Conditions changed since approval", "Approved in error"],
};

export function ApprovalReview({ id, status }: { id: string; status: string }) {
  const [comment, setComment] = useState("");
  const c = useCommand();
  if (!["pending", "approved"].includes(status)) return null;
  const actions = status === "pending" ? ["approve", "reject"] : ["revoke"];
  const suggestions = actions.flatMap((a) => REVIEW_NOTES[a] ?? []);
  return (
    <div className="space-y-3">
      <label className="block text-sm">
        Review comment
        <textarea className={field} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((note) => (
          <PresetChip key={note} active={comment === note} onClick={() => setComment(note)}>
            {note}
          </PresetChip>
        ))}
      </div>
      <div className="flex gap-2">
        {actions.map((review) => (
          <Button key={review} disabled={c.pending || !comment.trim()} title={comment.trim() ? undefined : "Add a short review comment first (pick one above or write your own)"} onClick={() => c.run({ action: "approval", id, review, comment })}>
            {review}
          </Button>
        ))}
      </div>
      {c.error && <p role="alert" className="text-red-700">{c.error}</p>}
    </div>
  );
}
