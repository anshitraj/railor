import Link from "next/link";
import { ArrowRight, Bell, Bookmark, FileText, Layers, LineChart, Link2, Percent, Scale, SearchCheck, ShieldCheck, Tag, UserCheck, type LucideIcon } from "lucide-react";
import { AlertVisual, CompareVisual, CostVisual, EligibilityVisual, MatchVisual } from "./why-visuals";
import home from "./home.module.css";
import styles from "./why-rows.module.css";

interface Row {
  id: string;
  title: string;
  lead: string;
  points: Array<{ icon: LucideIcon; title: string; body: string }>;
  cta: { label: string; href: string };
  visual: React.ReactNode;
}

/**
 * Why Railor, as alternating rows: words on one side, a moving picture of the
 * product on the other, then the reverse. Each picture plays once as it scrolls
 * into view and settles into a readable still.
 */
export function WhyRailor({ signedIn = false }: { signedIn?: boolean }) {
  const rows: Row[] = [
    {
      id: "compare",
      title: "Every provider, one list.",
      lead: "Apps, banks and payment platforms side by side, ranked by what actually arrives.",
      points: [
        { icon: Layers, title: "One search, every provider", body: "Compare transfer apps, banks and payment platforms in one place." },
        { icon: Link2, title: "A source on every price", body: "Tap any price to see where it came from and when it was collected." },
      ],
      cta: { label: "Compare prices", href: "/prices" },
      visual: <CompareVisual />,
    },
    {
      id: "cost",
      title: "See the real cost, not just the fee.",
      lead: "A low fee can hide a weak exchange rate. Railor measures every option against the fair mid-market rate.",
      points: [
        { icon: Percent, title: "Fee and rate in one number", body: "See what each option really costs you." },
        { icon: Tag, title: "Offers are labelled", body: "A better rate for new customers is marked, so you know what applies to you." },
      ],
      cta: { label: "How the cost is worked out", href: "/guides/real-cost-of-sending-money" },
      visual: <CostVisual />,
    },
    {
      id: "profile",
      title: "Only the prices you can use.",
      lead: "Services that can’t serve your profile are hidden, and Railor tells you why.",
      points: [
        { icon: UserCheck, title: "Made for your profile", body: "Personal, freelancer and business accounts see different options." },
        { icon: ShieldCheck, title: "Reasons, not silence", body: "Every hidden option comes with the rule that hid it." },
      ],
      cta: { label: "Where prices come from", href: "/company/trust" },
      visual: <EligibilityVisual />,
    },
    {
      id: "alerts",
      title: "Know when it’s worth sending.",
      lead: "Save a route and Railor emails you when the rate reaches the one you are waiting for.",
      points: [
        { icon: Bell, title: "Rate alerts by email", body: "Set your target once and carry on with your day." },
        { icon: Bookmark, title: "Saved routes", body: "Reopen a route you check often in one tap." },
        { icon: LineChart, title: "Rate history", body: "See where the rate has been before you decide." },
      ],
      cta: { label: "Set a rate alert", href: signedIn ? "/app/saved" : "/login?intent=start" },
      visual: <AlertVisual />,
    },
    {
      id: "paid",
      title: "Get paid, then check the money arrived.",
      lead: "Upload an invoice, compare ways to get paid and match the credit when it lands.",
      points: [
        { icon: FileText, title: "Invoice in, details out", body: "Railor reads it and you review every field before anything is saved." },
        { icon: Scale, title: "Expected against arrived", body: "Exchange-rate moves and named deductions are shown separately." },
        { icon: SearchCheck, title: "Missing money investigated", body: "Railor looks for where an unexplained difference went." },
      ],
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

        <div className={styles.rows}>
          {rows.map((row, index) => (
            <article key={row.id} className={styles.feature} data-flip={index % 2 === 1 || undefined} aria-labelledby={`why-${row.id}`}>
              <div className={styles.copy}>
                <h3 id={`why-${row.id}`}>{row.title}</h3>
                <p>{row.lead}</p>
                <ul className={styles.points}>
                  {row.points.map(({ icon: Icon, title, body }) => (
                    <li key={title}>
                      <span className={styles.icon}><Icon size={17} aria-hidden /></span>
                      <span><strong>{title}</strong>{body}</span>
                    </li>
                  ))}
                </ul>
                <Link href={row.cta.href} className={`${styles.cta} press`}>{row.cta.label}<ArrowRight size={16} aria-hidden /></Link>
              </div>
              <div className={styles.picture}>{row.visual}</div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
