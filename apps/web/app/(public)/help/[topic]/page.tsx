import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { HelpContact } from "../../../../components/marketing/help/help-contact";
import styles from "../../../../components/marketing/help/help.module.css";
import { getSession } from "../../../../lib/auth";
import { articlesIn, helpHref, helpTopic } from "../../../../lib/help/catalog";

type Props = { params: Promise<{ topic: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const topic = helpTopic((await params).topic);
  return topic ? { title: `${topic.title} · Help centre`, description: topic.blurb } : { title: "Help centre" };
}

export default async function HelpTopicPage({ params }: Props) {
  const topic = helpTopic((await params).topic);
  if (!topic) notFound();
  const session = await getSession().catch(() => null);

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <nav className={styles.crumbs} aria-label="Breadcrumb"><Link href="/help">Help centre</Link><span aria-hidden>/</span><span>{topic.title}</span></nav>
        <h1>{topic.title}</h1>
        <p>{topic.blurb}</p>
      </header>
      <nav className={styles.articles} aria-label={`Articles about ${topic.title.toLowerCase()}`}>
        {articlesIn(topic.slug).map((article) => (
          <Link key={article.slug} href={helpHref(article)}>
            <span><strong>{article.title}</strong><small>{article.summary}</small></span>
            <ArrowRight size={18} aria-hidden />
          </Link>
        ))}
      </nav>
      <HelpContact signedIn={Boolean(session)} />
    </div>
  );
}
