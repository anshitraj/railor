import { describe, expect, it } from "vitest";
import { interpretRules } from "../interpret.js";

describe("interpretRules", () => {
  it("reads the flagship query the way a human would", () => {
    const { query, tokens } = interpretRules(
      "I have an Indian company and need USDC → AED business payouts",
    );
    expect(query.entityCountry).toBe("IN");
    expect(query.sourceAsset).toBe("USDC");
    expect(query.destinationCurrency).toBe("AED");
    expect(query.destinationCountry).toBe("AE"); // inferred from AED
    expect(query.customerType).toBe("business");
    expect(tokens.every((t) => t.confidence > 0)).toBe(true);
  });

  it("uses role markers rather than word order", () => {
    const { query } = interpretRules(
      "Indian company sending USDC on Base to a UAE supplier who receives AED",
    );
    expect(query.entityCountry).toBe("IN");
    expect(query.destinationCountry).toBe("AE");
    expect(query.sourceNetwork).toBe("base");
  });

  it("treats a lone country as the destination", () => {
    const { query } = interpretRules("which providers support Nigeria");
    expect(query.destinationCountry).toBe("NG");
    expect(query.entityCountry).toBeUndefined();
  });

  it("detects products and customer type", () => {
    const { query } = interpretRules("virtual card providers for UAE customers");
    expect(query.product).toBe("card_issuing");
    expect(query.destinationCountry).toBe("AE");
  });

  it("parses amounts with scale suffixes", () => {
    const { query } = interpretRules("$20,000 USDC payout to UAE");
    expect(query.amount).toBe(20000);
  });

  it("reports what it could not determine instead of guessing", () => {
    const { missing } = interpretRules("compare business ramps");
    expect(missing).toContain("entityCountry");
    expect(missing).toContain("destinationCountry");
  });
});
