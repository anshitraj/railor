import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PriceRow } from "@railor/core";
import { DeliveryAndPaperwork, FeesAndLimits, KycGuide } from "./provider-detail-panels";

type Assessment = NonNullable<PriceRow["profileAssessment"]>;
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const base: Assessment = {
  status: "unconfirmed", reasons: [], verification: [], documents: [], settlement: [], fees: "", limits: "", corridors: "", purpose: "", sources: [], reviewedAt: null,
} as unknown as Assessment;
const kyc = (over: Partial<NonNullable<Assessment["kyc"]>> = {}): NonNullable<Assessment["kyc"]> => ({
  appliesTo: "you", scope: "Wise’s rules for an Indian business.", match: "country", documents: ["Business PAN", "Director ID", "Selfie, taken in the app"],
  documentsUrl: "https://wise.com/docs", approvalTime: { label: "About 2 working days", detail: "Wise says up to 10.", url: "https://wise.com/time" }, reviewedAt: "2026-11-26", ...over,
});
const row = (over: Partial<PriceRow> = {}) => ({ notes: [], missing: [], side: "payer", ...over }) as unknown as PriceRow;

describe("the KYC tab", () => {
  it("leads with the published approval time, the documents, and the usual order of steps", () => {
    const shown = text(renderToStaticMarkup(<KycGuide assessment={{ ...base, kyc: kyc() }} provider="Wise" />));
    expect(shown).toContain("About 2 working days");
    expect(shown).toContain("3 to prepare");
    expect(shown).toContain("Business PAN");
    expect(shown).toContain("Submit your documents");
    expect(shown).toContain("including the selfie");
    expect(shown).toContain("Railor never verifies anyone");
  });

  it("says the check belongs to the sender when it does, and never invents a turnaround", () => {
    const shown = text(renderToStaticMarkup(<KycGuide assessment={{ ...base, kyc: kyc({ appliesTo: "sender", approvalTime: null }) }} provider="Remitly" />));
    expect(shown).toContain("Your sender");
    expect(shown).toContain("Not published");
    expect(shown).toContain("Remitly doesn’t say how long approval takes");
  });

  it("falls back to questions to ask when the provider publishes nothing", () => {
    const shown = text(renderToStaticMarkup(<KycGuide assessment={base} provider="Banxa" />));
    expect(shown).toContain("No published KYC details yet");
    expect(shown).toContain("Which documents they need");
  });
});

describe("the fees and delivery tabs", () => {
  const fees = (over: Partial<Parameters<typeof FeesAndLimits>[0]> = {}) => text(renderToStaticMarkup(
    <FeesAndLimits row={row({ providerSlug: "someprovider", feeAmount: 9.87, feeCurrency: "USD", feeBreakdown: "6.11 funding + 3.76 provider fee", rate: 0.911452, recipientAmount: 902.46 } as Partial<PriceRow>)} assessment={base} method="Bank transfer" from="USD" to="EUR" amount={1000} reference={0.9114} provider="Acme" {...over} />,
  ));

  it("shows the numbers that are in the price itself first", () => {
    const shown = fees();
    expect(shown).toContain("Fee in this price: 9.87 USD (6.11 funding + 3.76 provider fee)");
    expect(shown).toContain("Exchange rate used: 1 USD = 0.911452 EUR");
    expect(shown).toContain("Recipient gets: 902.46 EUR for 1,000.00 USD sent");
    expect(shown).toContain("Bank transfer");
  });

  it("says plainly what a provider doesn't publish instead of calling it unverified", () => {
    const shown = fees({ assessment: { ...base, fees: "Account and purpose-specific fees are unconfirmed", limits: "Not verified for this product. No unlimited-transfer assumption." }, feeTax: "No verified tax treatment for this payment method." });
    expect(shown).toContain("Acme doesn’t publish a fee schedule for this route that Railor can read");
    expect(shown).toContain("Acme doesn’t publish a limit for this route that Railor can read");
    expect(shown).toContain("Acme doesn’t state how tax applies to its fee");
    expect(shown).not.toMatch(/not verified|unconfirmed|no verified/i);
  });

  it("adds what a provider itself publishes, with limits for the currencies on the route", () => {
    const shown = fees({ row: row({ providerSlug: "wise", feeAmount: 9.87, feeCurrency: "USD" } as Partial<PriceRow>), provider: "Wise" });
    expect(shown).toContain("percentage of the amount you send, plus a fixed fee");
    expect(shown).toContain("up to 1 million USD per local ACH transfer");
    expect(shown).toContain("up to 6 million EUR per transfer");
    expect(shown).not.toContain("doesn’t publish a limit");
  });

  it("hides topics with nothing to say and explains an empty tab", () => {
    expect(text(renderToStaticMarkup(<DeliveryAndPaperwork row={row()} assessment={base} />))).toContain("No delivery or paperwork details");
    expect(text(renderToStaticMarkup(<DeliveryAndPaperwork row={row({ notes: ["A note"] })} assessment={{ ...base, settlement: ["Pays a SEPA account."] }} delivery="by Friday" />))).toContain("Pays a SEPA account.");
  });
});
