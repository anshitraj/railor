import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), save: vi.fn(), materialize: vi.fn(), redirect: vi.fn() }));
vi.mock("../../lib/auth", () => ({ requireSession: mocks.session }));
vi.mock("../../lib/org", () => ({ saveOnboarding: mocks.save, materializeWorkspace: mocks.materialize }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
const actions = await import("./actions");
const answers = { building: "freelancer", entityCountry: "IN", targetCountries: ["AE"], interests: ["bank_payouts"] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "user-test" }, organization: { id: "org-test" } });
  mocks.save.mockResolvedValue(undefined); mocks.materialize.mockResolvedValue(1);
});

describe("onboarding completion", () => {
  it("returns the safe destination only after answers and workspace are saved", async () => {
    expect(await actions.completeOnboarding(answers, "/app/prices?from=USD&to=INR")).toEqual({ destination: "/app/prices?from=USD&to=INR" });
    expect(mocks.save).toHaveBeenCalledWith("org-test", expect.objectContaining(answers), 5);
    expect(mocks.materialize).toHaveBeenCalledWith("org-test", "user-test", expect.objectContaining(answers));
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("keeps completion destinations inside Railor", async () => {
    expect(await actions.completeOnboarding(answers, "https://outside.invalid")).toEqual({ destination: "/app" });
  });
  it("does not report success when workspace creation fails", async () => {
    mocks.materialize.mockRejectedValueOnce(new Error("Storage unavailable"));
    await expect(actions.completeOnboarding(answers)).rejects.toThrow("Storage unavailable");
  });
  it("requires an authenticated workspace before saving", async () => {
    mocks.session.mockResolvedValue({ user: { id: "user-test" } });
    await expect(actions.completeOnboarding(answers)).rejects.toThrow("Workspace unavailable");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("preserves the redirect behavior for existing server callers", async () => {
    await actions.finishOnboarding(answers, "/app/developers");
    expect(mocks.materialize).toHaveBeenCalledOnce();
    expect(mocks.redirect).toHaveBeenCalledWith("/app/developers");
  });
});
