/**
 * Generates the targeted research queries for one country — deliberately
 * many small, specific searches rather than one broad one, so each result
 * maps cleanly back to the profile field(s) it can inform. Pure, no I/O.
 */
import type { CountryProfileFactKey } from "@railor/types";

export interface ResearchQuery {
  text: string;
  category:
    | "central_bank"
    | "banking"
    | "payment_rails"
    | "cross_border"
    | "stablecoin"
    | "crypto"
    | "aml"
    | "kyc"
    | "kyb"
    | "payout";
  /** Which country_profiles / CountryProfileExtraction fields this query is meant to inform. */
  factKeys: CountryProfileFactKey[];
}

export function buildResearchQueries(countryCode: string, countryName: string): ResearchQuery[] {
  const c = countryName;
  return [
    {
      text: `${c} central bank financial regulator payment regulations`,
      category: "central_bank",
      factKeys: ["centralBankName", "regulatorNames"],
    },
    {
      text: `${c} instant payment system local bank transfer rails`,
      category: "payment_rails",
      factKeys: ["instantPaymentAvailable", "instantPaymentSystem", "localPaymentRails"],
    },
    {
      text: `${c} bank transfer recipient requirements account routing code`,
      category: "banking",
      factKeys: ["bankAccountRequirements", "routingCodeType", "routingCodeDescription"],
    },
    {
      text: `${c} IBAN SWIFT BIC bank transfers international`,
      category: "banking",
      factKeys: ["ibanSupported", "ibanNote", "swiftSupported", "swiftNote"],
    },
    {
      text: `${c} cross border payment regulations foreign exchange restrictions`,
      category: "cross_border",
      factKeys: ["crossBorderRestrictions", "supportedPayoutCurrencies"],
    },
    {
      text: `${c} payment service provider licensing requirements`,
      category: "payout",
      factKeys: ["pspLicensingSummary"],
    },
    {
      text: `${c} cryptocurrency regulation legal status`,
      category: "crypto",
      factKeys: ["cryptoStatus"],
    },
    {
      text: `${c} stablecoin regulation legal status`,
      category: "stablecoin",
      factKeys: ["stablecoinStatus"],
    },
    {
      text: `${c} KYC KYB AML payment compliance requirements businesses`,
      category: "kyc",
      factKeys: ["kycRequirements", "kybRequirements", "amlRequirements"],
    },
  ];
}
