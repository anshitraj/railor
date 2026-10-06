/** Reviewed provider-owned pages, not independently verified corridor support. */
export const FEATURE_REVIEWED_ON = "2026-10-07";
export const COMPARISON_PROVIDERS = [
  { slug: "payzoll", name: "PayZoll", description: "Fiat + stablecoin workflows", url: "https://payzoll.finance/payzoll-vs-skydo" },
  { slug: "skydo", name: "Skydo", description: "India export collections", url: "https://www.skydo.com/" },
  { slug: "airwallex", name: "Airwallex", description: "Business FX + payments", url: "https://www.airwallex.com/docs/transactional-fx/overview" },
] as const;
export type ComparisonSlug = typeof COMPARISON_PROVIDERS[number]["slug"];
export interface FeatureCell { value: string; detail?: string; status: "published" | "unknown" | "integration"; url?: string }
export interface FeatureRow { key: string; label: string; group: "Pricing" | "Coverage" | "Operations"; cells: Record<ComparisonSlug, FeatureCell> }
const published = (value: string, slug: ComparisonSlug, detail?: string): FeatureCell => ({ value, detail, status: "published", url: COMPARISON_PROVIDERS.find(p => p.slug === slug)!.url });
const unknown = (detail: string): FeatureCell => ({ value: "Not confirmed", detail, status: "unknown" });

export const PROVIDER_FEATURES: FeatureRow[] = [
  { key: "fee", label: "Platform / transfer fee", group: "Pricing", cells: {
    payzoll: published("$10 below $1,000 · 1% from $1,000", "payzoll", "USD thresholds; partner charges may apply."),
    skydo: published("$19 / $29 / 0.3%", "skydo", "≤ $2k / ≤ $10k / above $10k. +18% GST on fee."),
    airwallex: { ...published("Region & account-specific", "airwallex", "FX and payout charges must be checked separately."), url: "https://www.airwallex.com/pricing" },
  } },
  { key: "fx", label: "FX markup", group: "Pricing", cells: {
    payzoll: published("0% advertised", "payzoll", "Does not rule out banking or corridor charges."),
    skydo: published("0% advertised", "skydo", "Published India collections pricing."),
    airwallex: { ...published("Account-specific rate", "airwallex", "Use the account quote, not a universal percentage."), url: "https://www.airwallex.com/docs/api/2024-08-07/transactional_fx/quotes" },
  } },
  { key: "settlement", label: "Settlement time", group: "Coverage", cells: {
    payzoll: published("Fast local settlement", "payzoll", "No corridor-specific guarantee on this page."),
    skydo: published("Under 24 hours advertised", "skydo", "Subject to the payment and banking workflow."),
    airwallex: unknown("Depends on destination, payment method and cutoff."),
  } },
  { key: "accounts", label: "Virtual / global accounts", group: "Coverage", cells: {
    payzoll: published("JPMorgan Chase infrastructure advertised", "payzoll", "Provider claim; onboarding and eligibility apply."),
    skydo: published("Local collection accounts", "skydo", "US, UK, Canada, Australia and other markets."),
    airwallex: { ...published("Global Accounts", "airwallex", "Availability depends on business eligibility."), url: "https://www.airwallex.com/docs/accounts/overview" },
  } },
  { key: "inr", label: "INR bank settlement", group: "Coverage", cells: {
    payzoll: published("Direct Indian bank payout", "payzoll"), skydo: published("Indian bank settlement", "skydo"),
    airwallex: unknown("Check the exact entity, route and payout method."),
  } },
  { key: "stablecoins", label: "Stablecoin workflows", group: "Coverage", cells: {
    payzoll: { ...published("USDC / USDT advertised", "payzoll", "Network and route support still need verification."), url: "https://payzoll.finance/" },
    skydo: unknown("Not established by the reviewed provider source."), airwallex: unknown("Not established by the reviewed FX documentation."),
  } },
  { key: "currency", label: "Currency coverage", group: "Coverage", cells: {
    payzoll: published("40+ currencies advertised", "payzoll", "Homepage advertises 50+; exact list needs confirmation."),
    skydo: unknown("Country coverage is not a currency count."), airwallex: published("60+ trade currencies advertised", "airwallex", "FX product coverage; not a guarantee of eligible payout routes."),
  } },
  { key: "fira", label: "FIRA / FIRC documentation", group: "Operations", cells: {
    payzoll: published("For eligible international receipts", "payzoll"), skydo: published("Free FIRA advertised", "skydo"),
    airwallex: unknown("Confirm India receipt documentation for this route."),
  } },
  { key: "api", label: "Railor pricing integration", group: "Operations", cells: {
    payzoll: { value: "Published schedule", detail: "No connected quote adapter in Railor yet.", status: "integration" },
    skydo: { value: "Published schedule", detail: "No connected quote adapter in Railor yet.", status: "integration" },
    airwallex: { value: "Backend FX quote adapter", detail: "Environment is labelled on each observation. Payout fee excluded.", status: "integration" },
  } },
];

export function featureRows(differencesOnly: boolean) {
  return PROVIDER_FEATURES.filter(row => !differencesOnly || new Set(Object.values(row.cells).map(cell => cell.value)).size > 1);
}
