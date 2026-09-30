"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Activity,
  ArrowRight,
  BadgeDollarSign,
  Code2,
  FileText,
  Gauge,
  Globe2,
  PackageMinus,
  Radar,
  Rocket,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@railor/ui";
import { ProviderLogo } from "./provider-logo";

export interface FeedItem {
  id: string;
  kind: string;
  label: string;
  field: string;
  previous: string | null;
  current: string | null;
  summary: string;
  detectedAt: string;
  confidence: number;
  status: string;
  providerName: string;
  providerSlug: string;
  affects: Record<string, string>;
}

const KIND: Record<string, { icon: LucideIcon; tone: string; ring: string; dot: string }> = {
  coverage_changed: { icon: Globe2, tone: "text-sky-700 bg-sky-50", ring: "ring-sky-200", dot: "bg-sky-500" },
  pricing_changed: { icon: BadgeDollarSign, tone: "text-amber-700 bg-amber-50", ring: "ring-amber-200", dot: "bg-amber-500" },
  limit_changed: { icon: Gauge, tone: "text-violet-700 bg-violet-50", ring: "ring-violet-200", dot: "bg-violet-500" },
  requirement_changed: { icon: ShieldCheck, tone: "text-teal-700 bg-teal-50", ring: "ring-teal-200", dot: "bg-teal-500" },
  api_changed: { icon: Code2, tone: "text-slate-700 bg-slate-100", ring: "ring-slate-200", dot: "bg-slate-500" },
  documentation_changed: { icon: FileText, tone: "text-stone-600 bg-stone-100", ring: "ring-stone-200", dot: "bg-stone-400" },
  service_degraded: { icon: Activity, tone: "text-red-700 bg-red-50", ring: "ring-red-200", dot: "bg-red-500" },
  product_launched: { icon: Rocket, tone: "text-emerald-700 bg-emerald-50", ring: "ring-emerald-200", dot: "bg-emerald-500" },
  product_removed: { icon: PackageMinus, tone: "text-rose-700 bg-rose-50", ring: "ring-rose-200", dot: "bg-rose-500" },
};
const FALLBACK = KIND.documentation_changed!;

const DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function ago(iso: string, now: number) {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
}

function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-1.5" title="How sure Railor's extraction is about this change">
      <span className="relative h-1.5 w-14 overflow-hidden rounded-full bg-[var(--color-line)]">
        <motion.span
          initial={{ width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className={cn("absolute inset-y-0 left-0 rounded-full", pct >= 90 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-500" : "bg-stone-400")}
        />
      </span>
      <span className="tabular text-[11px] font-semibold text-[var(--color-muted)]">{pct}%</span>
    </span>
  );
}

function Diff({ previous, current }: { previous: string | null; current: string | null }) {
  if (!previous && !current) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
      {previous ? <span className="max-w-full break-words rounded-lg bg-red-50 px-2 py-1 text-red-800 line-through decoration-red-300">{previous}</span> : null}
      {previous && current ? <ArrowRight size={13} className="shrink-0 text-[var(--color-faint)]" /> : null}
      {current ? <span className="max-w-full break-words rounded-lg bg-emerald-50 px-2 py-1 font-medium text-emerald-900">{previous ? "" : "+ "}{current}</span> : null}
    </div>
  );
}

function Stat({ label, value, tone, delay }: { label: string; value: number; tone: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-1 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3"
    >
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--color-faint)]">{label}</span>
      <span className={cn("font-display text-[28px] font-semibold leading-none tabular", tone)}>{value}</span>
    </motion.div>
  );
}

