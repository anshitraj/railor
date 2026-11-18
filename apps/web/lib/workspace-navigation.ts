/**
 * The workspace has six places. Every page belongs to exactly one, so the
 * sidebar always highlights where you are and the area tabs show what else
 * lives there.
 */
export const PRICE_PATHS = ["/app/prices", "/app/freelancer"];
export const ROUTE_PATHS = ["/app/search", "/app/corridors", "/app/providers", "/app/compare", "/app/map"];
export const RULE_PATHS = ["/app/policies", "/app/decisions", "/app/approvals", "/app/audit", "/app/payroll"];
export const ACTIVITY_PATHS = ["/app/payments", "/app/changes", "/app/monitoring", "/app/evidence", "/app/discovery", "/app/beneficiaries", "/app/routing", "/app/readiness"];
export const DEVELOPER_PATHS = ["/app/developers", "/app/connectors", "/app/settings/connections"];

export type WorkspaceArea = "Home" | "Prices" | "Routes" | "Company" | "Activity" | "Developers" | "Agent" | "Settings";

export const matchesPath = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

export function workspaceArea(pathname: string): WorkspaceArea {
  if (pathname === "/app") return "Home";
  if (PRICE_PATHS.some((path) => matchesPath(pathname, path))) return "Prices";
  if (ROUTE_PATHS.some((path) => matchesPath(pathname, path))) return "Routes";
  if (RULE_PATHS.some((path) => matchesPath(pathname, path))) return "Company";
  if (DEVELOPER_PATHS.some((path) => matchesPath(pathname, path))) return "Developers";
  if (ACTIVITY_PATHS.some((path) => matchesPath(pathname, path))) return "Activity";
  if (matchesPath(pathname, "/app/agent")) return "Agent";
  return "Settings";
}
