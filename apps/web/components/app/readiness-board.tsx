"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card, PasteToStructure, SectionLabel, VerdictPill, cn } from "@railor/ui";
import { applyParsedRequirements, setReadiness } from "../../app/app/readiness/actions";

export interface ReadinessItem {
  key: string;
  label: string;
  kind: string;
  description: string | null;
  status: "have" | "missing" | "unsure";
  aliases: string[];
}

export interface ProviderReadiness {
  slug: string;
  name: string;
  missing: string[];
  total: number;
}

const STATUS: Array<{ value: ReadinessItem["status"]; label: string }> = [
  { value: "have", label: "Have it" },
  { value: "missing", label: "Don't have it" },
  { value: "unsure", label: "Not sure" },
];

/**
 * The biggest manual-input surface in the product, built as a tap board rather
 * than a form: three states per item, bulk paste from a provider's own
 * checklist, and an immediate read-out of which providers that unblocks.
 */
export function ReadinessBoard({
  items,
  providers,
}: {
  items: ReadinessItem[];
  providers: ProviderReadiness[];
}) {
  const [local, setLocal] = useState(items);
  const [, startTransition] = useTransition();

  const update = (key: string, status: ReadinessItem["status"]) => {
    setLocal((current) => current.map((i) => (i.key === key ? { ...i, status } : i)));
    startTransition(async () => void (await setReadiness(key, status)));
  };

  const have = local.filter((i) => i.status === "have").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-[24px] font-semibold tracking-tight">KYB readiness</h1>
        <p className="max-w-2xl text-[14px] text-[var(--color-muted)]">
          Record what your organization already holds once. Railor normalizes provider requirements
          onto the same vocabulary and shows exactly what each one still needs.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <SectionLabel>Your documents</SectionLabel>
            <span className="tabular text-[13px] text-[var(--color-muted)]">
              {have} of {local.length} recorded
            </span>
          </div>

          <ul className="flex flex-col gap-2">
            {local.map((item) => (
              <li
                key={item.key}
                className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-line)] p-3"
              >
                <div className="flex min-w-[220px] flex-1 flex-col">
                  <span className="text-[13.5px] font-medium">{item.label}</span>
                  <span className="text-[12px] text-[var(--color-muted)]">
                    {item.description ?? item.kind.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {STATUS.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => update(item.key, s.value)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-[12.5px] transition",
                        item.status === s.value
                          ? s.value === "have"
                            ? "border-[var(--color-ok)] bg-[var(--color-ok-bg)] text-[var(--color-ok)]"
                            : s.value === "missing"
                              ? "border-[var(--color-bad)] bg-[var(--color-bad-bg)] text-[var(--color-bad)]"
                              : "border-[var(--color-line-strong)] bg-[var(--color-unknown-bg)] text-[var(--color-unknown)]"
                          : "border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-line-strong)]",
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>

          <PasteToStructure
            placeholder="Paste a provider's requirement email or checklist…"
            hint="Railor maps phrases like “ultimate beneficial owner”, “CoI” or “proof of address” onto its normalized vocabulary. Nothing is applied until you confirm."
            parse={(input) => {
              const text = input.toLowerCase();
              return local
                .filter((item) =>
                  [item.label.toLowerCase(), ...item.aliases.map((a) => a.toLowerCase())].some((t) =>
                    text.includes(t),
                  ),
                )
                .map((item) => ({ field: "requirement", value: item.key, label: item.label }));
            }}
            onConfirm={(parsed) => {
              const keys = parsed.map((p) => p.value);
              setLocal((current) =>
                current.map((i) => (keys.includes(i.key) ? { ...i, status: "have" } : i)),
              );
              startTransition(async () => void (await applyParsedRequirements(keys)));
            }}
          />

          <p className="text-[12px] leading-relaxed text-[var(--color-faint)]">
            Railor normalizes published requirements. Providers remain responsible for their own
            KYC/KYB decisions — nothing here substitutes for their process.
          </p>
        </Card>

        <Card className="flex flex-col gap-3 p-5">
          <SectionLabel>What this unblocks</SectionLabel>
          <ul className="flex flex-col gap-2">
            {providers.map((p) => {
              const missing = p.missing.filter((key) => {
                const item = local.find((i) => i.key === key);
                return item?.status !== "have";
              });
              return (
                <li
                  key={p.slug}
                  className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-[var(--color-line)] p-3"
                >
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/app/providers/${p.slug}`}
                      className="text-[13.5px] font-medium hover:text-[var(--color-purple)]"
                    >
                      {p.name}
                    </Link>
                    <span className="flex-1" />
                    <VerdictPill
                      compact
                      verdict={missing.length === 0 ? "supported" : "additional_requirements"}
                    />
                  </div>
                  {missing.length ? (
                    <ul className="flex flex-col gap-0.5">
                      {missing.map((key) => (
                        <li key={key} className="text-[12px] text-[var(--color-muted)]">
                          Missing: {local.find((i) => i.key === key)?.label ?? key}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-[12px] text-[var(--color-ok)]">
                      Ready on published requirements
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
