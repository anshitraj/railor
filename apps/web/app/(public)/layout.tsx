import { loadPlatformCounts } from "@railor/core";
import { ensureMigrated } from "@railor/database";
import { MarketingNav } from "../../components/marketing/nav";
import { MarketingFooter } from "../../components/marketing/footer";
import { getSession } from "../../lib/auth";
import { loadGuideDestinations } from "../../lib/guides/load";

export const dynamic = "force-dynamic";

/** Shell for every public page that isn't the homepage. */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  await ensureMigrated();
  const [counts, session, destinations] = await Promise.all([loadPlatformCounts(), getSession(), loadGuideDestinations()]);

  return (
    <>
      <MarketingNav signedIn={Boolean(session)} guideCountries={destinations.popular} />
      <main id="main" className="mx-auto w-[min(1280px,calc(100%-2rem))] py-4 sm:py-7 lg:py-10">
        {children}
      </main>
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
