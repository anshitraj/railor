"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Clock3, DollarSign, Route, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { ROUTING_PRESET_LABEL, ROUTING_WEIGHTS, type PaymentRoutePlan, type RoutingPreset } from "@railor/core/payments-view";
import { Button, SmartPicker, type PickerOption } from "@railor/ui";
import { previewRouteAction, updateRoutingSettingsAction } from "../../../app/app/payments/actions";
import { FieldBlock, NumberWithPresets, Segmented, Toggle } from "../form-kit";
import { IntentBuilder, defaultIntentDraft, intentFromDraft, missingIntentFields, type IntentDraft, type IntentOptions } from "../intent-builder";
import { ProviderLogo } from "../provider-logo";
import { RoutePlanView } from "./route-plan-view";
import styles from "./routing-settings.module.css";

const providerMark = (option: PickerOption) => <ProviderLogo slug={option.value} name={option.label} size={18} />;
const PRESET_META: Record<RoutingPreset, { note: string; icon: typeof Route }> = {
  balanced: { note: "A steady blend of cost, speed, health and reliability.", icon: Route },
  cheapest: { note: "Prioritise the lowest verified cost among eligible routes.", icon: DollarSign },
  fastest: { note: "Prefer the shortest known settlement path.", icon: Zap },
  most_reliable: { note: "Give observed reliability the strongest voice.", icon: ShieldCheck },
};

export function RoutingWorkspace({ initial, providers, canEdit, canPreview, options, entityCountry, initialTab }: {
  initial: Parameters<typeof RoutingSettings>[0]["initial"]; providers: PickerOption[]; canEdit: boolean; canPreview: boolean;
  options: IntentOptions; entityCountry?: string; initialTab: "settings" | "preview";
}) {
  const [tab, setTab] = useState(initialTab);
  return <div className={styles.workspace}>
    <nav className={styles.tabs} aria-label="Routing workspace">
      <button type="button" aria-pressed={tab === "settings"} onClick={() => setTab("settings")}><ShieldCheck size={16} />Routing settings</button>
      {canPreview ? <button type="button" aria-pressed={tab === "preview"} onClick={() => setTab("preview")}><Route size={16} />Preview a route</button> : null}
    </nav>
    <p className={styles.readOnly}>Previews use your last saved routing profile.</p>
    <div hidden={tab !== "settings"}><RoutingSettings initial={initial} providers={providers} canEdit={canEdit} /></div>
    {canPreview ? <div hidden={tab !== "preview"}><RouteTester options={options} entityCountry={entityCountry} /></div> : null}
  </div>;
}

