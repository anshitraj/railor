import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Flag } from "@railor/ui";
import { GUIDE_TOPICS, guideHref, type GuideMeta } from "../../../lib/guides/catalog";
import styles from "./guides.module.css";

/** The little picture on a guide's card: coins for the currencies, flags for the countries. */
export function GuideArt({ guide }: { guide: GuideMeta }) {
  const [first, second] = guide.art.symbols;
  const [from, to] = guide.art.flags;
  return (
    <div className={styles.art} data-topic={guide.topic} aria-hidden>
      <span className="coin" data-metal="gold" style={{ "--size": "86px", left: "13%", top: "20%", rotate: "-10deg" } as React.CSSProperties}>{first}</span>
      {second ? <span className="coin" data-metal="silver" style={{ "--size": "64px", left: "44%", top: "46%", rotate: "9deg" } as React.CSSProperties}>{second}</span> : null}
      {from ? <span className={`sticker-flag ${styles.artFlag}`} style={{ left: "66%", top: "14%", "--tilt": "7deg" } as React.CSSProperties}><Flag code={from} size={30} round /></span> : null}
      {to ? <span className={`sticker-flag ${styles.artFlag}`} style={{ left: "78%", top: "52%", "--tilt": "-8deg", "--delay": ".08s" } as React.CSSProperties}><Flag code={to} size={30} round /></span> : null}
    </div>
  );
}

export function GuideCard({ guide }: { guide: GuideMeta }) {
  const topic = GUIDE_TOPICS.find((item) => item.id === guide.topic);
  return (
    <Link href={guideHref(guide.slug)} className={styles.card}>
      <GuideArt guide={guide} />
      <span className={styles.cardBody}>
        {topic ? <span className={styles.topic}>{topic.label}</span> : null}
        <span className={styles.cardTitle}>{guide.title}</span>
        <span className={styles.cardSummary}>{guide.summary}</span>
        <span className={styles.cardMeta}>{guide.live ? "Live ranking" : `${guide.minutes} min read`}<ArrowRight size={16} aria-hidden /></span>
      </span>
    </Link>
  );
}
