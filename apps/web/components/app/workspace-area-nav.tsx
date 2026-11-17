"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { matchesPath, workspaceArea, type WorkspaceArea } from "../../lib/workspace-navigation";

/** The tabs inside each workspace area: everything that lives there, one tap away. */
const AREAS: Partial<Record<WorkspaceArea, Array<[label: string, href: string]>>> = {
  Prices: [["Price check", "/app/prices"], ["Get paid · invoices", "/app/freelancer"]],
  Routes: [["Find a route", "/app/search"], ["Saved routes", "/app/corridors"], ["Providers", "/app/providers"], ["Compare providers", "/app/compare"], ["Route map", "/app/map"]],
  Rules: [["Company rules", "/app/policies"], ["Rule checks", "/app/decisions"], ["Team reviews", "/app/approvals"]],
  Activity: [["Payments", "/app/payments"], ["Changes", "/app/changes"], ["Monitoring", "/app/monitoring"], ["Evidence", "/app/evidence"]],
  Developers: [["API & AI tools", "/app/developers"], ["Provider accounts", "/app/settings/connections"], ["Self-hosted runtime", "/app/connectors"]],
};

export function WorkspaceAreaNav() {
  const pathname = usePathname();
  const area = workspaceArea(pathname);
  const tabs = AREAS[area];
  if (!tabs) return null;
  // The most specific tab wins (e.g. /app/settings/connections over /app/settings).
  const active = tabs.filter(([, href]) => matchesPath(pathname, href)).sort((a, b) => b[1].length - a[1].length)[0]?.[1];
  return (
    <nav aria-label={`${area} sections`} className="area-tabs">
      {tabs.map(([label, href]) => (
        <Link key={href} href={href} aria-current={href === active ? "page" : undefined} className="area-tab">{label}</Link>
      ))}
    </nav>
  );
}
