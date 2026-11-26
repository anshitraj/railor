import { describe, expect, it } from "vitest";
import { assessCustomerProfile, CustomerContext, unconfirmedAssessment } from "../customer-profiles.js";
import { KYC_REVIEWED_AT, PROVIDER_KYC, kycFor, withKycFacts } from "../public-pricing/provider-kyc.js";

/** A provider's KYC page must be on the provider's own domain, never a third party's summary. */
const OWN_DOMAINS: Record<string, string[]> = {
  wise: ["wise.com"], remitly: ["remitly.com"], xoom: ["xoom.com"], paypal: ["paypal.com"], revolut: ["revolut.com"],
  "western-union": ["westernunion.com"], moneygram: ["moneygram.com"], "world-remit": ["worldremit.com"], "taptap-send": ["taptapsend.com"],
  sendwave: ["sendwave.com"], lemfi: ["lemfi.com"], aspora: ["aspora.com"], xe: ["xe.com"], ria: ["riamoneytransfer.com"],
  paysend: ["paysend.com"], instarem: ["instarem.com"], ofx: ["ofx.com"], airwallex: ["airwallex.com"], payoneer: ["payoneer.com"],
  circle: ["circle.com"], skydo: ["skydo.com"], infinity: ["infinityapp.in"], mulya: ["mulya.co"], payglocal: ["payglocal.in"],
  winvesta: ["winvesta.in"], xflow: ["xflowpay.com"], payzoll: ["payzoll.finance"], dashx: ["dashx.xyz"], briskpe: ["briskpe.com"],
  karbon: ["karboncard.com"], cashfree: ["cashfree.com"], pingpong: ["pingpongx.com"], razorpay: ["razorpay.com"], refrens: ["refrens.com"],
};
const onOwnDomain = (slug: string, url: string) => {
  const { protocol, hostname } = new URL(url);
  return protocol === "https:" && OWN_DOMAINS[slug]!.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
};

const person = { profile: "personal", country: "US", direction: "send", purpose: "personal" } as const;
const request = { sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000, amountUsd: 1000, referenceRate: 90 };

describe("published KYC facts", () => {
  it("names a first-party page for every document list and every approval time", () => {
    for (const [slug, entries] of Object.entries(PROVIDER_KYC)) {
      expect(OWN_DOMAINS[slug], `${slug} needs its own domain listed in this test`).toBeDefined();
      for (const entry of entries) {
        expect(onOwnDomain(slug, entry.documentsUrl), `${slug} documents: ${entry.documentsUrl}`).toBe(true);
        if (entry.approvalTime) {
          expect(onOwnDomain(slug, entry.approvalTime.url), `${slug} time: ${entry.approvalTime.url}`).toBe(true);
          expect(entry.approvalTime.label.length).toBeGreaterThan(2);
          expect(entry.approvalTime.detail.length).toBeGreaterThan(20);
        }
      }
    }
  });

  it("never leaves an entry with neither a document list nor a note saying why", () => {
    for (const [slug, entries] of Object.entries(PROVIDER_KYC)) {
      for (const entry of entries) expect(entry.documents.length > 0 || Boolean(entry.documentsNote), `${slug}: ${entry.scope}`).toBe(true);
    }
  });

  it("covers the providers a comparison commonly shows", () => {
    for (const slug of ["wise", "remitly", "xoom", "revolut", "western-union", "moneygram", "world-remit", "taptap-send", "skydo", "payzoll", "xflow", "airwallex", "payoneer"]) {
      expect(PROVIDER_KYC[slug], slug).toBeDefined();
    }
  });
});

