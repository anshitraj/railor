"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, SmartPicker, type PickerOption } from "@railor/ui";
import { controlCommand } from "../../app/app/control-actions";
import { CurrencyLogo } from "../marketing/currency-logo";
import { NetworkLogo } from "../marketing/network-logo";
import { FieldBlock, NumberWithPresets, PresetChip, ResultNotice, Segmented, Toggle } from "./form-kit";
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

type Rules = Record<string, unknown>;

const SAFEGUARDS: Array<[string, string, string]> = [
  ["requireExactRouteEvidence", "Require exact route evidence", "Only routes confirmed end-to-end by a source pass."],
  ["requireConfirmedEntityEligibility", "Require confirmed entity eligibility", "Unknown onboarding eligibility counts as a fail, not a pass."],
  ["requireCustomerConnectedProvider", "Require connected provider", "Only providers your workspace has connected."],
  ["requireLiveQuote", "Require live quote", "A fresh quote must exist before a route can be allowed."],
  ["denyDuringActiveIncident", "Block during active incidents", "Degraded providers are excluded until they recover."],
];

function listValue(rules: Rules, key: string): string[] {
  const value = rules[key];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function numberValue(rules: Rules, key: string): number | undefined {
  const value = rules[key];
  return typeof value === "number" ? value : undefined;
}

export function PolicyEditor({
  policyId,
  initialRules = {},
  initialName = "Production policy",
  canEdit,
  providers,
  options,
  entityCountry,
}: {
  policyId?: string;
  initialRules?: Rules;
  initialName?: string;
  canEdit: boolean;
  providers: Array<{ slug: string; name: string }>;
  options: IntentOptions;
  entityCountry?: string;
}) {
  const [name, setName] = useState(initialName);
  const [rules, setRules] = useState<Rules>(initialRules);
  const [intent, setIntent] = useState<IntentDraft>(() => defaultIntentDraft(entityCountry));
  const [advanced, setAdvanced] = useState(JSON.stringify(initialRules, null, 2));
  const [simulation, setSimulation] = useState<SimulationSummary | null>(null);
  const c = useCommand();
  const sim = useCommand();
  const update = (key: string, value: unknown) =>
    setRules((previous) => {
      const next = { ...previous, [key]: value };
      if (value === undefined) delete next[key];
      return next;
    });
  const providerOptions: PickerOption[] = providers.map((p) => ({ value: p.slug, label: p.name }));
  const enabledCount = SAFEGUARDS.filter(([key]) => Boolean(rules[key])).length;

  return (
    <Card className="product-panel product-form">
      <div className="product-panel-head">
        <div>
          <span className="product-index">CONFIGURATION / {policyId ? "NEW VERSION" : "NEW POLICY"}</span>
          <h2 className="mt-1">{policyId ? "Create a new version" : "Create policy"}</h2>
          <p>Set guardrails with clicks, simulate them against a real route, then save a draft for review.</p>
        </div>
        <span className="product-badge" data-tone="warn">Draft only</span>
      </div>
      <div className="space-y-7 p-5 sm:p-7">
        {!policyId && (
          <label className="block max-w-md">
            Policy name
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}

        <section className="space-y-3">
          <p className="product-index">REQUIRED SAFEGUARDS · {enabledCount} OF {SAFEGUARDS.length} ON</p>
          <div className="grid gap-2 md:grid-cols-2">
            {SAFEGUARDS.map(([key, label, hint]) => (
              <Toggle key={key} label={label} hint={hint} checked={Boolean(rules[key])} onChange={(v) => update(key, v)} />
            ))}
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <NumberWithPresets
            label="Approval above amount (intent currency)"
            value={numberValue(rules, "humanApprovalAboveAmount")}
            onChange={(v) => update("humanApprovalAboveAmount", v)}
            presets={[
              { value: 1_000, label: "1K" },
              { value: 10_000, label: "10K" },
              { value: 100_000, label: "100K" },
            ]}
            offLabel="No approval step"
          />
          <NumberWithPresets
            label="Maximum evidence age (hours)"
            value={numberValue(rules, "maximumEvidenceAgeHours")}
            onChange={(v) => update("maximumEvidenceAgeHours", v === undefined ? undefined : Math.max(1, Math.round(v)))}
            presets={[
              { value: 24, label: "1 day" },
              { value: 72, label: "3 days" },
              { value: 168, label: "7 days" },
              { value: 720, label: "30 days" },
            ]}
            offLabel="Any age"
            step="1"
          />
          <NumberWithPresets
            label="Maximum known cost (basis points)"
            value={numberValue(rules, "maximumKnownCostBps")}
            onChange={(v) => update("maximumKnownCostBps", v)}
            presets={[
              { value: 25, label: "0.25%" },
              { value: 50, label: "0.5%" },
              { value: 100, label: "1%" },
              { value: 200, label: "2%" },
            ]}
            offLabel="No cap"
          />
          <NumberWithPresets
            label="Maximum settlement time (minutes)"
            value={numberValue(rules, "maximumEtaMinutes")}
            onChange={(v) => update("maximumEtaMinutes", v)}
            presets={[
              { value: 15, label: "15 min" },
              { value: 60, label: "1 hour" },
              { value: 1440, label: "1 day" },
            ]}
            offLabel="No cap"
          />
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <FieldBlock label="Allowed providers" hint="Leave empty to allow any eligible provider.">
            <SmartPicker
              multiple
              renderMark={providerMark}
              options={providerOptions}
              value={listValue(rules, "providerAllowlist")}
              onChange={(v) => update("providerAllowlist", v.length ? v : undefined)}
              placeholder="Search providers…"
              suggestionCount={4}
            />
          </FieldBlock>
          <FieldBlock label="Blocked providers" hint="Never recommended, whatever their score.">
            <SmartPicker
              multiple
              renderMark={providerMark}
              options={providerOptions}
              value={listValue(rules, "providerDenylist")}
              onChange={(v) => update("providerDenylist", v)}
              placeholder="Search providers…"
              suggestionCount={4}
            />
          </FieldBlock>
          <FieldBlock label="Allowed assets" hint="Empty means any asset.">
            <SmartPicker
              multiple
              renderMark={assetMark}
              options={options.assets}
              value={listValue(rules, "allowedAssets")}
              onChange={(v) => update("allowedAssets", v.length ? v : undefined)}
              suggestionCount={5}
            />
          </FieldBlock>
          <FieldBlock label="Allowed networks" hint="Empty means any network.">
            <SmartPicker
              multiple
              renderMark={networkMark}
              options={options.networks}
              value={listValue(rules, "allowedNetworks")}
              onChange={(v) => update("allowedNetworks", v.length ? v : undefined)}
              suggestionCount={5}
            />
          </FieldBlock>
        </section>

        <details
          className="rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-3"
          onToggle={(e) => {
            if (e.currentTarget.open) setAdvanced(JSON.stringify(rules, null, 2));
          }}
        >
          <summary className="cursor-pointer text-sm font-semibold">All policy rules (advanced JSON)</summary>
          <label className="mt-3 block text-sm">
            Rules JSON
            <textarea className={`${field} font-mono`} rows={12} value={advanced} onChange={(e) => setAdvanced(e.target.value)} />
          </label>
          <Button
            variant="ghost"
            onClick={() => {
              try {
                const value = JSON.parse(advanced);
                if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
                setRules(value);
                c.setError("");
              } catch {
                c.setError("Rules must be a JSON object.");
              }
            }}
          >
            Apply JSON to draft
          </Button>
        </details>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={!canEdit || c.pending || (!policyId && !name.trim())}
            onClick={() => c.run(policyId ? { action: "version_policy", policyId, rules } : { action: "create_policy", name, rules })}
          >
            {c.pending ? "Saving…" : "Save draft"}
          </Button>
          {!canEdit ? <span className="text-[12px] text-[var(--color-muted)]">Only owners and admins can save policies.</span> : null}
          {c.data !== undefined && !c.error ? <span className="text-[12.5px] font-semibold text-[var(--color-ok)]">Draft saved. Activate it from the version history.</span> : null}
        </div>
        {c.error && <p role="alert" className="text-sm text-red-700">{c.error}</p>}

        <details className="rounded-xl border border-[var(--color-line)] px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold">Simulate before activation</summary>
          <div className="mt-4 space-y-4">
            <p className="text-[12.5px] text-[var(--color-muted)]">
              Pick a sample payment. Railor evaluates it under the current version and under this draft, then shows what changes.
            </p>
            <IntentBuilder value={intent} onChange={setIntent} options={options} detectedEntity={entityCountry} />
            <Button
              disabled={sim.pending || missingIntentFields(intent).length > 0}
              onClick={() =>
                sim.run({ action: "simulate", intent: intentFromDraft(intent), baseline: initialRules, rules }, (d) => setSimulation(d as SimulationSummary))
              }
            >
              {sim.pending ? "Simulating…" : "Compare with current version"}
            </Button>
            {missingIntentFields(intent).length ? (
              <p className="text-[12px] text-[var(--color-muted)]">Still needed: {missingIntentFields(intent).join(", ")}.</p>
            ) : null}
            {sim.error && <p role="alert" className="text-sm text-red-700">{sim.error}</p>}
            {simulation ? <SimulationResult result={simulation} providers={providers} /> : null}
          </div>
        </details>
      </div>
    </Card>
  );
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
          <Button key={review} disabled={c.pending || !comment.trim()} onClick={() => c.run({ action: "approval", id, review, comment })}>
            {review}
          </Button>
        ))}
      </div>
      {c.error && <p role="alert" className="text-red-700">{c.error}</p>}
    </div>
  );
}
