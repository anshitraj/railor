import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), save: vi.fn(), preview: vi.fn(), create: vi.fn(), archive: vi.fn(), payment: vi.fn(), submit: vi.fn(), refresh: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("../../../lib/auth", () => ({ requireSession: mocks.session }));
vi.mock("../../../lib/payments", () => ({ paymentDeps: () => ({}), describePaymentError: (error: any) => ({ code: error.code, message: error.message }) }));
vi.mock("@railor/core", () => ({
  PaymentError: class PaymentError extends Error { constructor(public code: string, message: string, public status: number) { super(message); } },
  updateRoutingSettings: mocks.save, previewPaymentRoute: mocks.preview,
  createBeneficiary: mocks.create, archiveBeneficiary: mocks.archive, createPayment: mocks.payment, submitPayment: mocks.submit,
  cancelPayment: vi.fn(), createWebhookEndpoint: vi.fn(), deleteWebhookEndpoint: vi.fn(), reconcilePayment: vi.fn(), rollWebhookSecret: vi.fn(), sendTestWebhook: vi.fn(), setWebhookEndpointEnabled: vi.fn(),
}));
import { archiveBeneficiaryAction, createBeneficiaryAction, createPaymentAction, submitPaymentAction, previewRouteAction, updateRoutingSettingsAction } from "./actions";

describe("routing permissions and unavailable recipients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ organization: { id: "org" }, user: { id: "user" }, role: "owner" });
    mocks.save.mockResolvedValue({});
  });
  it.each(["viewer", "member"])("rejects routing changes by a %s before saving", async role => {
    mocks.session.mockResolvedValue({ organization: { id: "org" }, user: { id: "user" }, role });
    expect(await updateRoutingSettingsAction({ routingPreset: "cheapest" })).toMatchObject({ ok: false, code: "forbidden" });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each(["owner", "admin"])("saves and revalidates routing for an %s", async role => {
    mocks.session.mockResolvedValue({ organization: { id: "org" }, user: { id: "user" }, role });
    expect(await updateRoutingSettingsAction({ routingPreset: "cheapest" })).toMatchObject({ ok: true });
    expect(mocks.save).toHaveBeenCalledWith("org", { routingPreset: "cheapest" });
    expect(mocks.refresh).toHaveBeenCalledWith("/app/routing");
  });
  it("returns a save failure without reporting success", async () => {
    mocks.save.mockRejectedValueOnce(new Error("Database temporarily unavailable"));
    expect(await updateRoutingSettingsAction({})).toMatchObject({ ok: false, error: "Database temporarily unavailable" });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("keeps preview available to members and unavailable to viewers", async () => {
    mocks.session.mockResolvedValueOnce({ organization: { id: "org" }, user: { id: "user" }, role: "member" });
    mocks.preview.mockResolvedValueOnce({ decisionStatus: "allow", plan: { candidates: [] } });
    expect(await previewRouteAction({ mode: "test" })).toMatchObject({ ok: true });
    mocks.session.mockResolvedValueOnce({ organization: { id: "org" }, user: { id: "user" }, role: "viewer" });
    expect(await previewRouteAction({ mode: "test" })).toMatchObject({ ok: false, code: "forbidden" });
    expect(mocks.preview).toHaveBeenCalledTimes(1);
  });
  it("denies beneficiary and payment writes even for the owner", async () => {
    for (const run of [() => createBeneficiaryAction({}), () => archiveBeneficiaryAction("any-id"), () => createPaymentAction({}), () => submitPaymentAction("any-id")]) {
      expect(await run()).toMatchObject({ ok: false, code: "beneficiaries_disabled" });
    }
    for (const service of [mocks.create, mocks.archive, mocks.payment, mocks.submit]) expect(service).not.toHaveBeenCalled();
  });
});
