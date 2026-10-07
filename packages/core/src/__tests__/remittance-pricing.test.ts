import { describe, expect, it } from "vitest";
import { remittanceProviderCatalog, remittanceProviderDirectory, remittanceSurvey } from "../public-pricing/remittances.js";

describe("World Bank remittance survey pricing", () => {
  const input = { sourceCurrency: "USD", destinationCurrency: "INR", destinationCountry: "IN", amount: 1000 };
  it("includes hundreds of sourced providers and preserves surveyed amounts instead of extrapolating", () => {
    const survey = remittanceSurvey(input);
    expect(survey.providersTracked).toBe(400);
    expect(survey.sampleCount).toBe(12905);
    expect(survey.period).toBe("2025 Q3");
    expect(survey.samples.length).toBeGreaterThan(10);
    expect(survey.samples.every(sample => sample.destinationCountry === "IND" && sample.sourceCurrency === "USD")).toBe(true);
    expect(survey.samples.some(sample => sample.amount !== input.amount)).toBe(true);
    expect(remittanceSurvey({ ...input, amount: 10000 }).samples).toEqual(survey.samples);
    expect(survey.sourceUrl).toContain("worldbank.org");
  });
  it("never substitutes the account holder's country for a sending destination", () => {
    const context = { profile: "business" as const, country: "IN", direction: "send" as const, purpose: "services" as const };
    const survey = remittanceSurvey({ sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000, context });
    expect(survey.destinationCountry).toBeNull();
    expect(survey.samples).toEqual([]);
    expect(survey.destinationOptions.length).toBeGreaterThan(90);
    expect(survey.destinationOptions).toContainEqual({ code: "XK", name: "Kosovo" });
  });
  it("selects a receiving country or explicit destination without asserting its payout currency", () => {
    const context = { profile: "business" as const, country: "IN", direction: "receive" as const, purpose: "services" as const };
    expect(remittanceSurvey({ ...input, destinationCountry: undefined, context }).samples.length).toBeGreaterThan(0);
    const survey = remittanceSurvey({ ...input, destinationCountry: "PH", context });
    expect(survey.destinationCountry).toBe("PH");
    expect(survey.samples.every(sample => sample.destinationCountry === "PHL")).toBe(true);
    expect(survey.samples.every(sample => !("recipientAmount" in sample) && !("exchangeRate" in sample))).toBe(true);
    const kosovo = remittanceSurvey({ ...input, destinationCountry: "XK" });
    expect(kosovo.destinationName).toBe("Kosovo");
    expect(kosovo.samples.every(sample => sample.destinationCountry === "KSV")).toBe(true);
  });
  it("hides undisclosed FX costs, preserves collection dates, and returns independent copies", () => {
    const survey = remittanceSurvey({ sourceCurrency: "USD", destinationCurrency: "MXN", destinationCountry: "MX", amount: 500 });
    expect(survey.samples.every(sample => sample.fee >= 0 && Number.isFinite(sample.fee) && /^2025-/.test(sample.observedAt))).toBe(true);
    for (const sample of survey.samples.filter(sample => !sample.transparent)) {
      expect(sample.fxMarginPct).toBeNull(); expect(sample.totalCostPct).toBeNull();
    }
    const catalog = remittanceProviderCatalog();
    catalog[0]!.name = "changed";
    expect(remittanceProviderCatalog()[0]!.name).not.toBe("changed");
  });
  it("provides an actual fee observation for each country shown on a provider card", () => {
    const directory = remittanceProviderDirectory();
    expect(directory).toHaveLength(400);
    for (const provider of directory) {
      expect(provider.countryExamples.map(sample => sample.destinationCountryName).sort()).toEqual(provider.receivingCountries);
      expect(provider.countryExamples.every(sample => sample.provider === provider.slug)).toBe(true);
    }
  });
});