export function RoutingSettings({
  initial,
  providers,
  canEdit,
}: {
  initial: { routingPreset: string; preferredProviders: string[]; blockedProviders: string[]; fallbackEnabled: boolean; maxAttempts: number };
  providers: PickerOption[];
  canEdit: boolean;
}) {
  const [state, setState] = useState({ ...initial, routingPreset: initial.routingPreset as RoutingPreset });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const [baseline, setBaseline] = useState(JSON.stringify(initial));
  const dirty = JSON.stringify(state) !== baseline;
  const go = (next: number) => { setStep(next); requestAnimationFrame(() => heading.current?.focus()); };
  const router = useRouter();
  const weights = ROUTING_WEIGHTS[state.routingPreset];

  const save = () =>
    start(async () => {
      setError("");
      try {
      const result = await updateRoutingSettingsAction(state);
      if (!result.ok) setError(result.error);
      else {
        setSaved(true);
        setBaseline(JSON.stringify(state));
        router.refresh();
      }
      } catch { setError("Could not save routing. Check your connection and try again."); }
    });

  return (
    <section className={styles.shell}>
      <div className={styles.profileBar}>
        <span className={styles.eyebrow}>YOUR ROUTING PROFILE</span>
        <span className={styles.profileStatus}><span className={styles.statusDot} /><strong>{ROUTING_PRESET_LABEL[state.routingPreset]}</strong><small>{dirty ? "Unsaved changes" : "Saved"}</small></span>
      </div>
      <div className={styles.body}>
        <ol className={styles.steps} aria-label="Settings steps">{["Priority", "Providers", "Fallback", "Review"].map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
        <h3 ref={heading} tabIndex={-1} className={styles.stepTitle}>{["What matters most?", "Which providers can take part?", "What happens after a rejection?", "Review your routing profile"][step]}</h3>
        {!canEdit ? <p className={styles.readOnly}>Read only. Workspace owners and admins can change routing.</p> : null}
        <fieldset disabled={!canEdit || pending} className={styles.fields}>
        {step === 0 ? <>
        <div className={styles.presetGrid} role="radiogroup" aria-label="Routing preference">
          {(Object.keys(ROUTING_WEIGHTS) as RoutingPreset[]).map((preset, index, all) => { const meta = PRESET_META[preset]; const Icon = meta.icon; return <button key={preset} type="button" role="radio" tabIndex={state.routingPreset === preset ? 0 : -1} aria-checked={state.routingPreset === preset} className={styles.preset} data-selected={state.routingPreset === preset} onKeyDown={(event) => { if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(event.key)) return; event.preventDefault(); const next = (index + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : all.length - 1)) % all.length; setState(s => ({ ...s, routingPreset: all[next]! })); setSaved(false); (event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next])?.focus(); }} onClick={() => { setState((s) => ({ ...s, routingPreset: preset })); setSaved(false); }}><span className={styles.presetIcon}><Icon size={17} /></span><span><strong>{ROUTING_PRESET_LABEL[preset]}</strong><small>{meta.note}</small></span>{state.routingPreset === preset ? <Check size={16} className={styles.presetCheck} /> : null}</button>; })}
        </div>
        <details className={styles.weightDetails}><summary>How this preference is weighted</summary><div className={styles.weightPanel}><div className={styles.weightHeader}><div><span className={styles.sectionKicker}>RANKING SIGNALS</span><h3>{ROUTING_PRESET_LABEL[state.routingPreset]} weighting</h3></div><Sparkles size={18} /></div><div className={styles.weights}>{Object.entries(weights).map(([k, w]) => <div key={k} className={styles.weight}><div><span>{k}</span><b>{w}</b></div><span className={styles.track}><i style={{ width: `${w}%` }} /></span></div>)}</div><p className={styles.helper}>These are ranking signals only. Eligibility, policy and account connection remain hard gates.</p></div></details>
        </> : null}
        {step === 1 ? <>
        <div className={styles.controlGrid}>
          <div className={styles.controlCard}><FieldBlock label="Preferred providers" hint="Give these providers the preference signal.">
            <SmartPicker multiple renderMark={providerMark} options={providers} value={state.preferredProviders} onChange={(v) => { setState((s) => ({ ...s, preferredProviders: v })); setSaved(false); }} suggestionCount={4} />
          </FieldBlock></div>
          <div className={styles.controlCard}><FieldBlock label="Never route through" hint="Excluded from every payment route.">
            <SmartPicker multiple renderMark={providerMark} options={providers} value={state.blockedProviders} onChange={(v) => { setState((s) => ({ ...s, blockedProviders: v })); setSaved(false); }} suggestionCount={4} />
          </FieldBlock></div>
        </div>
        </> : null}
        {step === 2 ? <>
        <div className={styles.controlGrid}>
          <div className={styles.controlCard}><Toggle
            label="Fall back to the next provider"
            hint="Only after a definitive rejection. An ambiguous outcome is never re-routed."
            checked={state.fallbackEnabled}
            onChange={(v) => { setState((s) => ({ ...s, fallbackEnabled: v })); setSaved(false); }}
          /></div><div className={styles.controlCard}><NumberWithPresets
            label="Maximum providers to try"
            value={state.maxAttempts}
            onChange={(v) => { setState((s) => ({ ...s, maxAttempts: Math.max(1, Math.min(5, Math.round(v ?? 1))) })); setSaved(false); }}
            presets={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))}
            min={1}
            step="1"
          /></div>
        </div>
        </> : null}
        </fieldset>
        {step === 3 ? <dl className={styles.review}>
          <div><dt>Priority</dt><dd>{ROUTING_PRESET_LABEL[state.routingPreset]}</dd></div>
          <div><dt>Preferred providers</dt><dd>{state.preferredProviders.map(slug => providers.find(p => p.value === slug)?.label ?? slug).join(", ") || "No preference"}</dd></div>
          <div><dt>Excluded providers</dt><dd>{state.blockedProviders.map(slug => providers.find(p => p.value === slug)?.label ?? slug).join(", ") || "None"}</dd></div>
          <div><dt>Fallback</dt><dd>{state.fallbackEnabled ? `Up to ${state.maxAttempts} providers, only after a definitive rejection` : "Disabled — first provider only"}</dd></div>
        </dl> : null}
        <div className={styles.saveBar}><div>{saved ? <span role="status" className={styles.saved}><Check size={14} />Routing profile saved.</span> : <span className={styles.unsaved}>{dirty ? "Unsaved changes" : "Your saved routing profile"}</span>}{error ? <p role="alert">{error}</p> : null}</div><div className={styles.actions}>{step > 0 ? <Button variant="ghost" disabled={pending} onClick={() => go(step - 1)}>Back</Button> : null}{step < 3 ? <Button onClick={() => go(step + 1)}>Continue <ArrowRight size={14} /></Button> : <Button disabled={!canEdit || pending || !dirty} onClick={save}>{pending ? "Saving…" : "Save routing"}<ArrowRight size={14} /></Button>}</div></div>
      </div>
    </section>
  );
}

