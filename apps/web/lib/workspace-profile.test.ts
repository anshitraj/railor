import { describe, expect, it } from "vitest";
import { isCompanyPath, isCompanyWorkspace } from "./workspace-profile";

describe("company workspace gate", () => {
  it("keeps company tools for company workspaces only", () => {
    for (const building of ["personal", "freelancer", "freelancer_business"]) expect(isCompanyWorkspace(building)).toBe(false);
    for (const building of ["payments", "treasury", "other", null, undefined]) expect(isCompanyWorkspace(building)).toBe(true);
  });

  it("recognises company tool paths, including sub-pages and query strings", () => {
    expect(isCompanyPath("/app/audit")).toBe(true);
    expect(isCompanyPath("/app/decisions/123?x=1")).toBe(true);
    expect(isCompanyPath("/app/payroll#top")).toBe(true);
    expect(isCompanyPath("/app/prices")).toBe(false);
    expect(isCompanyPath("/app/policiesx")).toBe(false);
  });
});