describe("kycFor", () => {
  it("gives a sender's own check when you send", () => {
    const kyc = kycFor("wise", person)!;
    expect(kyc).toMatchObject({ appliesTo: "you", match: "general", reviewedAt: KYC_REVIEWED_AT });
    expect(kyc.documents.join(" ")).toContain("passport");
    expect(kyc.approvalTime?.label).toBe("10 minutes to 2 working days");
  });

  it("says the sender verifies, not you, when a personal recipient reads a transfer service's rules", () => {
    expect(kycFor("remitly", { ...person, country: "IN", direction: "receive" })).toMatchObject({ appliesTo: "sender" });
  });

  it("prefers the page written for the reader's country", () => {
    expect(kycFor("taptap-send", person)).toMatchObject({ match: "country" });
    expect(kycFor("taptap-send", person)!.documents.join(" ")).toContain("US passport card");
    expect(kycFor("taptap-send", { ...person, country: "AE" })!.documents.join(" ")).toContain("Emirates ID");
    expect(kycFor("taptap-send", { ...person, country: "DE" })!.scope).toContain("Europe");
    // A country the provider wrote nothing for still gets a page, flagged as another country's.
    expect(kycFor("taptap-send", { ...person, country: "JP" })).toMatchObject({ match: "other_country" });
  });

  it("matches business receiving accounts in India to the account holder", () => {
    const business = { profile: "business", country: "IN", direction: "receive", purpose: "services" } as const;
    expect(kycFor("skydo", business)).toMatchObject({ appliesTo: "you", match: "country" });
    expect(kycFor("skydo", { ...business, profile: "freelancer" })).toMatchObject({ appliesTo: "you" });
    expect(kycFor("wise", business)).toMatchObject({ appliesTo: "you", match: "country" });
    expect(kycFor("wise", { ...business, profile: "freelancer" })!.documentsNote).toContain("personal PAN");
  });

  it("reports a provider that publishes no turnaround as null, never a guess", () => {
    expect(kycFor("western-union", person)).toMatchObject({ approvalTime: null });
    expect(kycFor("razorpay", { profile: "business", country: "IN", direction: "receive" })).toMatchObject({ approvalTime: null });
  });

  it("returns nothing for providers Railor has no published facts for, and for the wrong profile", () => {
    expect(kycFor("market:not-a-provider", person)).toBeNull();
    expect(kycFor("airwallex", person)).toBeNull();
  });

  it("accepts market-feed slugs and the WorldRemit spelling", () => {
    expect(kycFor("market:remitly", person)).not.toBeNull();
    expect(kycFor("worldremit", person)).toEqual(kycFor("world-remit", person));
  });
});

describe("withKycFacts", () => {
  const context = CustomerContext.parse(person);

  it("replaces the generic placeholder with the provider's documents and adds its source", () => {
    const out = withKycFacts(unconfirmedAssessment(), "remitly", context);
    expect(out.verification.join(" ")).toContain("driver’s license");
    expect(out.verification.join(" ")).not.toContain("Confirm legal form");
    expect(out.kyc?.approvalTime?.label).toBe("Often within minutes");
    expect(out.sources.map((source) => source.url)).toContain("https://remitly.com/us/en/money-transfer/large-amounts");
  });

  it("keeps a provider-specific document list that is already there", () => {
    const specific = { ...unconfirmedAssessment(), verification: ["Company: business PAN and two director PAN cards."] };
    const out = withKycFacts(specific, "infinity", CustomerContext.parse({ profile: "business", country: "IN", direction: "receive", purpose: "services" }));
    expect(out.verification).toEqual(["Company: business PAN and two director PAN cards."]);
    expect(out.kyc?.approvalTime?.label).toBe("Within 1 working day");
  });

  it("leaves an unsupported route alone", () => {
    const unsupported = { ...unconfirmedAssessment(), status: "not_supported" as const };
    expect(withKycFacts(unsupported, "wise", context)).toBe(unsupported);
  });

  it("is applied to every assessment", () => {
    const wise = assessCustomerProfile("wise", context, request);
    expect(wise.kyc).toMatchObject({ appliesTo: "you" });
    expect(assessCustomerProfile("market:not-a-provider", context, request).kyc).toBeUndefined();
  });
});
