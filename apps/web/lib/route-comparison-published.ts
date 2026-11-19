import { NEEDS_CONFIRMATION, type ComparisonCandidate, type ComparisonFact, type ComparisonSource, type RouteComparisonRequest } from "./route-comparison-model";

function source(title: string, url: string): ComparisonSource {
  return { title, url, verifiedAt: "2026-11-19T00:00:00.000Z" };
}

const airwallex = {
  account: source("Airwallex business account eligibility", "https://help.airwallex.com/hc/en-gb/articles/900001757026-Eligibility-to-open-an-account"),
  countries: source("Airwallex eligible business countries", "https://help.airwallex.com/hc/en-gb/articles/4408591334937-Eligible-Countries-and-Territories"),
  documents: source("Airwallex company documents for India", "https://help.airwallex.com/hc/en-gb/articles/12004460708111-Documents-required-for-companies-in-South-East-Asia"),
  argentina: source("Airwallex Argentina payout guide", "https://www.airwallex.com/docs/payouts/payout-network/bank-accounts/argentina"),
  pricing: source("Airwallex Singapore business pricing", "https://www.airwallex.com/en-sg/pricing"),
};

const oneMoney = {
  eligibility: source("1Money individual country eligibility", "https://developer.1money.com/docs/individual"),
  onboarding: source("1Money individual onboarding", "https://developer.1money.com/docs/individual-onboarding"),
  rails: source("1Money fiat rails and limits", "https://developer.1money.com/docs/fiat-rails-and-limits"),
  timing: source("1Money withdrawal processing times", "https://developer.1money.com/docs/sla"),
  pricing: source("1Money deposit and withdrawal fees", "https://www.1money.com/pricing"),
};

export function addPublishedComparisonFacts(candidate: ComparisonCandidate, request: RouteComparisonRequest): ComparisonCandidate {
  if (request.product && request.product !== "payout" && request.product !== "off_ramp") return candidate;
  const facts = new Map(candidate.facts.map(fact => [fact.label, fact]));
  const sources = new Map(candidate.sources.map(item => [item.url, item]));
  function put(label: string, value: string, detail: string, evidence: ComparisonSource) {
    const fact: ComparisonFact = { label, value, detail, source: evidence };
    facts.set(label, fact);
    sources.set(evidence.url, evidence);
  }
  const { from, to, customerType, product } = request;
  const personal = customerType === "individual";
  if (candidate.slug === "airwallex" && product !== "off_ramp") {
    if (personal) {
      candidate.verdict = "unavailable";
      candidate.reason = "Airwallex’s direct payout product requires a business account. A business can pay an individual recipient.";
      candidate.advantages = [];
      candidate.considerations = ["These published payout terms apply to eligible business senders."];
    }
    const accountScope = personal ? "Business account reference" : "Business account";
    put("Product reviewed", "Airwallex Business Account payouts", accountScope, airwallex.account);
    put("Onboarding time", "1–3 business days after a complete application", accountScope, airwallex.account);
    if (from === "IN") {
      put("Sender eligibility", personal ? "Indian businesses may apply through Airwallex Singapore" : "India-registered businesses may apply through Airwallex Singapore", accountScope, airwallex.countries);
      put("KYC / KYB requirements", "Indian companies and LLPs need incorporation proof, a second business document, and signed ownership or partnership details. Other entity types have their own checklist.", accountScope, airwallex.documents);
      put("Published fees", "Singapore business pricing lists 0.4% FX markup on major currencies and 0.6% on others. The final FX and transfer charge depends on the account and payment method.", "Singapore plan reference", airwallex.pricing);
    }
    if (to === "AR") {
      const scope = "Argentina payout network · eligible business accounts";
      put("Payout timing", "0–1 business day for local ARS, 0–3 for SWIFT", scope, airwallex.argentina);
      put("Receiving method", "Local ARS bank deposit via Interbanking Coelsa, or SWIFT to a bank", scope, airwallex.argentina);
      put("Published limits", "No per-transaction maximum listed for the Argentina payout rails", scope, airwallex.argentina);
      put("Other requirements", "Local ARS requires the account holder’s name, a 22-digit CBU and 11-digit CUIT or CUIL.", scope, airwallex.argentina);
      put("Tax on transfer", "1.20% Argentine credits and debits tax, collected with the local ARS transfer fees", scope, airwallex.argentina);
    }
  } else if (candidate.slug === "1money" && personal) {
    const accountScope = "Published individual account requirements";
    put("KYC / KYB requirements", "Government photo ID, selfie, and personal details. Non-US residents also need proof of address and a national identity or tax number.", accountScope, oneMoney.onboarding);
    put("Published limits", "$50,000 per day and $100,000 per rolling 30 days after standard onboarding. Higher withdrawals require enhanced checks.", "Individual account withdrawal limits", oneMoney.onboarding);
    if (from === "IN") {
      if (candidate.verdict === "unknown" || candidate.verdict === "supported") {
        candidate.verdict = "additional_requirements";
        candidate.reason = "Indian residents need approval under a specific 1Money program. The complete funding and payout route still needs confirmation.";
        candidate.advantages = [];
        candidate.considerations = ["Check program approval and the funding method before comparing transfer prices."];
      }
      put("Sender eligibility", "India residents are restricted at onboarding unless approved under a specific program.", accountScope, oneMoney.eligibility);
    }
    if (from === "IN" && to === "AR") {
      const scope = "Published USD withdrawal reference";
      put("Product reviewed", "1Money USD withdrawals and stablecoin conversion", "Personal account", oneMoney.rails);
      put("Receiving method", "1Money lists international USD SWIFT. The fiat rails guide lists no local ARS payout.", scope, oneMoney.rails);
      put("Payout timing", "1–5 business days for international USD wires", scope, oneMoney.timing);
      put("Published fees", "$10 USD SWIFT deposit and $25 withdrawal. Intermediary fees and any stablecoin conversion charges can add to the cost.", scope, oneMoney.pricing);
    }
  } else {
    return candidate;
  }
  if (facts.get("Other requirements")?.value === NEEDS_CONFIRMATION && candidate.verdict === "unavailable") facts.delete("Other requirements");
  return { ...candidate, facts: [...facts.values()], sources: [...sources.values()] };
}
