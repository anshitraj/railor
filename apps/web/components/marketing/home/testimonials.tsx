import { Quote } from "lucide-react";
import home from "./home.module.css";
import styles from "./voices.module.css";

/**
 * Customer quotes. Only publish words a real customer said and agreed to share:
 * add them here with `sample: false` (or drop the field). Entries marked
 * `sample: true` are layout placeholders — they render in local development
 * with a visible "Sample" label and never in production, so a fake quote
 * can't reach the live site. With no real quotes, the section stays hidden.
 */
export interface Testimonial { quote: string; name: string; role: string; initials: string; tone: "gold" | "sky" | "green" | "orange"; sample?: boolean }

export const TESTIMONIALS: Testimonial[] = [
  { quote: "I used to open four apps every time a client paid me. Now I check one screen and I know which service leaves me the most.", name: "Sample freelancer", role: "Designer, India", initials: "SF", tone: "gold", sample: true },
  { quote: "The source and time on each price is what sold us. Our finance team can see exactly why a route was picked.", name: "Sample finance lead", role: "Importer, UAE", initials: "SL", tone: "sky", sample: true },
  { quote: "Company rules mean large supplier payments wait for a second approval without anyone having to remember.", name: "Sample operations manager", role: "Marketplace, Singapore", initials: "SO", tone: "green", sample: true },
];

export function TestimonialsSection({ items = TESTIMONIALS }: { items?: Testimonial[] }) {
  const visible = items.filter((item) => !item.sample || process.env.NODE_ENV !== "production");
  if (!visible.length) return null;
  return (
    <section className={home.section} aria-labelledby="voices-title">
      <div className={home.container}>
        <div className={home.head}>
          <div>
            <p className={home.eyebrow}>What customers say</p>
            <h2 id="voices-title" className={home.title}>Less guessing. More arriving.</h2>
          </div>
          <p className={home.lead}>People sending to family, freelancers getting paid and finance teams paying suppliers use Railor to decide with the facts in front of them.</p>
        </div>
        <ul className={styles.grid}>
          {visible.map((item, index) => (
            <li key={item.name + index} className={styles.card} data-home-reveal>
              {item.sample ? <span className={styles.sample} title="Replace with a real customer quote before launch">Sample · dev only</span> : null}
              <Quote size={26} aria-hidden className={styles.mark} />
              <blockquote className={styles.quote}>{item.quote}</blockquote>
              <div className={styles.person}>
                <span className={styles.avatar} data-tone={item.tone} aria-hidden>{item.initials}</span>
                <span><strong>{item.name}</strong><small>{item.role}</small></span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
