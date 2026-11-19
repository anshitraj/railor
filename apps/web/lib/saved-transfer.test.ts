import { describe, expect, it, vi } from "vitest";
import { savedTransferHref, transferBookmarkKey } from "./saved-transfer";
import { parsePairInput } from "./saved-pairs";

vi.mock("server-only", () => ({}));

const context = { profile: "personal", country: "IN", direction: "receive", purpose: "personal", paymentMethod: "local_bank" } as const;
const pair = { from: "USD", to: "INR", amount: 1000 };

describe("saved transfers", () => {
  it("preserves a provider, profile and funding method in saved links without changing existing pair links", () => {
    expect(savedTransferHref(parsePairInput(pair)!)).toBe("/app/prices?from=USD&to=INR&amount=1000");
    const wise = parsePairInput({ ...pair, provider: { slug: "market:wise", name: "Wise" }, context, destinationCountry: "IN" })!;
    expect(wise.provider?.slug).toBe("wise");
    const href = new URL(savedTransferHref(wise), "https://railor.xyz");
    expect(Object.fromEntries(href.searchParams)).toMatchObject({ provider: "wise", country: "IN", destinationCountry: "IN", profile: "personal", direction: "receive", paymentMethod: "local_bank" });
  });

  it("gives the same pair different keys per provider and funding method", () => {
    const wise = { ...pair, provider: { slug: "wise", name: "Wise" }, context };
    const remitly = { ...wise, provider: { slug: "remitly", name: "Remitly" } };
    const wire = { ...wise, context: { ...context, paymentMethod: "wire" as const } };
    expect(new Set([pair, wise, remitly, wire].map(transferBookmarkKey)).size).toBe(4);
    expect(parsePairInput({ ...pair, provider: wise.provider, context: {} })).toBeNull();
  });
});
