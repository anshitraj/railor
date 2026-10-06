"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Webhook } from "lucide-react";
import { Button, Card, SectionLabel, StageBadge, cn } from "@railor/ui";
import { createWebhookEndpointAction, webhookEndpointAction } from "../../app/app/payments/actions";
import { PresetChip, Segmented } from "./form-kit";

interface Endpoint {
  id: string;
  url: string;
  description: string | null;
  mode: "test" | "live";
  events: string[];
  enabled: boolean;
  secretHint: string;
}

interface Delivery {
  id: string;
  eventType: string;
  status: string;
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: string;
  url: string;
}

function Secret({ secret, onDone }: { secret: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="text-[12.5px] text-amber-900">Signing secret — shown once. Store it where your server verifies the <code>Railor-Signature</code> header.</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="break-all rounded bg-white px-2 py-1 text-[12px]">{secret}</code>
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(secret);
              setCopied(true);
            } catch {
              window.prompt("Copy the signing secret", secret);
            }
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          I&apos;ve stored it
        </Button>
      </div>
    </div>
  );
}

export function WebhookEndpoints({ endpoints, deliveries, canManage }: { endpoints: Endpoint[]; deliveries: Delivery[]; canManage: boolean }) {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"test" | "live">("test");
  const [secret, setSecret] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const act = (id: string, action: "enable" | "disable" | "delete" | "roll" | "test") =>
    start(async () => {
      setNotice(null);
      const r = await webhookEndpointAction(id, action);
      if (!r.ok) setNotice({ ok: false, text: r.error });
      else if (action === "roll") setSecret((r.data as { secret: string }).secret);
      else if (action === "test") {
        const d = r.data as { ok: boolean; status: number | null; error: string | null };
        setNotice({ ok: d.ok, text: d.ok ? `Test event delivered (HTTP ${d.status}).` : `Test event failed: ${d.error ?? `HTTP ${d.status}`}` });
      }
      router.refresh();
    });

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2">
        <Webhook size={16} className="text-[var(--color-orange-deep)]" />
        <SectionLabel>Webhooks</SectionLabel>
        <StageBadge stage="beta" />
      </div>
      <p className="text-[13px] leading-relaxed text-[var(--color-muted)]">
        Railor POSTs payment events (<code>payment.submitted</code>, <code>payment.completed</code>, <code>payment.failed</code>…) to your endpoint, signed{" "}
        <code>Railor-Signature: t=…,v1=HMAC-SHA256(secret, &quot;t.body&quot;)</code>. Failed deliveries retry with backoff for 24 hours.
      </p>

      {secret ? <Secret secret={secret} onDone={() => setSecret(null)} /> : null}

      {endpoints.length ? (
        <ul className="flex flex-col divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)]">
          {endpoints.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase", e.mode === "live" ? "bg-[var(--color-ink)] text-white" : "bg-[var(--color-sand)]")}>{e.mode}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{e.url}</span>
              <span className="font-mono text-[11px] text-[var(--color-faint)]">{e.secretHint}</span>
              {!e.enabled ? <span className="text-[11px] text-[var(--color-bad)]">disabled</span> : null}
              {canManage ? (
                <span className="flex gap-1">
                  <button type="button" disabled={pending} onClick={() => act(e.id, "test")} className="rounded-full px-2 py-1 text-[11.5px] hover:bg-[var(--color-sand)]">
                    Send test
                  </button>
                  <button type="button" disabled={pending} onClick={() => act(e.id, e.enabled ? "disable" : "enable")} className="rounded-full px-2 py-1 text-[11.5px] hover:bg-[var(--color-sand)]">
                    {e.enabled ? "Disable" : "Enable"}
                  </button>
                  <button type="button" disabled={pending} onClick={() => window.confirm("Roll the signing secret? The old one stops verifying immediately.") && act(e.id, "roll")} className="rounded-full px-2 py-1 text-[11.5px] hover:bg-[var(--color-sand)]">
                    Roll secret
                  </button>
                  <button type="button" disabled={pending} onClick={() => window.confirm("Delete this endpoint?") && act(e.id, "delete")} className="rounded-full px-2 py-1 text-[11.5px] text-[var(--color-muted)] hover:bg-[var(--color-bad-bg)] hover:text-[var(--color-bad)]">
                    Delete
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {canManage ? (
        <form
          className="flex flex-col gap-2 rounded-xl border border-dashed border-[var(--color-line-strong)] p-3"
          onSubmit={(ev) => {
            ev.preventDefault();
            start(async () => {
              setNotice(null);
              const r = await createWebhookEndpointAction({ url, mode });
              if (!r.ok) setNotice({ ok: false, text: r.error });
              else {
                setSecret((r.data as { secret: string }).secret);
                setUrl("");
                router.refresh();
              }
            });
          }}
        >
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="webhook-url">
              Endpoint URL
            </label>
            <input
              id="webhook-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.example.com/railor/webhooks"
              className="min-w-[240px] flex-1 rounded-full border border-[var(--color-line)] bg-white px-4 py-2 font-mono text-[12.5px] outline-none focus:border-[var(--color-orange)]"
            />
            <Button type="submit" size="sm" disabled={pending || !url.trim()} title={url.trim() ? undefined : "Enter the https URL that should receive events"}>
              Add endpoint
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-56">
              <Segmented label="Endpoint mode" size="sm" value={mode} onChange={setMode} options={[{ value: "test", label: "Test events" }, { value: "live", label: "Live events" }]} />
            </div>
            <PresetChip active={false} onClick={() => setUrl("https://webhook.site/")}>
              Try webhook.site
            </PresetChip>
          </div>
        </form>
      ) : null}

      {notice ? <p role="status" className={cn("text-[12.5px]", notice.ok ? "text-[var(--color-ok)]" : "text-[var(--color-bad)]")}>{notice.text}</p> : null}

      {deliveries.length ? (
        <details className="rounded-xl border border-[var(--color-line)] px-3 py-2">
          <summary className="cursor-pointer text-[12.5px] font-semibold">Recent deliveries · {deliveries.length}</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {deliveries.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 text-[12px]">
                <span className={cn("product-badge")} data-tone={d.status === "delivered" ? "good" : d.status === "failed" ? "bad" : "warn"}>
                  {d.status}
                </span>
                <span className="font-mono">{d.eventType}</span>
                <span className="text-[var(--color-muted)]">
                  {d.attempts} attempt{d.attempts === 1 ? "" : "s"}
                  {d.lastStatusCode ? ` · HTTP ${d.lastStatusCode}` : ""}
                  {d.lastError && d.status !== "delivered" ? ` · ${d.lastError}` : ""}
                </span>
                <time className="ml-auto font-mono text-[11px] text-[var(--color-faint)]">{d.createdAt.slice(0, 19).replace("T", " ")}</time>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}
