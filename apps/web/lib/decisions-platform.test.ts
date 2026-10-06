import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ local: vi.fn(), credentials: vi.fn(), platform: vi.fn(), account: vi.fn(), public: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@railor/core", () => ({ getAdapter: () => ({ getQuote: mocks.account }), loadDecision: vi.fn(), loadConnectorQuote: mocks.local, wisePublicQuote: mocks.public }));
vi.mock("./connections", () => ({ getConnectionCredentials: mocks.credentials }));
vi.mock("./platform-pricing", () => ({ fetchPlatformReferenceQuote: mocks.platform }));
import { buildFetchQuote } from "./decisions";
const request = { sourceAsset: "USD", destinationCurrency: "EUR", amount: 1000 };

describe("platform pricing is read-only and separate from execution credentials", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.local.mockResolvedValue(null); mocks.credentials.mockResolvedValue(null); mocks.platform.mockResolvedValue({ accountContext: "railor_network" }); });
  it("uses backend pricing only with explicit read-only authorization", async () => {
    expect(await buildFetchQuote("org-a")("airwallex", "provider", request)).toBeNull();
    expect(mocks.platform).not.toHaveBeenCalled();
    expect(await buildFetchQuote("org-a", false, true)("airwallex", "provider", request)).toMatchObject({ accountContext: "railor_network" });
    expect(mocks.credentials).toHaveBeenCalledWith("org-a", "provider");
    expect(mocks.account).not.toHaveBeenCalled();
  });
  it("never uses platform keys for connector-only decision recording or revalidation", async () => {
    expect(await buildFetchQuote("org-b", true, true)("airwallex", "provider", request)).toBeNull();
    expect(mocks.credentials).not.toHaveBeenCalled(); expect(mocks.platform).not.toHaveBeenCalled(); expect(mocks.account).not.toHaveBeenCalled();
  });
  it("prefers a customer's own scoped connector or credentials over the platform", async () => {
    mocks.local.mockResolvedValue({ accountContext: "customer_connected" });
    expect(await buildFetchQuote("org-a", false, true)("airwallex", "provider", request)).toMatchObject({ accountContext: "customer_connected" });
    expect(mocks.platform).not.toHaveBeenCalled();
    mocks.local.mockResolvedValue(null); mocks.credentials.mockResolvedValue({ apiKey: "org-a-secret" }); mocks.account.mockResolvedValue({ accountContext: "customer_connected" });
    await buildFetchQuote("org-a", false, true)("airwallex", "provider", request);
    expect(mocks.account).toHaveBeenCalledWith({ apiKey: "org-a-secret" }, request);
    expect(mocks.platform).not.toHaveBeenCalled();
  });
});
