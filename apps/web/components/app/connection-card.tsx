"use client";

import { useState, useTransition } from "react";
import { Check, Copy, ExternalLink, RefreshCw } from "lucide-react";
import type { CredentialField } from "@railor/core";
import { Button, Card, StageBadge, cn } from "@railor/ui";
import { connectProviderAction, disconnectProviderAction, retestConnectionAction } from "../../app/app/settings/connections/actions";
import { Segmented } from "./form-kit";
import { ProviderLogo } from "./provider-logo";

export interface ConnectionSlot {
  id: string;
  environment: "sandbox" | "production";
  status: string;
  lastCheckedAt: string | null;
  lastCheckDetail: string | null;
  webhookUrl: string | null;
}

interface Props {
  providerId: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  docsUrl: string | null;
  canManage: boolean;
  hasAdapter: boolean;
  canQuote: boolean;
  payout: { verification: string; methods: string[] } | null;
  liveApproved: boolean;
  credentialFields: CredentialField[];
  connections: ConnectionSlot[];
}

const STATUS_TONE: Record<string, string> = {
  connected: "bg-[var(--color-ok-bg)] text-[var(--color-ok)]",
  error: "bg-[var(--color-bad-bg)] text-[var(--color-bad)]",
};

const METHOD_LABEL: Record<string, string> = {
  bank_us: "US bank",
  iban: "IBAN",
  gb: "UK bank",
  clabe: "CLABE",
  pix: "Pix",
  in_bank: "Indian bank",
  crypto_address: "Wallet",
};

function CopyUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          window.prompt("Copy this webhook URL", url);
        }
      }}
      className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-2 py-1 font-mono text-[11px] text-[var(--color-ink-soft)] hover:border-[var(--color-line-strong)]"
      title="Register this URL as the webhook endpoint in the provider's dashboard"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      <span className="truncate">{url}</span>
    </button>
  );
}

export function ConnectionCard({
  providerId,
  slug,
  name,
  category,
  description,
  docsUrl,
  canManage,
  hasAdapter,
  canQuote,
  payout,
  liveApproved,
  credentialFields,
  connections,
}: Props) {
  const [open, setOpen] = useState(false);
  const [environment, setEnvironment] = useState<"sandbox" | "production">(connections.some((c) => c.environment === "sandbox") ? "production" : "sandbox");
  const [values, setValues] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const connected = connections.filter((c) => c.status === "connected");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await connectProviderAction(providerId, values, environment);
      setDetail({ ok: result.ok, text: result.detail ?? "" });
      if (result.ok) {
        setOpen(false);
        setValues({});
      }
    });
  };

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start gap-3">
        <ProviderLogo slug={slug} name={name} size={40} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold">{name}</span>
            <span className="text-[12px] text-[var(--color-muted)]">{category}</span>
          </div>
          <p className="line-clamp-2 text-[12.5px] text-[var(--color-muted)]">{description}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Capability on={hasAdapter} label="Connection test" />
            <Capability on={canQuote} label="Live quotes" />
            <Capability on={Boolean(payout)} label={payout ? `Payouts · ${payout.methods.map((m) => METHOD_LABEL[m] ?? m).join(", ")}` : "Payouts"} />
            {payout ? <StageBadge stage={liveApproved ? "live" : "beta"} /> : null}
          </div>
        </div>
        {docsUrl ? (
          <a href={docsUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-muted)] hover:text-[var(--color-ink)]">
            Docs <ExternalLink size={12} />
          </a>
        ) : null}
      </div>

      {connections.length ? (
        <ul className="flex flex-col gap-2">
          {connections.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide", c.environment === "production" ? "bg-[var(--color-ink)] text-white" : "bg-[var(--color-sand)] text-[var(--color-ink-soft)]")}>
                  {c.environment}
                </span>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_TONE[c.status] ?? "bg-[var(--color-canvas)] text-[var(--color-muted)]")}>
                  {c.status === "connected" ? "Connected" : c.status === "error" ? "Check failed" : c.status}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--color-muted)]">
                  {c.lastCheckDetail}
                  {c.lastCheckedAt ? ` · checked ${new Date(c.lastCheckedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC` : ""}
                </span>
                {canManage ? (
                  <span className="flex gap-1">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const r = await retestConnectionAction(c.id);
                          setDetail({ ok: r.ok, text: r.detail ?? "" });
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11.5px] text-[var(--color-muted)] hover:bg-[var(--color-sand)]"
                    >
                      <RefreshCw size={12} /> Test
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm(`Disconnect ${name} ${c.environment}? Payments routed through it will stop.`)) {
                          startTransition(async () => {
                            await disconnectProviderAction(providerId, c.environment);
                          });
                        }
                      }}
                      className="rounded-full px-2 py-1 text-[11.5px] text-[var(--color-muted)] hover:bg-[var(--color-bad-bg)] hover:text-[var(--color-bad)]"
                    >
                      Disconnect
                    </button>
                  </span>
                ) : null}
              </div>
              {c.webhookUrl && c.status === "connected" ? (
                <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--color-muted)]">
                  <span>Status webhook:</span>
                  <CopyUrl url={c.webhookUrl} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {hasAdapter && canManage ? (
        open ? (
          <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-[var(--color-line)] p-4">
            <Segmented
              label="Environment"
              size="sm"
              value={environment}
              onChange={setEnvironment}
              options={[
                { value: "sandbox", label: "Sandbox · test mode" },
                { value: "production", label: "Production · live mode" },
              ]}
            />
            {credentialFields.map((field) => (
              <label key={field.key} className="flex flex-col gap-1 text-[12px] font-semibold text-[var(--color-ink-soft)]">
                {field.label}
                {field.key === "webhookPublicKey" ? (
                  <textarea
                    rows={3}
                    value={values[field.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 font-mono text-[12px] font-normal outline-none focus:border-[var(--color-orange)]"
                  />
                ) : (
                  <input
                    type={field.secret ? "password" : "text"}
                    autoComplete="off"
                    value={values[field.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-[13px] font-normal outline-none focus:border-[var(--color-orange)]"
                  />
                )}
              </label>
            ))}
            <p className="text-[11.5px] leading-relaxed text-[var(--color-muted)]">
              Credentials are tested live against {name}&apos;s {environment} API, then stored encrypted. They are never shown again or sent to your browser.
            </p>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Testing…" : `Connect ${environment}`}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div>
            <Button size="sm" variant={connected.length ? "secondary" : "primary"} onClick={() => setOpen(true)}>
              {connected.length ? "Add or replace a connection" : `Connect ${name}`}
            </Button>
          </div>
        )
      ) : !hasAdapter ? (
        <p className="text-[12px] text-[var(--color-muted)]">Railor has no integration for {name} yet — it stays research-only.</p>
      ) : null}

      {detail ? (
        <p role="status" className={cn("text-[12.5px]", detail.ok ? "text-[var(--color-ok)]" : "text-[var(--color-bad)]")}>
          {detail.text}
        </p>
      ) : null}
    </Card>
  );
}

function Capability({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]", on ? "border-[var(--color-ok)]/30 bg-[var(--color-ok-bg)] text-[var(--color-ok)]" : "border-[var(--color-line)] text-[var(--color-faint)] line-through")}>
      {on ? <Check size={11} /> : null}
      {label}
    </span>
  );
}
