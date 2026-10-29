"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { matchesPath, workspaceArea } from "../../lib/workspace-navigation";

const AREAS = {
  Compare: { links: [["Prices", "/app/prices"], ["Find a route", "/app/search"], ["Saved routes & corridors", "/app/corridors"], ["Providers", "/app/providers"]], more: [["Compare providers", "/app/compare"], ["Route map", "/app/map"], ["Get paid · invoices", "/app/freelancer"]] },
  Developers: { links: [["API & agent setup", "/app/developers"], ["Provider accounts", "/app/settings/connections"]], more: [["Customer-hosted runtime", "/app/connectors"]] },
  History: { links: [["Payment history", "/app/payments"]], more: [["Rule checks", "/app/decisions"], ["Team reviews", "/app/approvals"]] },
};
export function WorkspaceAreaNav() {
  const pathname = usePathname(); const area = workspaceArea(pathname);
  const section = AREAS[area as keyof typeof AREAS];
  if (!section) return null;
  const activeMore = section.more.find(([, href]) => matchesPath(pathname, href!));
  return <nav aria-label={`${area} tools`} className="mb-7 flex flex-wrap items-center gap-1 border-b border-[var(--color-line)] pb-3 text-xs">
    {section.links.map(([label, href]) => <Link key={href} href={href!} aria-current={matchesPath(pathname, href!) ? "page" : undefined} className={`rounded-lg px-3 py-2 ${matchesPath(pathname, href!) ? "bg-[var(--color-ink)] font-semibold text-white" : "text-[var(--color-muted)] hover:bg-[var(--color-surface)]"}`}>{label}</Link>)}
    <details key={pathname} className="relative"><summary className={`flex cursor-pointer list-none items-center gap-1 rounded-lg px-3 py-2 ${activeMore ? "bg-[var(--color-surface)] font-semibold" : "text-[var(--color-muted)]"}`}>{activeMore?.[0] ?? "More tools"}<ChevronDown size={12} /></summary><div className="absolute left-0 top-full z-40 mt-2 flex w-56 flex-col gap-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-2 shadow-lg">{section.more.map(([label, href]) => <Link key={href} href={href!} className="rounded-lg px-3 py-2 hover:bg-[var(--color-canvas)]" aria-current={matchesPath(pathname, href!) ? "page" : undefined}>{label}</Link>)}</div></details>
  </nav>;
}
