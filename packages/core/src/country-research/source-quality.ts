/**
 * Source-quality classification. Defaults to `unknown` whenever a domain
 * isn't recognized — never guessed upward. The ranking this produces is what
 * lets a conflict between an official regulator and a random blog resolve
 * itself instead of needing a human to notice.
 */
import type { CountrySourceAuthority } from "@railor/types";
import { COUNTRY_SOURCE_AUTHORITY_RANK } from "@railor/types";

/**
 * Curated allowlists, not a heuristic — a wrong guess here would let an
 * unrelated domain outrank a real regulator, which is exactly the failure
 * mode this whole classification exists to prevent. Scoped to the five v1
 * countries; extend when a new country is added.
 */
const OFFICIAL_REGULATOR_DOMAINS: Record<string, string[]> = {
  US: ["federalreserve.gov", "fincen.gov", "occ.gov", "fdic.gov", "sec.gov", "cftc.gov", "consumerfinance.gov"],
  IN: ["rbi.org.in", "sebi.gov.in", "fiuindia.gov.in"],
  GB: ["bankofengland.co.uk", "fca.org.uk", "psr.org.uk"],
  SG: ["mas.gov.sg"],
  AE: ["centralbank.ae", "sca.gov.ae"],
};

const OFFICIAL_NETWORK_DOMAINS = [
  "swift.com",
  "npci.org.in",
  "fasterpayments.org.uk",
  "pay.uk",
  "eurosystem.europa.eu",
];

const INTERNATIONAL_ORG_DOMAINS = ["imf.org", "bis.org", "fatf-gafi.org", "worldbank.org", "financialactiontaskforce.org"];

const REPUTABLE_SECONDARY_DOMAINS = ["reuters.com", "bloomberg.com", "ft.com", "wsj.com", "thebanker.com"];

function stripWww(domain: string): string {
  return domain.replace(/^www\./i, "").toLowerCase();
}

/** Best-effort domain extraction — callers that already have a parsed domain should pass it directly instead. */
export function domainFromUrl(url: string): string {
  try {
    return stripWww(new URL(url).hostname);
  } catch {
    return "";
  }
}

function isGovernmentDomain(domain: string): boolean {
  return /\.gov(\.[a-z]{2,3})?$/i.test(domain) || domain.endsWith(".gov.in") || domain.endsWith(".gov.uk") || domain.endsWith(".gov.sg") || domain.endsWith(".gov.ae");
}

export function classifySourceAuthority(url: string, countryCode?: string): CountrySourceAuthority {
  const domain = domainFromUrl(url); // already www-stripped
  if (!domain) return "unknown";

  const regulatorDomains = countryCode ? (OFFICIAL_REGULATOR_DOMAINS[countryCode.toUpperCase()] ?? []) : Object.values(OFFICIAL_REGULATOR_DOMAINS).flat();
  if (regulatorDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) return "official_regulator";

  if (isGovernmentDomain(domain)) return "government";

  if (OFFICIAL_NETWORK_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return "official_network";

  if (INTERNATIONAL_ORG_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return "international_organization";

  if (REPUTABLE_SECONDARY_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return "reputable_secondary";

  return "unknown";
}

/** Highest-authority first — official regulator beats government beats network beats provider beats secondary beats unknown. */
export function rankByAuthority<T>(items: T[], authorityOf: (item: T) => CountrySourceAuthority): T[] {
  return [...items].sort((a, b) => COUNTRY_SOURCE_AUTHORITY_RANK[authorityOf(b)] - COUNTRY_SOURCE_AUTHORITY_RANK[authorityOf(a)]);
}
