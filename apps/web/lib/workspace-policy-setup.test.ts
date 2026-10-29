import { describe, expect, it } from "vitest";
import { workspacePolicySetup } from "./workspace-policy-setup";

describe("workspace policy setup", () => {
  const saved = { id: "saved-policy", name: "Production policy" };
  it("recognizes a saved draft without asking the user to create another policy", () => {
    expect(workspacePolicySetup(false, saved, true)).toMatchObject({ title: "Review your saved policy", action: "Review & activate", href: "/app/policies/saved-policy", done: false });
    expect(workspacePolicySetup(false, saved, true).description).toContain("Production policy is saved");
  });
  it("marks an active policy complete", () => {
    expect(workspacePolicySetup(true, saved, true)).toMatchObject({ title: "Company policy active", done: true });
  });
  it("offers creation only when no saved policy exists", () => {
    expect(workspacePolicySetup(false, null, true)).toMatchObject({ action: "Create a policy", href: "/app/policies#create-policy", done: false });
  });
  it("keeps activation with owners and admins", () => {
    expect(workspacePolicySetup(false, saved, false)).toMatchObject({ action: "View saved policy", done: false });
    expect(workspacePolicySetup(false, saved, false).description).toContain("owner or admin");
  });
});
