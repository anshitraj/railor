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
  it("does not print the same fee text twice", () => {
    const tax = "Wise says its funding methods are exempt from the U.S. 1% remittance tax.";
    const shown = text(renderToStaticMarkup(<FeesAndLimits row={row()} assessment={{ ...base, fees: tax }} feeTax={tax} method="Bank transfer" to="EUR" />));
    expect(shown.split(tax).length - 1).toBe(1);
    expect(shown).toContain("Bank transfer");
  });

  it("hides topics with nothing to say and explains an empty tab", () => {
    expect(text(renderToStaticMarkup(<DeliveryAndPaperwork row={row()} assessment={base} />))).toContain("No delivery or paperwork details");
    expect(text(renderToStaticMarkup(<DeliveryAndPaperwork row={row({ notes: ["A note"] })} assessment={{ ...base, settlement: ["Pays a SEPA account."] }} delivery="by Friday" />))).toContain("Pays a SEPA account.");
  });
});
