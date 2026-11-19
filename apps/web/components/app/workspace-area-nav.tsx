"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { matchesPath, workspaceArea, type WorkspaceArea } from "../../lib/workspace-navigation";

/** The tabs inside each workspace area: everything that lives there, one tap away. */
const AREAS: Partial<Record<WorkspaceArea, Array<[label: string, href: string]>>> = {
  Transfer: [["Compare & send", "/app/prices"], ["Get paid · invoices", "/app/freelancer"]],
  Routes: [["Find a route", "/app/search"], ["Providers", "/app/providers"], ["Compare providers", "/app/compare"], ["Route map", "/app/map"]],
  Company: [["Payment audit", "/app/audit"], ["Payroll pricing", "/app/payroll"], ["Company rules", "/app/policies"], ["Rule checks", "/app/decisions"], ["Team reviews", "/app/approvals"]],
  Activity: [["Payments", "/app/payments"], ["Changes", "/app/changes"], ["Monitoring", "/app/monitoring"], ["Evidence", "/app/evidence"]],
  Developers: [["API & AI tools", "/app/developers"], ["Provider accounts", "/app/settings/connections"]],
};

export function WorkspaceAreaNav() {
  const pathname = usePathname();
  const area = workspaceArea(pathname);
  const tabs = AREAS[area];
  const nav = useRef<HTMLElement>(null);
  // The most specific tab wins (e.g. /app/settings/connections over /app/settings).
  const active = tabs?.filter(([, href]) => matchesPath(pathname, href)).sort((a, b) => b[1].length - a[1].length)[0]?.[1];
  useEffect(() => {
    const list = nav.current;
    const current = list?.querySelector('[aria-current="page"]');
    if (!list || !current) return;
    const viewport = list.getBoundingClientRect();
    const tab = current.getBoundingClientRect();
    if (tab.left < viewport.left || tab.right > viewport.right) {
      list.scrollLeft += tab.left - viewport.left - (viewport.width - tab.width) / 2;
    }
  }, [active]);
  if (!tabs) return null;
  return (
    <nav ref={nav} aria-label={`${area} sections`} className="area-tabs">
      {tabs.map(([label, href]) => (
        <Link key={href} href={href} aria-current={href === active ? "page" : undefined} className="area-tab">{label}</Link>
      ))}
    </nav>
  );
}
