import { loadPlatformCounts } from "@railor/core";
import { ensureMigrated } from "@railor/database";
import { MarketingNav } from "../components/marketing/nav";
import { MarketingFooter } from "../components/marketing/footer";
import { MarketingLanding } from "../components/marketing/landing";
import { FIELD_LABELS, getReferenceOptions, optionsByField } from "../lib/reference";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureMigrated();
  const [reference, counts] = await Promise.all([
    getReferenceOptions(),
    loadPlatformCounts(),
  ]);

  return (
    <>
      <MarketingNav />

      <MarketingLanding counts={counts} optionsByField={optionsByField(reference)} fieldLabels={FIELD_LABELS} />

      <MarketingFooter
        counts={{
          providers: counts.providers,
          countries: counts.countries,
          sources: counts.sources,
          capabilities: counts.capabilities,
        }}
      />
    </>
  );
}
