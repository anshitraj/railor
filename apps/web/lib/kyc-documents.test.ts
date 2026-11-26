import { describe, expect, it } from "vitest";
import { documentTypes, kycDocumentRows } from "./kyc-documents";

describe("which documents a sentence is about", () => {
  it("names Indian identity papers when the provider does", () => {
    expect(documentTypes("Your personal PAN and an INR bank account in your own name, with identity verification.")).toEqual(["pan", "id", "bank"]);
    expect(documentTypes("Aadhaar-based eKYC, plus your PAN.")).toEqual(["aadhaar", "pan"]);
  });

  it("lists every kind in a photo-ID sentence, in display order", () => {
    expect(documentTypes("Photo ID that has not expired: a passport (photo page), a national ID card (both sides) or a driving licence (both sides).")).toEqual(["passport", "driving", "id"]);
    expect(documentTypes("A government-issued photo ID showing your full name: a driver’s license, passport or visa.")).toEqual(["passport", "driving", "id"]);
  });

  it("tells proof of address from proof of funds, and a bank statement used for either", () => {
    expect(documentTypes("Proof of address: a utility bill, phone bill, or bank or credit card statement.")).toEqual(["address"]);
    expect(documentTypes("Proof of income or source of funds: a recent pay stub, a bank statement with salary deposits, or a tax return (W-2).")).toEqual(["funds"]);
  });

  it("recognises business papers and selfies, and falls back to a plain document", () => {
    expect(documentTypes("Proof of business registration: a certificate of incorporation or an official registry excerpt.")).toEqual(["business"]);
    expect(documentTypes("A selfie to confirm it is you, taken in the app.")).toEqual(["selfie"]);
    expect(documentTypes("An invoice for the first payment.")).toEqual(["funds"]);
    expect(documentTypes("Whatever the provider asks.")).toEqual(["other"]);
  });
});

describe("the checklist", () => {
  it("marks what is only sometimes asked, and keeps the provider's own words", () => {
    const rows = kycDocumentRows([
      "Photo ID that has not expired: a passport or a driving licence.",
      "Sometimes a selfie, or a picture of you holding your ID.",
      "Proof of address if Wise asks.",
      "For larger amounts, documents that show where the money came from.",
    ]);
    expect(rows.map((row) => row.need)).toEqual(["required", "sometimes", "sometimes", "sometimes"]);
    expect(rows[0]).toMatchObject({ types: ["passport", "driving", "id"], text: expect.stringContaining("Photo ID that has not expired") });
    expect(rows[3]!.types).toEqual(["funds"]);
  });

  it("builds rows from a note when the provider gave no list, one per sentence", () => {
    const rows = kycDocumentRows([], "Your personal PAN and an INR bank account in your own name. Wise may ask for an invoice.");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ types: ["pan", "bank"], need: "required" });
    expect(rows[1]).toMatchObject({ types: ["funds"], need: "sometimes" });
  });

  it("adds the note's rows after the list, and an empty provider gives no rows", () => {
    expect(kycDocumentRows(["A passport."], "Also a selfie.").map((row) => row.types)).toEqual([["passport"], ["selfie"]]);
    expect(kycDocumentRows([], null)).toEqual([]);
  });

  it("reads a prose list of business papers as the kinds it names", () => {
    const [row] = kycDocumentRows([], "Wise asks for the documents that match your legal form: registration or incorporation papers, business PAN, bank ownership and owner or director identity.");
    expect(row!.types).toEqual(["pan", "id", "business", "bank"]);
  });
});
