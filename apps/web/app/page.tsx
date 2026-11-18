import { Suspense } from "react";
import { remittanceProviderCatalog } from "@railor/core";
import { ensureMigrated } from "@railor/database";
import { MarketingNav } from "../components/marketing/nav";
import { MarketingFooter } from "../components/marketing/footer";
import { HomeHero } from "../components/marketing/home/hero";
import { HeroCalculator } from "../components/marketing/home/hero-calculator";
import { HowItWorks } from "../components/marketing/home/how-it-works";
import { ProvidersSection } from "../components/marketing/home/providers";
import { RouteMapSection } from "../components/marketing/home/route-map";
import { AudiencesSection, DevelopersSection, FaqSection, FinalCta, TrustSection } from "../components/marketing/home/sections";
import { WhyRailor } from "../components/marketing/home/why-railor";
import { HomeScrollMotion } from "../components/marketing/home/scroll-motion";
import homeStyles from "../components/marketing/home/home.module.css";
import { CompanyRulesSection } from "../components/marketing/home/company-rules";
import { TestimonialsSection } from "../components/marketing/home/testimonials";
import { QuickQuote, QuickQuoteSkeleton } from "../components/price/quick-quote";
import { loadPricePage } from "../lib/pricing";
import { getSession } from "../lib/auth";
import { lockPriceCheck } from "../lib/price-lock";
import { appOrigin } from "../lib/security";

export const dynamic = "force-dynamic";

const PROFILES = new Set(["personal", "freelancer", "business"]);

/** The calculator streams in on its own, so the page never waits on a provider's quote. */
async function HeroQuote({ params }: { params: Record<string, string | undefined> }) {
  const profile = PROFILES.has(params.profile ?? "") ? (params.profile as "personal" | "freelancer" | "business") : "personal";
  const [page, session] = await Promise.all([
    loadPricePage({ from: params.from, to: params.to, amount: params.amount ?? "1000" }, null, null, profile),
    getSession(),
  ]);
  // Prices are for signed-in accounts: a visitor sees who was checked, never the numbers.
  const locked = !session;
  return (
    <QuickQuote
      variant="hero"
      compareBase="/prices"
      locked={locked}
      currencies={page.currencies}
      initial={{ from: page.initial.from, to: page.initial.to, amount: page.initial.amount, context: page.initial.context }}
      initialResult={page.result && locked ? lockPriceCheck(page.result) : page.result}
      initialError={page.error}
    />
  );
}

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await ensureMigrated();
  const [params, session] = await Promise.all([searchParams, getSession()]);

  return (
    <>
      <MarketingNav signedIn={Boolean(session)} />
      <main id="main" className={homeStyles.motionPage}>
        <HomeScrollMotion />
        <HomeHero calculator={<HeroCalculator signedIn={Boolean(session)} bank={<Suspense fallback={<QuickQuoteSkeleton />}><HeroQuote params={params} /></Suspense>} />} />
        <HowItWorks signedIn={Boolean(session)} />
        <WhyRailor signedIn={Boolean(session)} />
        <ProvidersSection trackedCount={remittanceProviderCatalog().length} />
        <RouteMapSection />
        <CompanyRulesSection />
        <AudiencesSection />
        <TestimonialsSection />
        <DevelopersSection baseUrl={appOrigin()} />
        <TrustSection />
        <FaqSection />
        <FinalCta />
      </main>
      <MarketingFooter />
    </>
  );
}
