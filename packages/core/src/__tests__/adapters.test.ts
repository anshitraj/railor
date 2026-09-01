/**
 * Provider adapters: fail-closed behavior only — no test here ever calls a
 * live provider endpoint. Nium and Circle CPN are new this pass.
 */
import { describe, expect, it } from "vitest";
import { getAdapter } from "../adapters.js";

describe("nium adapter", () => {
  it("registers with both required credential fields", () => {
    const adapter = getAdapter("nium");
    expect(adapter).not.toBeNull();
    expect(adapter!.credentialFields.map((f) => f.key).sort()).toEqual(["apiKey", "clientHashId"]);
  });

  it("refuses to test a connection with missing credentials, without making a network call", async () => {
    const adapter = getAdapter("nium")!;
    const result = await adapter.testConnection({});
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/required/i);
  });

  it("has no getQuote yet — unimplemented, not faked", () => {
    const adapter = getAdapter("nium")!;
    expect(adapter.getQuote).toBeUndefined();
  });
});

describe("circle adapter — CPN getQuote", () => {
  it("refuses a quote with no API key", async () => {
    const adapter = getAdapter("circle")!;
    await expect(
      adapter.getQuote!({}, { sourceAsset: "USDC", destinationCurrency: "MXN", destinationCountry: "MX", amount: 100 }),
    ).rejects.toThrow(/API key is required/i);
  });

  it("never infers paymentMethodType from the destination currency — refuses instead", async () => {
    const adapter = getAdapter("circle")!;
    await expect(
      adapter.getQuote!(
        { apiKey: "fake-key-for-shape-test-only" },
        { sourceAsset: "USDC", destinationCurrency: "MXN", destinationCountry: "MX", amount: 100 },
      ),
    ).rejects.toThrow(/paymentMethodType is required/i);
  });

  it("never infers entityCountry — refuses instead of defaulting to a hardcoded market", async () => {
    const adapter = getAdapter("circle")!;
    await expect(
      adapter.getQuote!(
        { apiKey: "fake-key-for-shape-test-only" },
        { sourceAsset: "USDC", destinationCurrency: "MXN", destinationCountry: "MX", amount: 100, paymentMethodType: "SPEI" },
      ),
    ).rejects.toThrow(/entityCountry is required/i);
  });
});
