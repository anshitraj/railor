"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card } from "@railor/ui";
import { FieldBlock, PresetChip, ResultNotice, Segmented } from "./form-kit";
import { PolicyEditor, useCommand } from "./control-forms";
import { IntentBuilder, draftFromPartial, intentFromDraft, missingIntentFields, type IntentDraft, type IntentOptions } from "./intent-builder";

const field = "product-field";

export interface DecisionChoice {
  id: string;
  status: string;
  label: string;
  evaluatedAt: string;
}

function newIdempotencyKey() {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `job_${random.replaceAll("-", "").slice(0, 24)}`;
}

/** Recent decisions as one-click choices, so nobody has to paste a UUID. */
function DecisionPicker({
  decisions,
  value,
  onChange,
  emptyHint,
}: {
  decisions: DecisionChoice[];
  value: string;
  onChange: (id: string) => void;
  emptyHint: string;
}) {
  if (!decisions.length) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--color-line-strong)] bg-[var(--color-paper)] p-3 text-[12.5px] text-[var(--color-muted)]">
        {emptyHint}{" "}
        <Link href="/app/decisions" className="product-quiet-link">
          Evaluate a payment →
        </Link>
      </p>
    );
  }
  return (
    <div role="radiogroup" aria-label="Decision" className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] p-1">
      {decisions.map((d) => {
        const selected = d.id === value;
        return (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(d.id)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-[12.5px] transition ${selected ? "bg-[var(--color-lavender)] ring-1 ring-[var(--color-orange)]/40" : "hover:bg-[var(--color-surface)]"}`}
          >
            <span className="product-badge" data-tone={d.status === "allow" ? "good" : d.status === "deny" ? "bad" : "warn"}>
              {d.status.replaceAll("_", " ")}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{d.label}</span>
            <time className="product-mono shrink-0 text-[var(--color-muted)]">{d.evaluatedAt}</time>
          </button>
        );
      })}
    </div>
  );
}

const DISCOVERY_NOTES = {
  investigate: ["Official source looks credible", "Worth checking with the provider", "Matches a corridor we need"],
  dismissed: ["Source is not authoritative", "Duplicate of a known route", "Not relevant to our markets"],
};

export function DiscoveryReviewForm({ id }: { id: string }) {
  const c = useCommand();
  const [comment, setComment] = useState("");
  return (
    <div className="product-form space-y-3 border-t border-[var(--color-line)] pt-5">
      <label className="block text-sm">
        Review notes
        <textarea className={field} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {[...DISCOVERY_NOTES.investigate, ...DISCOVERY_NOTES.dismissed].map((note) => (
          <PresetChip key={note} active={comment === note} onClick={() => setComment(note)}>
            {note}
          </PresetChip>
        ))}
      </div>
      <div className="flex gap-2">
        {(["investigate", "dismissed"] as const).map((status) => (
          <Button key={status} variant={status === "dismissed" ? "secondary" : "primary"} disabled={c.pending || !comment.trim()} onClick={() => c.run({ action: "review_discovery", id, status, comment })}>
            {status === "investigate" ? "Keep for verification" : "Dismiss"}
          </Button>
        ))}
      </div>
      {c.error && <p role="alert" className="text-sm text-red-700">{c.error}</p>}
    </div>
  );
}

const RUNTIME_NAMES = ["Local sandbox", "Staging", "Production runtime"];

export function ConnectorRegistration() {
  const c = useCommand();
  const [name, setName] = useState("Local sandbox");
  const [credential, setCredential] = useState<{ id: string; token: string }>();
  const [copied, setCopied] = useState(false);
  return (
    <Card className="product-panel product-form">
      <div className="product-panel-head">
        <div>
          <span className="product-index">SETUP / 01</span>
          <h2 className="mt-1">Register a customer-hosted runtime</h2>
          <p>Create a one-time installation token for a runtime in your own environment.</p>
        </div>
      </div>
      <div className="space-y-4 p-5 sm:p-7">
        <label className="block max-w-md">
          Installation name
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {RUNTIME_NAMES.map((n) => (
            <PresetChip key={n} active={name === n} onClick={() => setName(n)}>
              {n}
            </PresetChip>
          ))}
        </div>
        <Button disabled={c.pending || !name.trim()} onClick={() => c.run({ action: "register_connector", name }, (d) => setCredential(d as { id: string; token: string }))}>
          {c.pending ? "Creating…" : "Create installation token"}
        </Button>
        {credential && (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-[12.5px] leading-relaxed text-amber-900">
              This token is shown once. Store it in your runtime secret manager. Do not paste provider credentials here.
            </p>
            <label className="block">
              Installation ID
              <input readOnly className={field} value={credential.id} />
            </label>
            <label className="block">
              Connector token
              <input readOnly type="password" className={field} value={credential.token} />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(credential.token);
                    setCopied(true);
                  } catch {
                    c.setError("Clipboard unavailable. Select and copy the token manually.");
                  }
                }}
              >
                {copied ? "Copied ✓" : "Copy token"}
              </Button>
              <Button variant="ghost" onClick={() => setCredential(undefined)}>
                Hide token
              </Button>
            </div>
            <pre className="overflow-x-auto rounded-lg bg-[var(--color-ink)] p-3 text-[11.5px] text-white">
{`RAILOR_CONNECTOR_ID=${credential.id} \\
RAILOR_CONNECTOR_TOKEN=<token> \\
pnpm --filter @railor/connector start`}
            </pre>
          </div>
        )}
        {c.error && <p role="alert" className="text-sm text-red-700">{c.error}</p>}
      </div>
    </Card>
  );
}

export function ConnectorSimulation({
  installations,
  decisions,
}: {
  installations: Array<{ id: string; name: string }>;
  decisions: DecisionChoice[];
}) {
  const c = useCommand();
  const [installationId, setInstallation] = useState(installations[0]?.id ?? "");
  const [decisionId, setDecision] = useState(decisions[0]?.id ?? "");
  const [key, setKey] = useState(newIdempotencyKey);
  const [result, setResult] = useState<unknown>();
  const [operation, setOperation] = useState<"get_quote" | "simulate_transfer">("get_quote");
  return (
    <Card className="product-panel product-form">
      <div className="product-panel-head">
        <div>
          <span className="product-index">WORKFLOW / 02</span>
          <h2 className="mt-1">Dispatch a Connector job</h2>
          <p>Queue a read-only quote or sandbox simulation against a current decision.</p>
        </div>
      </div>
      <div className="space-y-5 p-5 sm:p-7">
        <p className="border-l-2 border-[var(--color-orange)] pl-3 text-xs leading-relaxed text-[var(--color-muted)]">
          No money moves. Quotes use your customer-side vault. Simulations require an allowed or separately approved decision. One job per decision; retries reuse the same key. Revalidate after a quote arrives.
        </p>
        <FieldBlock label="Operation">
          <Segmented
            label="Operation"
            value={operation}
            onChange={setOperation}
            options={[
              { value: "get_quote", label: "Customer-side quote", hint: "Read-only price from your provider account" },
              { value: "simulate_transfer", label: "Sandbox simulation", hint: "Dry-run the transfer in the provider sandbox" },
            ]}
          />
        </FieldBlock>
        <FieldBlock label="Installation">
          {installations.length ? (
            <Segmented label="Installation" value={installationId} onChange={setInstallation} options={installations.map((i) => ({ value: i.id, label: i.name }))} />
          ) : (
            <p className="text-[12.5px] text-[var(--color-muted)]">Register an installation above first.</p>
          )}
        </FieldBlock>
        <FieldBlock label="Decision">
          <DecisionPicker decisions={decisions} value={decisionId} onChange={setDecision} emptyHint="No decisions yet — a job always runs against a recorded decision." />
        </FieldBlock>
        <FieldBlock label="Idempotency key" hint="Generated for you. Reuse the same key to retry the same job safely.">
          <div className="flex items-center gap-2">
            <input aria-label="Idempotency key" className={`${field} !mt-0 font-mono`} value={key} onChange={(e) => setKey(e.target.value)} />
            <Button variant="secondary" size="sm" className="shrink-0 whitespace-nowrap" onClick={() => setKey(newIdempotencyKey())}>
              New key
            </Button>
          </div>
        </FieldBlock>
        <Button
          disabled={c.pending || !installationId || !decisionId || key.length < 8}
          onClick={() => c.run({ action: "simulate_connector", installationId, decisionId, idempotencyKey: key, operation }, setResult)}
        >
          {c.pending ? "Queueing…" : "Queue job"}
        </Button>
        {result !== undefined && !c.error ? (
          <ResultNotice tone="good" title="Job queued. The runtime picks it up on its next poll." raw={result} />
        ) : null}
        {c.error && <p role="alert" className="text-sm text-red-700">{c.error}</p>}
      </div>
    </Card>
  );
}

const EXAMPLES: Record<"payment" | "policy", string[]> = {
  payment: [
    "Indian company sending 10000 INR to AED in UAE",
    "UK business paying 5000 USDC on Base to a Nigerian supplier in NGN",
    "Singapore company sending 25000 USD to EUR in Germany",
  ],
  policy: [
    "Require exact route evidence; block during incidents; approval above 100000",
    "Require confirmed entity eligibility; maximum evidence age 72 hours",
    "Require live quote; require connected provider",
  ],
};

export function AgentWorkbench({
  policies,
  decisions,
  providers,
  options,
  entityCountry,
  canEditPolicies,
}: {
  policies: Array<{ id: string; name: string }>;
  decisions: DecisionChoice[];
  providers: Array<{ slug: string; name: string }>;
  options: IntentOptions;
  entityCountry?: string;
  canEditPolicies: boolean;
}) {
  const c = useCommand();
  const [kind, setKind] = useState<"payment" | "policy" | "explain">("payment");
  const [text, setText] = useState("");
  const [result, setResult] = useState<unknown>();
  const [intent, setIntent] = useState<IntentDraft | null>(null);
  const [policyDraft, setPolicyDraft] = useState<{ rules: Record<string, unknown>; stamp: number } | null>(null);
  const [draftJson, setDraftJson] = useState("");
  const [policyId, setPolicy] = useState(policies[0]?.id ?? "");
  const [provider, setProvider] = useState("");
  const evaluate = useCommand();

  const output = result && typeof result === "object" ? (result as { missing?: unknown; notes?: unknown; unrecognized?: unknown; explanation?: unknown; status?: unknown }) : null;
  const missing = Array.isArray(output?.missing) ? output.missing.filter((item): item is string => typeof item === "string") : [];
  const unrecognized = Array.isArray(output?.unrecognized) ? output.unrecognized.filter((item): item is string => typeof item === "string") : [];
  const notes = Array.isArray(output?.notes) ? output.notes.filter((item): item is string => typeof item === "string") : [];

  const reset = (next: typeof kind) => {
    setKind(next);
    setText("");
    setResult(undefined);
    setIntent(null);
    setPolicyDraft(null);
  };

  const generate = () =>
    c.run({ action: "agent_draft", kind, text }, (d) => {
      setResult(d);
      const value = d as { draft?: Record<string, unknown> };
      if (kind === "payment" && value.draft) {
        setIntent(draftFromPartial(value.draft, entityCountry));
        setDraftJson(JSON.stringify(value.draft, null, 2));
      }
      if (kind === "policy" && value.draft) setPolicyDraft({ rules: value.draft, stamp: Date.now() });
    });

  const intentMissing = intent ? missingIntentFields(intent) : [];

  return (
    <div className="space-y-5">
      <Card className="product-panel product-form">
        <div className="product-panel-head">
          <div>
            <span className="product-index">ASSISTED / 01</span>
            <h2 className="mt-1">Draft and explain</h2>
            <p>Generate a structured starting point from your instructions — or pick an example.</p>
          </div>
          <span className="product-badge" data-tone="neutral">Human review</span>
        </div>
        <div className="space-y-5 p-5 sm:p-7">
          <p className="border-l-2 border-[var(--color-orange)] pl-3 text-xs leading-relaxed text-[var(--color-muted)]">
            The Agent uses deterministic extraction and stored evidence. It cannot approve or execute payments, activate policies, or infer missing facts. Review its output before saving.
          </p>
          <FieldBlock label="Tool">
            <Segmented
              label="Tool"
              value={kind}
              onChange={reset}
              options={[
                { value: "payment", label: "Draft payment", hint: "Sentence → payment intent" },
                { value: "policy", label: "Draft policy", hint: "Clauses → policy rules" },
                { value: "explain", label: "Explain decision", hint: "Why a decision came out as it did" },
              ]}
            />
          </FieldBlock>

          {kind === "explain" ? (
            <FieldBlock label="Decision to explain">
              <DecisionPicker decisions={decisions} value={text} onChange={setText} emptyHint="No decisions recorded yet." />
            </FieldBlock>
          ) : (
            <>
              <label className="block">
                Your instructions
                <textarea
                  className={field}
                  rows={4}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={kind === "payment" ? "Indian company sending 1000 INR to AED in UAE" : "Require exact route evidence; block during incidents; approval above 100000"}
                />
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] uppercase tracking-wide text-[var(--color-faint)]">Examples</span>
                {EXAMPLES[kind].map((example) => (
                  <PresetChip key={example} active={text === example} onClick={() => setText(example)}>
                    {example}
                  </PresetChip>
                ))}
              </div>
              {kind === "policy" && (
                <p className="text-xs text-[var(--color-muted)]">
                  Supported clauses: require exact route evidence; require confirmed entity eligibility; require connected provider; require live quote; block during incidents; approval above [integer]; maximum evidence age [integer] hours; allow provider [slug]; block provider [slug].
                </p>
              )}
            </>
          )}

          <Button disabled={c.pending || !text.trim()} onClick={generate}>
            {c.pending ? "Working…" : kind === "explain" ? "Explain this decision" : "Generate reviewable output"}
          </Button>

          {result !== undefined && (
            <div aria-live="polite" className="rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-lg font-semibold">{kind === "explain" ? "Explanation" : "Draft check"}</h3>
                {kind !== "explain" ? (
                  <span className="product-badge" data-tone={missing.length || unrecognized.length ? "warn" : "good"}>
                    {missing.length || unrecognized.length ? "Needs input" : "Ready to review"}
                  </span>
                ) : (
                  <span className="product-badge" data-tone="neutral">{String(output?.status ?? "").replaceAll("_", " ")}</span>
                )}
              </div>
              <p className="mt-1 text-xs text-[var(--color-muted)]">This is a draft, not an authorization or executable quote.</p>
              {missing.length > 0 && (
                <div className="mt-4">
                  <h4 className="product-index">MISSING INFORMATION</h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {missing.map((item) => (
                      <span key={item} className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">
                        {item}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-[12px] text-[var(--color-muted)]">Pick the missing values below — no retyping needed.</p>
                </div>
              )}
              {unrecognized.length > 0 && (
                <div className="mt-4">
                  <h4 className="product-index">NOT UNDERSTOOD — NOT ENFORCED</h4>
                  <ul className="mt-2 list-disc pl-5 text-xs">
                    {unrecognized.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {kind === "explain" && typeof output?.explanation === "string" ? (
                <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed">{output.explanation}</p>
              ) : null}
              {notes.length > 0 && (
                <div className="mt-4 space-y-2">
                  {notes.map((note, index) => (
                    <p key={index} className="border-l-2 border-[var(--color-orange)] pl-3 text-xs leading-relaxed">
                      {note}
                    </p>
                  ))}
                </div>
              )}
              <details className="mt-4 border-t border-[var(--color-line)] pt-3">
                <summary className="cursor-pointer text-xs font-semibold">View extraction data</summary>
                <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(result, null, 2)}</pre>
              </details>
            </div>
          )}
        </div>
      </Card>

      {kind === "payment" && intent ? (
        <Card className="product-panel product-form">
          <div className="product-panel-head">
            <div>
              <span className="product-index">REVIEW / 02</span>
              <h2 className="mt-1">Review and edit draft</h2>
              <p>Every field the Agent extracted is pre-selected. Correct anything with a click, then evaluate.</p>
            </div>
          </div>
          <div className="space-y-5 p-5 sm:p-7">
            <IntentBuilder value={intent} onChange={setIntent} options={options} detectedEntity={entityCountry} />
            <div className="grid gap-5 md:grid-cols-2">
              <FieldBlock label="Active policy">
                {policies.length ? (
                  <Segmented label="Active policy" value={policyId} onChange={setPolicy} options={policies.slice(0, 4).map((p) => ({ value: p.id, label: p.name }))} />
                ) : (
                  <Link href="/app/policies" className="product-quiet-link">
                    Create and activate a policy first →
                  </Link>
                )}
              </FieldBlock>
              <FieldBlock label="Provider" hint="Pick one to enforce, or leave on “Compare all” to optimize.">
                <div className="flex flex-wrap gap-1.5">
                  <PresetChip active={!provider} onClick={() => setProvider("")}>
                    Compare all
                  </PresetChip>
                  {providers.slice(0, 8).map((p) => (
                    <PresetChip key={p.slug} active={provider === p.slug} onClick={() => setProvider(p.slug)}>
                      {p.name}
                    </PresetChip>
                  ))}
                </div>
              </FieldBlock>
            </div>
            <details className="rounded-xl border border-[var(--color-line)] px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold">Structured draft (JSON)</summary>
              <label className="mt-3 block">
                Structured draft
                <textarea aria-label="Structured draft" className={`${field} font-mono`} rows={10} value={draftJson} onChange={(e) => setDraftJson(e.target.value)} />
              </label>
              <Button
                variant="ghost"
                onClick={() => {
                  try {
                    setIntent(draftFromPartial(JSON.parse(draftJson), entityCountry));
                    evaluate.setError("");
                  } catch {
                    evaluate.setError("Enter valid draft JSON.");
                  }
                }}
              >
                Apply JSON to pickers
              </Button>
            </details>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={evaluate.pending || !policyId || intentMissing.length > 0}
                onClick={() => evaluate.run({ action: "decision", intent: intentFromDraft(intent), policyId, mode: provider ? "enforce" : "optimize", provider })}
              >
                {evaluate.pending ? "Evaluating…" : "Confirm fields and evaluate"}
              </Button>
              {intentMissing.length ? <span className="text-[12px] text-[var(--color-muted)]">Still needed: {intentMissing.join(", ")}.</span> : null}
            </div>
            {evaluate.error && <p role="alert" className="text-sm text-red-700">{evaluate.error}</p>}
          </div>
        </Card>
      ) : null}

      {kind === "policy" && policyDraft ? (
        <PolicyEditor
          key={policyDraft.stamp}
          canEdit={canEditPolicies}
          initialName="Agent policy draft"
          initialRules={policyDraft.rules}
          providers={providers}
          options={options}
          entityCountry={entityCountry}
        />
      ) : null}

      {c.error && <p role="alert" className="text-red-700">{c.error}</p>}
    </div>
  );
}
