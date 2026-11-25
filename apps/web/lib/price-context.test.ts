import { describe, expect, it } from "vitest";
import { contextForPair, pairDirection } from "./price-destination";

const receiving = { profile: "business" as const, country: "IN", direction: "receive" as const, purpose: "services" as const, paymentMethod: "wire" as const };

describe("contextForPair", () => {
  it("turns an India receiving check into a sending one when the pair is swapped", () => {
    expect(contextForPair(receiving, null, "INR", "USD")).toEqual({ profile: "business", country: "IN", direction: "send", purpose: "services" });
  });

  it("keeps the payer's method while still receiving INR, and picks a default when it starts receiving", () => {
    expect(contextForPair(receiving, null, "GBP", "INR")).toMatchObject({ direction: "receive", paymentMethod: "wire" });
    const sending = { profile: "personal" as const, country: "US", direction: "send" as const, purpose: "personal" as const };
    expect(contextForPair(sending, null, "USD", "INR")).toMatchObject({ direction: "receive", country: "IN", paymentMethod: "transfer_service" });
  });

  it("uses the US sender market for anonymous USD sends and the account's own country otherwise", () => {
    expect(contextForPair(receiving, null, "USD", "EUR")).toMatchObject({ direction: "send", country: "US" });
    expect(contextForPair(receiving, "AE", "AED", "INR")).toMatchObject({ direction: "send", country: "AE" });
    expect(pairDirection("AE", "INR")).toBe("send");
  });
});
