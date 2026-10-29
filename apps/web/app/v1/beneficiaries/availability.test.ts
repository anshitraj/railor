import { beforeEach, describe, expect, it, vi } from "vitest";

const services = vi.hoisted(() => ({ createBeneficiary: vi.fn(), listBeneficiaries: vi.fn(), archiveBeneficiary: vi.fn(), createPayment: vi.fn(), submitPayment: vi.fn(), getPaymentDetail: vi.fn(), serializePayment: vi.fn(), listPayments: vi.fn() }));
vi.mock("@railor/core", () => ({ ...services, PaymentError: class PaymentError extends Error { constructor(public code: string, message: string, public status: number) { super(message); } } }));
vi.mock("../../../lib/v1", () => ({
  v1Route: (_path: string, _method: string, handler: Function) => () => handler({ organizationId: "workspace", mode: "live" }, new Request("https://railor.test/v1", { method: "POST", body: "{}" }), { id: "saved-recipient" }),
  camelTop: vi.fn(), jsonBody: vi.fn(),
}));
vi.mock("../../../lib/payments", () => ({ paymentDeps: vi.fn() }));
vi.mock("../../../lib/decisions", () => ({ parsePaymentIntentBody: vi.fn() }));
vi.mock("../../../lib/api-auth", () => ({ ApiError: class extends Error {} }));
import { GET, POST } from "./route";
import { DELETE } from "./[id]/route";
import { POST as createPayment } from "../payments/route";
import { POST as submitPayment } from "../payments/[id]/submit/route";

describe("beneficiary feature availability", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([["list", GET], ["create", POST], ["archive", DELETE], ["create payment", createPayment], ["submit payment", submitPayment]])("refuses %s before touching stored recipients or provider services", async (_name, route) => {
    await expect((route as Function)()).rejects.toMatchObject({ code: "beneficiaries_disabled", status: 403 });
    Object.values(services).forEach(service => expect(service).not.toHaveBeenCalled());
  });
});
