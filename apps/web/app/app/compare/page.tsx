import { loadProviderSummaries, loadReferenceData } from "@railor/core";
import { getSession } from "../../../lib/auth";
import { RouteComparisonBoard } from "../../../components/app/route-comparison-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compare providers" };

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, summaries, reference, session] = await Promise.all([searchParams, loadProviderSummaries(), loadReferenceData(), getSession()]);
  const providers = summaries.filter(provider => !provider.isDemo)
    .map(({ slug, name, category }) => ({ value: slug, label: name, category }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const countries = reference.countries.map(country => ({ value: country.code, label: country.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const requested = typeof params.providers === "string" ? params.providers.split(",") : [];
  const selected = [...new Set(requested)].filter(slug => providers.some(provider => provider.value === slug));
  const homeCountry = session?.organization?.entityCountry ?? "";

  return (
    <RouteComparisonBoard
      providers={providers}
      countries={countries}
      initialProviders={[selected[0] ?? "", selected[1] ?? ""]}
      initialCountry={countries.some(country => country.value === homeCountry) ? homeCountry : ""}
    />
  );
}