export function ChangeFeed({ items, providerBase, now, providersMonitored }: { items: FeedItem[]; providerBase: string; now: string; providersMonitored: number }) {
  const reduce = useReducedMotion();
  const [kind, setKind] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "pending" | "published">("all");
  const nowMs = Date.parse(now);

  const counts = useMemo(() => {
    const byKind: Record<string, number> = {};
    for (const i of items) byKind[i.kind] = (byKind[i.kind] ?? 0) + 1;
    return byKind;
  }, [items]);
  const kinds = Object.keys(counts).sort((a, b) => counts[b]! - counts[a]!);
  const labelOf = (k: string) => items.find((i) => i.kind === k)?.label ?? k;

  const visible = items.filter((i) => (kind === "all" || i.kind === kind) && (status === "all" || (status === "pending" ? i.status === "pending" : i.status !== "pending")));
  const groups = useMemo(() => {
    const out: Array<{ day: string; items: FeedItem[] }> = [];
    for (const item of visible) {
      const day = DAY.format(new Date(item.detectedAt));
      const last = out.at(-1);
      if (last?.day === day) last.items.push(item);
      else out.push({ day, items: [item] });
    }
    return out;
  }, [visible]);
  const latest = items[0];
  const pending = items.filter((i) => i.status === "pending").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
        </span>
        <span className="text-[13px] font-semibold">Monitoring {providersMonitored} providers</span>
        <span className="text-[12.5px] text-[var(--color-muted)]">
          <Radar size={13} className="mr-1 inline -translate-y-px" />
          {latest ? `last change detected ${ago(latest.detectedAt, nowMs)}` : "no changes detected yet"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Changes tracked" value={items.length} tone="text-[var(--color-ink)]" delay={0} />
        <Stat label="Awaiting review" value={pending} tone="text-amber-600" delay={0.05} />
        <Stat label="Pricing" value={counts.pricing_changed ?? 0} tone="text-amber-700" delay={0.1} />
        <Stat label="Coverage" value={counts.coverage_changed ?? 0} tone="text-sky-700" delay={0.15} />
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by change type">
          <FilterChip active={kind === "all"} onClick={() => setKind("all")} label="All changes" count={items.length} />
          {kinds.map((k) => {
            const style = KIND[k] ?? FALLBACK;
            return <FilterChip key={k} active={kind === k} onClick={() => setKind(k)} label={labelOf(k)} count={counts[k]!} icon={style.icon} dot={style.dot} />;
          })}
        </div>
        <div className="flex gap-1" role="group" aria-label="Filter by review status">
          {(["all", "pending", "published"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={cn("rounded-full px-3 py-1 text-[12px] font-semibold capitalize transition", status === s ? "bg-[var(--color-ink)] text-white" : "text-[var(--color-muted)] hover:text-[var(--color-ink)]")}
            >
              {s === "pending" ? "Awaiting review" : s === "published" ? "Reviewed" : "Any status"}
            </button>
          ))}
        </div>
      </div>

      {groups.length ? (
        <div className="flex flex-col gap-7">
          {groups.map((group) => (
            <section key={group.day} className="flex flex-col gap-3">
              <h2 className="sticky top-2 z-10 w-fit rounded-full border border-[var(--color-line)] bg-[var(--color-canvas)]/90 px-3 py-1 text-[11.5px] font-bold uppercase tracking-[0.1em] text-[var(--color-muted)] backdrop-blur">
                {group.day}
              </h2>
              <ol className="relative flex flex-col gap-3 pl-11 before:absolute before:bottom-3 before:left-[15px] before:top-3 before:w-px before:bg-gradient-to-b before:from-[var(--color-line-strong)] before:to-transparent">
                <AnimatePresence initial={!reduce} mode="popLayout">
                  {group.items.map((item, index) => {
                    const style = KIND[item.kind] ?? FALLBACK;
                    const Icon = style.icon;
                    return (
                      <motion.li
                        key={item.id}
                        layout={!reduce}
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.35, delay: reduce ? 0 : Math.min(index, 8) * 0.04, ease: [0.22, 1, 0.36, 1] }}
                        className="relative"
                      >
                        <span className={cn("absolute -left-11 top-4 grid size-8 place-items-center rounded-full ring-4 ring-[var(--color-canvas)]", style.tone)}>
                          <Icon size={15} />
                        </span>
                        <article
                          className={cn(
                            "group flex flex-col gap-3 rounded-2xl border bg-[var(--color-surface)] p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_40px_-24px_rgba(28,27,25,.45)] sm:p-5",
                            item.status === "pending" ? "border-amber-200/80" : "border-[var(--color-line)]",
                          )}
                        >
                          <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            <Link href={`${providerBase}/${item.providerSlug}`} className="flex min-w-0 items-center gap-2.5">
                              <ProviderLogo slug={item.providerSlug} name={item.providerName} size={30} />
                              <span className="truncate text-[15px] font-semibold transition group-hover:text-[var(--color-orange-deep)]">{item.providerName}</span>
                            </Link>
                            <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ring-1", style.tone, style.ring)}>{item.label}</span>
                            <span className="flex-1" />
                            {item.status === "pending" ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-amber-700">
                                <span className="size-1.5 animate-pulse rounded-full bg-amber-500" /> Awaiting review
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-emerald-700">Reviewed</span>
                            )}
                            <time dateTime={item.detectedAt} className="text-[12px] tabular text-[var(--color-faint)]">
                              {ago(item.detectedAt, nowMs)}
                            </time>
                          </header>
                          <p className="text-[14.5px] leading-relaxed text-[var(--color-ink)]">{item.summary}</p>
                          <Diff previous={item.previous} current={item.current} />
                          <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-dashed border-[var(--color-line)] pt-3">
                            <Confidence value={item.confidence} />
                            <span className="font-mono text-[11px] text-[var(--color-faint)]">{item.field}</span>
                            {Object.values(item.affects).length ? (
                              <span className="flex flex-wrap gap-1">
                                {Object.values(item.affects).slice(0, 5).map((v) => (
                                  <span key={v} className="rounded-md bg-[var(--color-canvas)] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-[var(--color-ink-soft)]">
                                    {v}
                                  </span>
                                ))}
                              </span>
                            ) : null}
                          </footer>
                        </article>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-[var(--color-line-strong)] p-8 text-center text-[13.5px] text-[var(--color-muted)]">No changes match these filters.</p>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label, count, icon: Icon, dot }: { active: boolean; onClick: () => void; label: string; count: number; icon?: LucideIcon; dot?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition",
        active ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white" : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:-translate-y-px hover:border-[var(--color-line-strong)]",
      )}
    >
      {Icon ? <Icon size={13} className={active ? "text-white" : ""} /> : dot ? <span className={cn("size-1.5 rounded-full", dot)} /> : null}
      {label}
      <span className={cn("rounded-full px-1.5 text-[10.5px] tabular", active ? "bg-white/20" : "bg-[var(--color-canvas)] text-[var(--color-muted)]")}>{count}</span>
    </button>
  );
}
