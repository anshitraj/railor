import { Suspense } from "react";
import { remittanceCostBenchmarks, remittanceProviderCatalog } from "@railor/core";
import { ensureMigrated } from "@railor/database";
import { MarketingNav } from "../components/marketing/nav";
import { MarketingFooter } from "../components/marketing/footer";
import { HomeHero } from "../components/marketing/home/hero";
import { TransfersSection } from "../components/marketing/home/transfers-section";
import { ProviderMarquee } from "../components/marketing/home/provider-marquee";
import { HowItWorks } from "../components/marketing/home/how-it-works";
import { ProvidersSection } from "../components/marketing/home/providers";
import { RouteMapSection } from "../components/marketing/home/route-map";
import { AudiencesSection, DevelopersSection, FaqSection, FinalCta, TrustSection } from "../components/marketing/home/sections";
import { WhyRailor } from "../components/marketing/home/why-railor";
import { OnePlaceSection } from "../components/marketing/home/one-place";
import { MathsSection } from "../components/marketing/home/maths-section";
import { CollageSection } from "../components/marketing/home/collage";
import { HomeScrollMotion } from "../components/marketing/home/scroll-motion";
import { SmoothScroll } from "../components/marketing/motion/smooth-scroll";
import { MobileCompareBar } from "../components/marketing/home/mobile-compare-bar";
import homeStyles from "../components/marketing/home/home.module.css";
import { CompanyRulesSection } from "../components/marketing/home/company-rules";
import { TestimonialsSection } from "../components/marketing/home/testimonials";
import { siteStats } from "../lib/site-stats";
import { GuidesSection } from "../components/marketing/guides/home-guides";
import { loadGuideDestinations } from "../lib/guides/load";
import { QuickQuote, QuickQuoteSkeleton } from "../components/price/quick-quote";
import { loadPricePage } from "../lib/pricing";
import { getSession } from "../lib/auth";

export const dynamic = "force-dynamic";

const PROFILES = new Set(["personal", "freelancer", "business"]);

/** The calculator streams in on its own, so the page never waits on a provider's quote. */
async function HeroQuote({ params }: { params: Record<string, string | undefined> }) {
  const profile = PROFILES.has(params.profile ?? "") ? (params.profile as "personal" | "freelancer" | "business") : "personal";
  const page = await loadPricePage({ from: params.from, to: params.to, amount: params.amount ?? "1000" }, null, null, profile);
  return (
    <QuickQuote
      variant="hero"
      compareBase="/prices"
      currencies={page.currencies}
      initial={{ from: page.initial.from, to: page.initial.to, amount: page.initial.amount, context: page.initial.context }}
      initialResult={page.result}
      initialError={page.error}
    />
  );
}

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await ensureMigrated();
  const [params, session, destinations, stats] = await Promise.all([searchParams, getSession(), loadGuideDestinations(), siteStats()]);
  const trackedProviders = remittanceProviderCatalog().length;

  return (
    <>
      <MarketingNav overHero signedIn={Boolean(session)} guideCountries={destinations.popular} />
      <main id="main" className={homeStyles.motionPage} data-curtain>
        <SmoothScroll />
        <HomeScrollMotion />
        <HomeHero
          stats={stats}
          providerCount={trackedProviders}
          calculator={
            <Suspense fallback={<QuickQuoteSkeleton />}>
              <HeroQuote params={params} />
            </Suspense>
          }
        />
        <div className={homeStyles.container} style={{ paddingTop: 12 }}>
          <ProviderMarquee />
        </div>
        <TransfersSection
          providerCount={trackedProviders}
          currencyCount={stats.currencies}
        />
        <CollageSection />
        <OnePlaceSection />
        <HowItWorks />
        <WhyRailor signedIn={Boolean(session)} />
        <MathsSection benchmarks={remittanceCostBenchmarks()} />
        <ProvidersSection trackedCount={trackedProviders} />
        <RouteMapSection />
        <CompanyRulesSection />
        <AudiencesSection />
        <TestimonialsSection />
        <DevelopersSection />
        <TrustSection />
        <FaqSection />
        <GuidesSection />
        <FinalCta />
        <MobileCompareBar providerCount={trackedProviders} />
      </main>
      <MarketingFooter />
    </>
  );
}