export function RouteTester({ options, entityCountry }: { options: IntentOptions; entityCountry?: string }) {
  const [mode, setMode] = useState<"test" | "live">("test");
  const [intent, setIntent] = useState<IntentDraft>(() => ({ ...defaultIntentDraft(entityCountry), sourceKind: "asset" }));
  const [result, setResult] = useState<{ decisionStatus: string; outcome: { status: string; failureMessage?: string }; plan: PaymentRoutePlan } | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const go = (next: number) => { setStep(next); requestAnimationFrame(() => heading.current?.focus()); };
  const missing = [...missingIntentFields(intent), ...(!intent.destinationCurrency ? ["destination currency"] : []), ...(intent.sourceKind === "asset" && !intent.sourceNetwork ? ["source network"] : [])];
  const stepMissing = step === 0 ? missing.filter(field => !["amount", "destination country", "destination currency"].includes(field)) : step === 1 ? missing.filter(field => ["destination country", "destination currency"].includes(field)) : missing;
  return (
    <section className={styles.tester}>
      <div className={styles.hero}><div className={styles.heroCopy}><span className={styles.eyebrow}>ROUTING / SIMULATION</span><h2>Trace a route before you pay.</h2><p>Run a sample through your current policy and routing profile. Nothing is recorded, sent or charged.</p></div><div className={styles.testerBadge}><Route size={17} /><span>safe preview<small>no payment created</small></span></div></div>
      <div className={styles.body}>
        <ol className={styles.steps} aria-label="Preview steps">{["Funding", "Destination", "Review"].map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
        <h3 className={styles.stepTitle} tabIndex={-1} ref={heading}>{["Where is the money coming from?", "Where should it arrive?", "Review the amount and preview"][step]}</h3>
        <fieldset className={styles.fields} disabled={pending}>
        {step === 0 ? <div className={styles.modeRow}><FieldBlock label="Quote environment">
          <Segmented label="Mode" size="sm" value={mode} onChange={next => { setMode(next); setResult(null); setError(""); }} options={[{ value: "test", label: "Sandbox" }, { value: "live", label: "Production" }]} />
        </FieldBlock><span className={styles.modeNote}><Clock3 size={14} /> Both options only preview; neither sends money.</span></div> : null}
        {step === 2 ? <dl className={styles.review}><div><dt>From</dt><dd>{intent.sourceEntityCountry} · {intent.sourceKind === "asset" ? `${intent.sourceAsset} on ${intent.sourceNetwork}` : intent.sourceCurrency}</dd></div><div><dt>To</dt><dd>{intent.destinationCountry} · {intent.destinationCurrency}</dd></div><div><dt>Environment</dt><dd>{mode === "test" ? "Sandbox" : "Production"} · saved routing profile</dd></div></dl> : null}
        <IntentBuilder value={intent} onChange={next => { setIntent(next); setResult(null); setError(""); }} options={options} detectedEntity={entityCountry} section={step === 0 ? "funding" : step === 1 ? "destination" : "amount"} />
        </fieldset>
        <div className={styles.saveBar}><span className={styles.unsaved}>{stepMissing.length ? `Still needed: ${stepMissing.join(", ")}` : "No payment is created."}</span><div className={styles.actions}>{step > 0 ? <Button variant="ghost" disabled={pending} onClick={() => go(step - 1)}>Back</Button> : null}{step < 2 ? <Button disabled={stepMissing.length > 0} onClick={() => go(step + 1)}>Continue <ArrowRight size={14} /></Button> : <Button
          disabled={pending || missing.length > 0}
          onClick={() =>
            start(async () => {
              setError("");
              setResult(null);
              try {
              const r = await previewRouteAction({ mode, intent: intentFromDraft(intent) });
              if (!r.ok) {
                setError(r.error);
                setResult(null);
              } else setResult(r.data as typeof result);
              } catch { setError("Could not preview this route. Check your connection and try again."); }
            })
          }
        >
          {pending ? "Planning…" : "Plan route"}
        </Button>}</div></div>
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        {result && step === 2 ? (
          <div className={styles.result}>
            <p>
              Policy verdict: <strong>{result.decisionStatus.replaceAll("_", " ")}</strong>
              {result.outcome.failureMessage ? <span className="text-[var(--color-muted)]"> — {result.outcome.failureMessage}</span> : null}
            </p>
            <RoutePlanView plan={result.plan} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
