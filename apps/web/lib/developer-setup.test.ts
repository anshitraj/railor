import { describe, expect, it } from "vitest";
import { developerExampleQuery } from "./developer-setup";

describe("first-request examples", () => {
  it.each([["personal", "individual"], ["freelancer", "individual"], ["freelancer_business", "business"], ["payments", "business"]] as const)("uses the %s workspace's actual customer type", (building, expected) => {
    expect(developerExampleQuery({ building, entityCountry: "IN", targetCountries: ["AE"] })).toMatchObject({ entity_country: "IN", destination_country: "AE", customer_type: expected });
  });
  it("does not invent an AED destination currency for other countries", () => {
    const query = developerExampleQuery({ building: "personal", entityCountry: "IN", targetCountries: ["MX"] });
    expect(query.destination_country).toBe("MX"); expect(query).not.toHaveProperty("destination_currency");
  });
  it("preserves a saved fiat route and explicit customer instead of silently changing to USDC", () => {
    expect(developerExampleQuery({ building: "payments", entityCountry: "IN" }, { entityCountry: "GB", customerType: "individual", sourceCurrency: "GBP", destinationCountry: "IN", destinationCurrency: "INR", amount: 1000, namedRail: "UPI" })).toMatchObject({ entity_country: "GB", customer_type: "individual", source_currency: "GBP", destination_country: "IN", destination_currency: "INR", amount: 1000, named_rail: "UPI" });
    expect(developerExampleQuery({}, { sourceCurrency: "USD" })).not.toHaveProperty("asset");
  });
  it("matches a destination to its own saved currency preference", () => {
    expect(developerExampleQuery({ targetCountries: ["AE", "SG"], settlementCurrencies: ["AED", "SGD"] }, { destinationCountry: "SG" })).toMatchObject({ destination_currency: "SGD" });
  });
});
