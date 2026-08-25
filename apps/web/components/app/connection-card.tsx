"use client";

import { useState, useTransition } from "react";
import type { CredentialField } from "@railor/core";
import { Card } from "@railor/ui";
import { connectProviderAction, disconnectProviderAction } from "../../app/app/settings/connections/actions";

interface Props {
  providerId: string;
  name: string;
  category: string;
  description: string;
  docsUrl: string | null;
  status: "not_connected" | "connected" | "error" | string;
  hasAdapter: boolean;
  credentialFields: CredentialField[];
}

const STATUS_STYLE: Record<string, string> = {
  connected: "bg-[var(--color-ok-bg)] text-[var(--color-ok)]",
  error: "bg-[var(--color-bad-bg)] text-[var(--color-bad)]",
  not_connected: "bg-[var(--color-canvas)] text-[var(--color-muted)]",
};

const STATUS_LABEL: Record<string, string> = {
  connected: "Connected",
  error: "Connection failed",
  not_connected: "Not connected",
};

export function ConnectionCard({
  providerId,
  name,
  category,
  description,
  docsUrl,
  status,
  hasAdapter,
  credentialFields,
}: Props) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await connectProviderAction(providerId, values);
      setDetail(result.detail);
      if (result.ok) setOpen(false);
    });
  };

  const disconnect = () => {
    startTransition(async () => {
      await disconnectProviderAction(providerId);
      setValues({});
      setDetail(null);
    });
  };

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[14px] font-semibold text-[var(--color-ink)]">{name}</span>
          <span className="text-[12px] text-[var(--color-muted)]">{category}</span>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${STATUS_STYLE[status] ?? STATUS_STYLE.not_connected}`}>
          {STATUS_LABEL[status] ?? status}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed text-[var(--color-muted)]">{description}</p>

      {!hasAdapter ? (
        <p className="text-[12px] text-[var(--color-faint)]">No adapter built for this provider yet — connecting isn't available.</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            {status === "connected" || status === "error" ? (
              <button
                type="button"
                onClick={disconnect}
                disabled={pending}
                className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[12.5px] text-[var(--color-muted)] hover:border-[var(--color-line-strong)] disabled:opacity-50"
              >
                Disconnect
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded-full bg-[var(--color-purple)] px-3.5 py-1.5 text-[12.5px] font-medium text-white hover:bg-[var(--color-purple-deep)]"
            >
              {status === "connected" ? "Reconnect" : "Connect"}
            </button>
            {docsUrl ? (
              <a href={docsUrl} target="_blank" rel="noreferrer" className="text-[12px] font-medium text-[var(--color-purple)]">
                Docs →
              </a>
            ) : null}
          </div>

          {open ? (
            <form onSubmit={submit} className="flex flex-col gap-2 rounded-xl bg-[var(--color-canvas)] p-3">
              {credentialFields.map((field) => (
                <input
                  key={field.key}
                  type={field.secret ? "password" : "text"}
                  placeholder={field.placeholder ?? field.label}
                  aria-label={field.label}
                  value={values[field.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-[13px] outline-none focus:border-[var(--color-violet)]"
                />
              ))}
              <button
                type="submit"
                disabled={pending}
                className="self-start rounded-full bg-[var(--color-ink)] px-3.5 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-50"
              >
                {pending ? "Testing…" : "Save & test connection"}
              </button>
            </form>
          ) : null}

          {detail ? <p className="text-[12px] text-[var(--color-muted)]">{detail}</p> : null}
        </>
      )}
    </Card>
  );
}
