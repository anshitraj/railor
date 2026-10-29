export const COMPARE_PATHS = ["/app/prices", "/app/search", "/app/corridors", "/app/providers", "/app/compare", "/app/map", "/app/freelancer"];
export const DEVELOPER_PATHS = ["/app/developers", "/app/connectors", "/app/settings/connections"];
export const HISTORY_PATHS = ["/app/payments", "/app/decisions", "/app/approvals"];
export const matchesPath = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);
export function workspaceArea(pathname: string) {
  if (COMPARE_PATHS.some(path => matchesPath(pathname, path))) return "Compare";
  if (DEVELOPER_PATHS.some(path => matchesPath(pathname, path))) return "Developers";
  if (HISTORY_PATHS.some(path => matchesPath(pathname, path))) return "History";
  if (matchesPath(pathname, "/app/agent")) return "Agent";
  return pathname === "/app" ? "Overview" : "Settings";
}
