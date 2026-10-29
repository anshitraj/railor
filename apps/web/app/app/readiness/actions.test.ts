import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/auth", () => ({ requireSession: session }));
const { setReadiness, applyParsedRequirements } = await import("./actions");

describe("retired readiness actions", () => {
  beforeEach(() => { session.mockReset(); session.mockResolvedValue({ role: "owner" }); });
  it("rejects a checklist write from an old authenticated tab", async () => {
    expect(await setReadiness("kyb", "have")).toMatchObject({ ok: false });
    expect(session).toHaveBeenCalledOnce();
  });
  it("does not mark parsed documents as satisfied", async () => {
    expect(await applyParsedRequirements(["kyc", "kyb"])).toMatchObject({ ok: false, count: 0 });
  });
  it("still requires a session", async () => {
    session.mockRejectedValue(new Error("Unauthenticated"));
    await expect(setReadiness("kyb", "have")).rejects.toThrow("Unauthenticated");
  });
});
