import { loadPlatformCounts } from "@railor/core";
import { ensureMigrated } from "@railor/database";
import { MarketingNav } from "../../components/marketing/nav";
import { MarketingFooter } from "../../components/marketing/footer";

export const dynamic = "force-dynamic";

/** Shell for every public page that isn't the homepage. */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  await ensureMigrated();
  const counts = await loadPlatformCounts();

  return (
    <>
      <MarketingNav />
      <main id="main" className="mx-auto w-[min(1180px,calc(100%-2rem))] py-12">
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
