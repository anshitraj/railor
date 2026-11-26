import { AlertVisual, CompareVisual, CostVisual, EligibilityVisual, MatchVisual } from "./why-visuals";
import { WhyStory, type StoryChapter } from "./why-story";
import home from "./home.module.css";

/**
 * Why Railor, told as five short chapters. Each one is a word, a sentence and a
 * moving picture of the product doing it; WhyStory pins them on wide screens and
 * stacks them as cards on phones.
 */
export function WhyRailor({ signedIn = false }: { signedIn?: boolean }) {
  const chapters: StoryChapter[] = [
    {
      id: "compare",
      label: "Compare",
      title: "Every provider, one list.",
      lead: "Apps, banks and payment platforms side by side, ranked by what actually arrives.",
      cta: { label: "Compare prices", href: "/prices" },
      visual: <CompareVisual />,
    },
    {
      id: "cost",
      label: "See the cost",
      title: "See the real cost, not just the fee.",
      lead: "A low fee can hide a weak exchange rate. Railor measures every option against the fair mid-market rate.",
      cta: { label: "How the cost is worked out", href: "/guides/real-cost-of-sending-money" },
      visual: <CostVisual />,
    },
    {
      id: "profile",
      label: "Fit your profile",
      title: "Only the prices you can use.",
      lead: "Services that can’t serve your profile are hidden, and Railor tells you why.",
      cta: { label: "Where prices come from", href: "/company/trust" },
      visual: <EligibilityVisual />,
    },
    {
      id: "alerts",
      label: "Watch the rate",
      title: "Know when it’s worth sending.",
      lead: "Save a route and get daily, weekly or smart updates by email, with the 30-day chart and the best price that day.",
      cta: { label: "Set a rate alert", href: signedIn ? "/app/saved" : "/login?intent=start" },
      visual: <AlertVisual />,
    },
    {
      id: "paid",
      label: "Get paid",
      title: "Get paid, then check the money arrived.",
      lead: "Upload an invoice, compare ways to get paid and match the credit when it lands.",
      cta: { label: "Try invoice matching", href: signedIn ? "/app/freelancer" : "/login?intent=start&next=%2Fapp%2Ffreelancer" },
      visual: <MatchVisual />,
    },
  ];

  return (
    <section className={home.section} aria-labelledby="why-title">
      <div className={home.container}>
        <div className={home.head}>
          <div>
            <p className={home.eyebrow}>Why Railor</p>
            <h2 id="why-title" className={home.title}>Stop checking ten websites.</h2>
          </div>
          <p className={home.lead}>Fees hide in exchange rates, offers expire and rules change. Railor keeps track so you don’t have to.</p>
        </div>

        <WhyStory chapters={chapters} />
      </div>
    </section>
  );
}
