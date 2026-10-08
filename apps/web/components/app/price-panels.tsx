import Link from "next/link";
import { ArrowRight, Banknote, BookOpen, Link2, Shuffle, Zap } from "lucide-react";
import { cn } from "@railor/ui";

const TOOLS = {
  app: [
    { href: "/app/prices", label: "Price check", icon: Zap },
    { href: "/app/payments/new", label: "Send", icon: Banknote },
    { href: "/app/settings/connections", label: "Your accounts", icon: Link2 },
    { href: "/app/routing", label: "Routing", icon: Shuffle },
    { href: "/docs/payments", label: "API", icon: BookOpen },
  ],
  public: [
    { href: "/prices", label: "Price check", icon: Zap },
    { href: "/providers", label: "Providers", icon: Link2 },
    { href: "/docs/payments", label: "API", icon: BookOpen },
  ],
};

/** The left rail: where live quotes sit among the other ways to act on a price. */
export function PriceToolsNav({ mode, title }: { mode: "app" | "public"; title: string }) {
  return (
    <nav aria-label="Price tools" className="flex flex-col gap-3">
      <span className="product-eyebrow mb-1">Price intelligence</span>
      <h1 className="font-display text-[26px] font-semibold leading-none tracking-[-0.04em]">{title}</h1>
      <ul className="flex gap-1 overflow-x-auto lg:flex-col">
        {TOOLS[mode].map((t, i) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={i === 0 ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-[13.5px] font-semibold transition",
                i === 0 ? "bg-[var(--color-ink)] text-white" : "text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]",
              )}
            >
              <t.icon size={15} />
              {t.label}
              {i === 0 ? <ArrowRight size={14} className="ml-auto hidden lg:block" /> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const LABELS = [
  { tag: "Your account", tone: "bg-emerald-100 text-emerald-800", text: "Quote from your own connected account. Check fee completeness and validity before acting." },
  { tag: "Public reference", tone: "bg-sky-100 text-sky-800", text: "Panel checked every 20 seconds; source observations may be cached. See each price's collection time. Not a customer-specific executable quote." },
  { tag: "Railor account", tone: "bg-orange-100 text-orange-800", text: "Backend-managed quote observation, displayed separately. Sandbox means test data; fee coverage varies by provider." },
  { tag: "Published", tone: "bg-amber-100 text-amber-800", text: "The provider's published fee schedule (PayZoll, Skydo) applied at the mid-market rate." },
  { tag: "Estimate", tone: "bg-[var(--color-canvas)] text-[var(--color-muted)]", text: "Dated consumer prices Wise collects from banks and remittance apps. Context only." },
  { tag: "Historical sample", tone: "bg-amber-100 text-amber-800", text: "World Bank remittance fee surveys across 400 provider entries. Original amounts and dates are preserved; never ranked as current quotes." },
  { tag: "Market coverage", tone: "bg-violet-100 text-violet-800", text: "Providers in Railor's wider market catalog that list the destination currency. Coverage is not a quote or route guarantee." },
];

/** The right rail: what each label means, and the one step that makes prices exact. */
export function PriceLabelsCard({ mode, connectedAny }: { mode: "app" | "public"; connectedAny: boolean }) {
  return (
    <aside className="flex flex-col gap-3">
      <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <p className="text-[13.5px] font-semibold">Every number says where it came from</p>
        <ul className="mt-3 flex flex-col gap-2.5">
          {LABELS.map((l) => (
            <li key={l.tag} className="flex flex-col gap-1">
              <span className={cn("w-fit rounded-md px-1.5 py-px text-[10px] font-bold uppercase tracking-wide", l.tone)}>{l.tag}</span>
              <span className="text-[12px] leading-snug text-[var(--color-muted)]">{l.text}</span>
            </li>
          ))}
        </ul>
      </div>
      {!connectedAny ? (
        <div className="product-dark p-4">
          <div className="relative z-10 flex flex-col gap-2">
            <p className="font-display text-[18px] font-semibold leading-tight">Explore first. Connect only if needed.</p>
            <p className="text-[12.5px] leading-snug text-white/65">
              Railor handles platform integrations on the backend. No credentials are needed to compare published features. An optional account connection is only for your own negotiated pricing and approved execution.
            </p>
            <Link href={mode === "app" ? "/app/settings/connections" : "/login?intent=start"} className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-[12.5px] font-bold text-[#22211f] transition hover:bg-[#ffad8c]">
              {mode === "app" ? "Connect an account" : "Start free"} <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
