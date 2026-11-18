/**
 * Company tools — rules, rule checks, team reviews, payment audit and payroll
 * pricing — are on for company workspaces only. Personal and freelancer
 * workspaces get everything else.
 */
export const COMPANY_PATHS = ["/app/policies", "/app/decisions", "/app/approvals", "/app/audit", "/app/payroll"];

const INDIVIDUAL = new Set(["personal", "freelancer", "freelancer_business"]);

/** A workspace that skipped the question is treated as a company, as onboarding assumes. */
export function isCompanyWorkspace(building?: string | null): boolean {
  return !INDIVIDUAL.has(building ?? "");
}

export function isCompanyPath(href: string): boolean {
  const path = href.split(/[?#]/, 1)[0]!;
  return COMPANY_PATHS.some((company) => path === company || path.startsWith(`${company}/`));
}
