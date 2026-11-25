import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HelpContact } from "../../../components/marketing/help/help-contact";
import { HELP_ICONS } from "../../../components/marketing/help/help-icons";
import { HelpSearch } from "../../../components/marketing/help/help-search";
import styles from "../../../components/marketing/help/help.module.css";
import { getSession } from "../../../lib/auth";
import { HELP_ARTICLES, HELP_TOPICS, helpHref } from "../../../lib/help/catalog";

export const metadata = {
  title: "Help centre",
  description: "Answers about comparing prices, invoices, payroll, rate alerts, plans and the API.",
};

export default async function HelpPage() {
  const session = await getSession().catch(() => null);
  const signedIn = Boolean(session);
  const popular = HELP_ARTICLES.filter((article) => article.popular);

  return (
    <div className={styles.hub}>
      <section className={styles.hero} aria-labelledby="help-title">
        <h1 id="help-title">Hi, how can we help?</h1>
        <HelpSearch />
      </section>

      <section className={styles.signin} aria-labelledby="signin-title">
        <h2 id="signin-title">{signedIn ? "You’re signed in" : "Log in for personalised support"}</h2>
        <Link href={signedIn ? "/app" : "/login?next=%2Fhelp"} className={`${styles.signinButton} press`}>{signedIn ? "Open your workspace" : "Log in"}</Link>
        <Link href="/help#contact">{signedIn ? "Need a person?" : "Trouble logging in?"}</Link>
      </section>

      <section className={styles.topics} aria-labelledby="topics-title">
        <h2 id="topics-title">Explore all topics</h2>
        <div className={styles.topicGrid}>
          {HELP_TOPICS.map((topic, index) => {
            const Icon = HELP_ICONS[topic.icon];
            return (
              <Link key={topic.slug} href={`/help/${topic.slug}`} className={styles.topic} style={{ "--i": index } as React.CSSProperties}>
                <span className={styles.topicIcon}><Icon size={26} aria-hidden /></span>
                <strong>{topic.title}</strong>
                <span>{topic.blurb}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className={styles.popular} aria-labelledby="popular-title">
        <h2 id="popular-title">Popular articles</h2>
        <div className={styles.popularList}>
          {popular.map((article) => (
            <Link key={`${article.topic}/${article.slug}`} href={helpHref(article)}>{article.title}<ArrowRight size={18} aria-hidden /></Link>
          ))}
        </div>
      </section>

      <HelpContact signedIn={signedIn} />
    </div>
  );
}
