"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import type { PaymentRoutePlan } from "@railor/core/payments-view";
import { Button, Card, cn } from "@railor/ui";
import { createPaymentAction, previewRouteAction } from "../../../app/app/payments/actions";
import { FieldBlock, PresetChip, Segmented } from "../form-kit";
import { IntentBuilder, defaultIntentDraft, draftFromPartial, intentFromDraft, missingIntentFields, type IntentDraft, type IntentOptions } from "../intent-builder";
import { BeneficiaryForm, type BeneficiarySummary } from "./beneficiary-form";
import { RoutePlanView } from "./route-plan-view";

const STORAGE_KEY = "railor.payment-draft.v1";

interface Preview {
  decisionStatus: string;
  outcome: { status: string; failureCode?: string; failureMessage?: string };
  plan: PaymentRoutePlan;
}

export function PaymentComposer({
  options,
  corridors,
  beneficiaries: initialBeneficiaries,
  entityCountry,
  prefill,
  live,
  hasActivePolicy,
}: {
  options: IntentOptions;
  corridors: Array<{ id: string; label: string; query: Record<string, unknown> }>;
  beneficiaries: BeneficiarySummary[];
  entityCountry?: string;
  /** Arriving from a price check: that pair, amount and provider win over any saved draft. */
  prefill?: { sourceCurrency: string; destinationCurrency: string; destinationCountry?: string; amount: number; provider?: string };
  live: { available: boolean; reason: string };
  hasActivePolicy: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"test" | "live">("test");
  const [intent, setIntent] = useState<IntentDraft>(() =>
    prefill
      ? {
          ...defaultIntentDraft(entityCountry),
          sourceKind: "fiat",
          sourceCurrency: prefill.sourceCurrency,
          destinationCurrency: prefill.destinationCurrency,
          destinationCountry: prefill.destinationCountry ?? "",
          amount: prefill.amount,
        }
      : { ...defaultIntentDraft(entityCountry), sourceKind: "asset" },
  );
  const [beneficiaryId, setBeneficiaryId] = useState("");
  const [beneficiaries, setBeneficiaries] = useState(initialBeneficiaries);
  const [adding, setAdding] = useState(false);
  const [pin, setPin] = useState(prefill?.provider ?? "");
  const [reference, setReference] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  // Law E7: a half-built payment survives a reload.
  useEffect(() => {
    if (prefill) return;
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null") as { step: number; mode: "test" | "live"; intent: IntentDraft; beneficiaryId: string; reference: string } | null;
      if (saved) {
        setStep(Math.min(saved.step, 1));
        setMode(saved.mode);
        setIntent(saved.intent);
        setBeneficiaryId(saved.beneficiaryId);
        setReference(saved.reference);
      }
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ step, mode, intent, beneficiaryId, reference }));
    } catch {
      /* ignore */
    }
  }, [step, mode, intent, beneficiaryId, reference]);

  const missing = missingIntentFields(intent).concat(intent.destinationCurrency ? [] : ["destination currency"]);
  const matching = useMemo(
    () => beneficiaries.filter((b) => b.country === intent.destinationCountry && b.currency === intent.destinationCurrency),
    [beneficiaries, intent.destinationCountry, intent.destinationCurrency],
  );
  const selected = matching.find((b) => b.id === beneficiaryId);

  const runPreview = (pinned = pin) =>
    start(async () => {
      setError("");
      const result = await previewRouteAction({ mode, intent: intentFromDraft(intent), pinnedProvider: pinned || undefined });
      if (!result.ok) {
        setError(result.error);
        setPreview(null);
        return;
      }
      setPreview(result.data as Preview);
    });

  const goReview = () => {
    setStep(2);
    runPreview();
  };

  const create = () =>
    start(async () => {
      setError("");
      const result = await createPaymentAction({
        mode,
        intent: intentFromDraft(intent),
        beneficiaryId,
        pinnedProvider: pin || undefined,
        reference: reference.trim() || undefined,
        idempotencyKey: `ui_${crypto.randomUUID()}`,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      if (result.href) router.push(result.href);
    });

  const steps = ["Route", "Beneficiary", "Review"];

  if (!hasActivePolicy) {
    return (
      <Card className="flex flex-col gap-3 p-6">
        <p className="text-[15px] font-semibold">Activate a policy first</p>
        <p className="text-[13px] text-[var(--color-muted)]">Every payment is evaluated against your active policy before it can be sent — that is what makes approvals, limits and provider rules enforceable.</p>
        <a href="/app/policies" className="w-fit rounded-full bg-[var(--color-ink)] px-4 py-2 text-[13px] font-bold text-white">
          Create a policy →
        </a>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex items-center gap-2" aria-label="Progress">
        {steps.map((label, i) => (
          <li key={label} className="flex flex-1 flex-col gap-1.5">
            <span className={cn("h-1 rounded-full transition-colors duration-300", i <= step ? "bg-[var(--color-orange)]" : "bg-[var(--color-line)]")} />
            <span className={cn("text-[11.5px] font-semibold", i === step ? "text-[var(--color-ink)]" : "text-[var(--color-faint)]")}>
              {i + 1}. {label}
            </span>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <Card className="railor-page-in flex flex-col gap-5 p-5 sm:p-6">
          <FieldBlock label="Mode" hint={mode === "live" && !live.available ? live.reason : mode === "test" ? "Nothing real moves. Providers you haven't connected in sandbox are simulated." : "Real funds, from your own production provider account."}>
            <Segmented
              label="Mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: "test", label: "Test", hint: "Sandbox & simulation" },
                { value: "live", label: "Live", hint: live.available ? "Real money" : "Not enabled yet" },
              ]}
            />
          </FieldBlock>
          {corridors.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-[var(--color-faint)]">From a saved corridor</span>
              {corridors.slice(0, 6).map((c) => (
                <PresetChip key={c.id} active={false} onClick={() => setIntent((prev) => ({ ...draftFromPartial(c.query, entityCountry), amount: prev.amount }))}>
                  {c.label}
                </PresetChip>
              ))}
            </div>
          ) : null}
          <IntentBuilder value={intent} onChange={setIntent} options={options} detectedEntity={entityCountry} />
          <div className="flex items-center gap-3">
            <Button disabled={missing.length > 0 || (mode === "live" && !live.available)} onClick={() => setStep(1)}>
              Continue <ArrowRight size={15} />
            </Button>
            {missing.length ? <span className="text-[12px] text-[var(--color-muted)]">Still needed: {missing.join(", ")}.</span> : null}
          </div>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card className="railor-page-in flex flex-col gap-4 p-5 sm:p-6">
          <p className="text-[13px] text-[var(--color-muted)]">
            Who receives {intent.destinationCurrency} in {intent.destinationCountry}?
          </p>
          {matching.length ? (
            <div role="radiogroup" aria-label="Beneficiary" className="grid gap-2 sm:grid-cols-2">
              {matching.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={beneficiaryId === b.id}
                  onClick={() => setBeneficiaryId(b.id)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition",
                    beneficiaryId === b.id ? "border-[var(--color-orange)] bg-[var(--color-lavender)]" : "border-[var(--color-line)] hover:-translate-y-px hover:border-[var(--color-line-strong)]",
                  )}
                >
                  <span className="text-[14px] font-semibold">{b.label}</span>
                  <span className="font-mono text-[12px] text-[var(--color-muted)]">{b.displayHint}</span>
                  <span className="text-[11.5px] text-[var(--color-faint)]">{b.holderName}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-[var(--color-line-strong)] p-3 text-[12.5px] text-[var(--color-muted)]">No saved beneficiary receives {intent.destinationCurrency} in {intent.destinationCountry} yet — add one below.</p>
          )}
          {adding || !matching.length ? (
            <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] p-4">
              <BeneficiaryForm
                countries={options.countries}
                currencies={options.currencies}
                initialCountry={intent.destinationCountry}
                initialCurrency={intent.destinationCurrency}
                lockDestination
                onCreated={(b) => {
                  setBeneficiaries((list) => (list.some((x) => x.id === b.id) ? list : [b, ...list]));
                  setBeneficiaryId(b.id);
                  setAdding(false);
                }}
              />
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="inline-flex w-fit items-center gap-1 text-[12.5px] font-semibold text-[var(--color-orange-deep)]">
              <Plus size={14} /> Add a beneficiary
            </button>
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setStep(0)}>
              <ArrowLeft size={15} /> Back
            </Button>
            <Button disabled={!selected} onClick={goReview}>
              Review route <ArrowRight size={15} />
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card className="railor-page-in flex flex-col gap-5 p-5 sm:p-6">
          <div className="grid gap-3 rounded-xl bg-[var(--color-paper)] p-4 text-[13px] sm:grid-cols-3">
            <Summary label="Send" value={`${intent.amount?.toLocaleString("en-US")} ${intent.sourceKind === "fiat" ? intent.sourceCurrency : `${intent.sourceAsset} · ${intent.sourceNetwork}`}`} />
            <Summary label="To" value={`${selected?.label ?? "—"} · ${selected?.displayHint ?? ""}`} />
            <Summary label="Mode" value={mode === "live" ? "Live — real money" : "Test"} strong={mode === "live"} />
          </div>

          {pending && !preview ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              <div className="skeleton h-5 w-56" />
              <div className="skeleton h-20 w-full" />
              <div className="skeleton h-20 w-full opacity-70" />
            </div>
          ) : preview ? (
            <>
              <div
                className={cn(
                  "rounded-xl border px-4 py-3 text-[13px]",
                  preview.outcome.status === "ready" ? "border-[var(--color-ok)]/30 bg-[var(--color-ok-bg)]" : preview.outcome.status === "requires_approval" ? "border-[var(--color-warn)]/30 bg-[var(--color-warn-bg)]" : "border-[var(--color-bad)]/30 bg-[var(--color-bad-bg)]",
                )}
              >
                <p className="font-semibold">
                  {preview.outcome.status === "ready"
                    ? "Policy allows this payment."
                    : preview.outcome.status === "requires_approval"
                      ? "Policy requires an independent approval before sending."
                      : "This payment would be blocked."}
                </p>
                {preview.outcome.failureMessage ? <p className="mt-0.5 text-[12.5px]">{preview.outcome.failureMessage}</p> : null}
              </div>
              <FieldBlock label="Provider" hint="Auto uses the route order below, falling back on a definitive rejection. Pinning tries only that provider.">
                <div className="flex flex-wrap gap-1.5">
                  <PresetChip
                    active={!pin}
                    onClick={() => {
                      setPin("");
                      runPreview("");
                    }}
                  >
                    Auto-route
                  </PresetChip>
                  {[...preview.plan.candidates, ...preview.plan.excluded].map((c) => (
                    <PresetChip
                      key={c.providerSlug}
                      active={pin === c.providerSlug}
                      onClick={() => {
                        setPin(c.providerSlug);
                        runPreview(c.providerSlug);
                      }}
                    >
                      {c.providerName}
                    </PresetChip>
                  ))}
                </div>
              </FieldBlock>
              <RoutePlanView plan={preview.plan} />
              <label className="flex max-w-md flex-col gap-1 text-[12px] font-bold text-[var(--color-ink-soft)]">
                Reference (optional)
                <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={140} placeholder="Invoice INV-2041" className="product-field !mt-0 font-normal" />
              </label>
            </>
          ) : null}

          {error ? <p role="alert" className="text-[12.5px] text-[var(--color-bad)]">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft size={15} /> Back
            </Button>
            <Button disabled={pending || !preview} onClick={create}>
              {pending ? "Working…" : "Create payment"}
            </Button>
            <span className="text-[12px] text-[var(--color-muted)]">Creating records the decision and route. You send it on the next screen.</span>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Summary({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-faint)]">{label}</span>
      <span className={cn("font-semibold", strong && "text-[var(--color-orange-deep)]")}>{value}</span>
    </div>
  );
}
