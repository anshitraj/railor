"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ROUTING_PRESET_LABEL, ROUTING_WEIGHTS, type PaymentRoutePlan, type RoutingPreset } from "@railor/core/payments-view";
import { Button, SmartPicker, type PickerOption } from "@railor/ui";
import { previewRouteAction, updateRoutingSettingsAction } from "../../../app/app/payments/actions";
import { FieldBlock, NumberWithPresets, Segmented, Toggle } from "../form-kit";
import { IntentBuilder, defaultIntentDraft, intentFromDraft, missingIntentFields, type IntentDraft, type IntentOptions } from "../intent-builder";
import { ProviderLogo } from "../provider-logo";
import { RoutePlanView } from "./route-plan-view";

const providerMark = (option: PickerOption) => <ProviderLogo slug={option.value} name={option.label} size={18} />;

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
  const router = useRouter();
  const weights = ROUTING_WEIGHTS[state.routingPreset];

  const save = () =>
    start(async () => {
      setError("");
      const result = await updateRoutingSettingsAction(state);
      if (!result.ok) setError(result.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });

  return (
    <div className="product-panel product-form">
      <div className="product-panel-head">
        <div>
          <span className="product-index">ROUTING / POLICY</span>
          <h2 className="mt-1">How Railor picks a provider</h2>
          <p>Eligibility and your policy are hard gates. Among providers that pass, these weights rank them; a failed attempt falls back down the list only when the provider definitively rejected it.</p>
        </div>
      </div>
      <div className="space-y-6 p-5 sm:p-7">
        <FieldBlock label="Optimize for">
          <Segmented
            label="Routing preset"
            value={state.routingPreset}
            onChange={(v) => {
              setState((s) => ({ ...s, routingPreset: v }));
              setSaved(false);
            }}
            options={(Object.keys(ROUTING_WEIGHTS) as RoutingPreset[]).map((p) => ({ value: p, label: ROUTING_PRESET_LABEL[p] }))}
          />
        </FieldBlock>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {Object.entries(weights).map(([k, w]) => (
            <div key={k} className="flex flex-col gap-1 rounded-lg bg-[var(--color-paper)] px-3 py-2">
              <span className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-faint)]">{k}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-[var(--color-sand)]">
                <span className="block h-full rounded-full bg-[var(--color-orange)] transition-all duration-300" style={{ width: `${w}%` }} />
              </span>
              <span className="font-mono text-[12px] tabular">{w}</span>
            </div>
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <FieldBlock label="Preferred providers" hint="Earn the preference weight, in this order.">
            <SmartPicker multiple renderMark={providerMark} options={providers} value={state.preferredProviders} onChange={(v) => { setState((s) => ({ ...s, preferredProviders: v })); setSaved(false); }} suggestionCount={4} />
          </FieldBlock>
          <FieldBlock label="Never route through" hint="Excluded from every payment route.">
            <SmartPicker multiple renderMark={providerMark} options={providers} value={state.blockedProviders} onChange={(v) => { setState((s) => ({ ...s, blockedProviders: v })); setSaved(false); }} suggestionCount={4} />
          </FieldBlock>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Toggle
            label="Fall back to the next provider"
            hint="Only after a definitive rejection. An ambiguous outcome is never re-routed."
            checked={state.fallbackEnabled}
            onChange={(v) => { setState((s) => ({ ...s, fallbackEnabled: v })); setSaved(false); }}
          />
          <NumberWithPresets
            label="Maximum providers to try"
            value={state.maxAttempts}
            onChange={(v) => { setState((s) => ({ ...s, maxAttempts: Math.max(1, Math.min(5, Math.round(v ?? 1))) })); setSaved(false); }}
            presets={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))}
            min={1}
            step="1"
          />
        </div>
        <div className="flex items-center gap-3">
          <Button disabled={!canEdit || pending} onClick={save}>
            {pending ? "Saving…" : "Save routing"}
          </Button>
          {saved ? <span className="text-[12.5px] font-semibold text-[var(--color-ok)]">Saved — new payments use it.</span> : null}
          {!canEdit ? <span className="text-[12px] text-[var(--color-muted)]">Owners and admins change routing.</span> : null}
        </div>
        {error ? <p role="alert" className="text-[12.5px] text-[var(--color-bad)]">{error}</p> : null}
      </div>
    </div>
  );
}

export function RouteTester({ options, entityCountry }: { options: IntentOptions; entityCountry?: string }) {
  const [mode, setMode] = useState<"test" | "live">("test");
  const [intent, setIntent] = useState<IntentDraft>(() => ({ ...defaultIntentDraft(entityCountry), sourceKind: "asset" }));
  const [result, setResult] = useState<{ decisionStatus: string; outcome: { status: string; failureMessage?: string }; plan: PaymentRoutePlan } | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const missing = missingIntentFields(intent);
  return (
    <div className="product-panel product-form">
      <div className="product-panel-head">
        <div>
          <span className="product-index">ROUTING / PLAN A ROUTE</span>
          <h2 className="mt-1">See the route before you pay</h2>
          <p>Runs your live policy and routing against a sample payment. Nothing is recorded or sent.</p>
        </div>
      </div>
      <div className="space-y-5 p-5 sm:p-7">
        <FieldBlock label="Mode">
          <Segmented label="Mode" size="sm" value={mode} onChange={setMode} options={[{ value: "test", label: "Test" }, { value: "live", label: "Live" }]} />
        </FieldBlock>
        <IntentBuilder value={intent} onChange={setIntent} options={options} detectedEntity={entityCountry} />
        <Button
          disabled={pending || missing.length > 0}
          onClick={() =>
            start(async () => {
              setError("");
              const r = await previewRouteAction({ mode, intent: intentFromDraft(intent) });
              if (!r.ok) {
                setError(r.error);
                setResult(null);
              } else setResult(r.data as typeof result);
            })
          }
        >
          {pending ? "Planning…" : "Plan route"}
        </Button>
        {error ? <p role="alert" className="text-[12.5px] text-[var(--color-bad)]">{error}</p> : null}
        {result ? (
          <div className="railor-page-in space-y-3">
            <p className="text-[13px]">
              Policy verdict: <strong>{result.decisionStatus.replaceAll("_", " ")}</strong>
              {result.outcome.failureMessage ? <span className="text-[var(--color-muted)]"> — {result.outcome.failureMessage}</span> : null}
            </p>
            <RoutePlanView plan={result.plan} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
