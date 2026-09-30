"use client";

import { useState, useTransition } from "react";
import { Check, Search, X } from "lucide-react";
import { Button, SmartPicker, cn, type PickerOption } from "@railor/ui";
import { queueDiscoveryAction, reviewCandidateAction } from "../../app/admin/discovery-actions";

type Kind = "corridor" | "provider" | "company";

const KINDS: Array<{ value: Kind; label: string; hint: string }> = [
  { value: "corridor", label: "A corridor", hint: "Who can move money on this route? New companies become candidates." },
  { value: "provider", label: "A listed provider", hint: "Deepen one provider from its own official pages." },
  { value: "company", label: "An unlisted company", hint: "Research a company Railor doesn't list yet." },
];

/** Queue a web-discovery run. Every input is a pick except an unlisted company's name and domain. */
export function DiscoveryQueueForm({ countries, currencies, providers }: { countries: PickerOption[]; currencies: PickerOption[]; providers: PickerOption[] }) {
  const [kind, setKind] = useState<Kind>("corridor");
  const [entity, setEntity] = useState("IN");
  const [to, setTo] = useState("AE");
  const [currency, setCurrency] = useState("AED");
  const [asset, setAsset] = useState("");
  const [provider, setProvider] = useState("");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const payload =
        kind === "corridor"
          ? { kind, entity_country: entity, destination_country: to, destination_currency: currency, ...(asset ? { source_asset: asset } : {}) }
          : kind === "provider"
            ? { kind, provider }
            : { kind, name, domain };
      const result = await queueDiscoveryAction(payload);
      setMessage(result.ok ? { ok: true, text: result.detail ?? "Queued." } : { ok: false, text: result.error });
    });

  const ready = kind === "corridor" ? Boolean(entity && to && currency) : kind === "provider" ? Boolean(provider) : name.trim().length > 1 && domain.includes(".");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="What to research">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            role="radio"
            aria-checked={kind === k.value}
            onClick={() => setKind(k.value)}
            className={cn("flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition", kind === k.value ? "border-[var(--color-orange)] bg-[var(--color-lavender)]" : "border-[var(--color-line)] hover:border-[var(--color-line-strong)]")}
          >
            <span className="text-[13.5px] font-semibold">{k.label}</span>
            <span className="text-[11.5px] text-[var(--color-muted)]">{k.hint}</span>
          </button>
        ))}
      </div>

      {kind === "corridor" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SmartPicker label="Sender's country" options={countries} value={entity ? [entity] : []} onChange={(v) => setEntity(v[0] ?? "")} suggestionCount={6} />
          <SmartPicker label="Destination country" options={countries} value={to ? [to] : []} onChange={(v) => setTo(v[0] ?? "")} suggestionCount={6} />
          <SmartPicker label="Destination currency" options={currencies} value={currency ? [currency] : []} onChange={(v) => setCurrency(v[0] ?? "")} suggestionCount={6} />
          <SmartPicker label="Source currency or asset (optional)" options={currencies} value={asset ? [asset] : []} onChange={(v) => setAsset(v[0] ?? "")} suggestionCount={6} />
        </div>
      ) : kind === "provider" ? (
        <SmartPicker label="Provider" options={providers} value={provider ? [provider] : []} onChange={(v) => setProvider(v[0] ?? "")} suggestionCount={8} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-[12px] font-bold text-[var(--color-ink-soft)]">
            Company name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Adyen" className="product-field !mt-0 font-normal" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-bold text-[var(--color-ink-soft)]">
            Official domain
            <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="adyen.com" className="product-field !mt-0 font-mono font-normal" />
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!ready || pending} onClick={submit}>
          <Search size={15} /> {pending ? "Queuing…" : "Queue discovery run"}
        </Button>
        {message ? <span className={cn("text-[12.5px]", message.ok ? "text-[var(--color-ok)]" : "text-[var(--color-bad)]")}>{message.text}</span> : null}
      </div>
    </div>
  );
}

export function CandidateReview({ id, hasOfficial }: { id: string; hasOfficial: boolean }) {
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const act = (decision: "approve" | "reject") =>
    start(async () => {
      const result = await reviewCandidateAction(id, decision, note);
      setMessage(result.ok ? { ok: true, text: result.detail ?? "Done." } : { ok: false, text: result.error });
    });
  return (
    <div className="flex flex-col gap-2">
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the audit log (optional)" aria-label="Review note" className="product-field !mt-0 text-[12.5px]" />
      <div className="flex gap-2">
        <Button size="sm" disabled={pending || !hasOfficial} onClick={() => act("approve")} title={hasOfficial ? undefined : "Needs at least one quote from the company's own site"}>
          <Check size={14} /> Approve & register
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => act("reject")}>
          <X size={14} /> Reject
        </Button>
      </div>
      {message ? <p className={cn("text-[12px]", message.ok ? "text-[var(--color-ok)]" : "text-[var(--color-bad)]")}>{message.text}</p> : null}
    </div>
  );
}
