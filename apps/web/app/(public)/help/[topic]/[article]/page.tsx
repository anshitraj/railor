import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { ArticleSections } from "../../../../../components/marketing/guides/article-body";
import { HelpContact } from "../../../../../components/marketing/help/help-contact";
import styles from "../../../../../components/marketing/help/help.module.css";
import { getSession } from "../../../../../lib/auth";
import { articlesIn, helpArticle, helpHref, helpTopic } from "../../../../../lib/help/catalog";
import { helpContent } from "../../../../../lib/help/content";

type Props = { params: Promise<{ topic: string; article: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { topic, article } = await params;
  const meta = helpArticle(topic, article);
  return meta ? { title: `${meta.title} · Help centre`, description: meta.summary } : { title: "Help centre" };
}

export default async function HelpArticlePage({ params }: Props) {
  const { topic: topicSlug, article: slug } = await params;
  const topic = helpTopic(topicSlug);
  const meta = helpArticle(topicSlug, slug);
  const content = helpContent(topicSlug, slug);
  if (!topic || !meta || !content) notFound();
  const session = await getSession().catch(() => null);
  const signedIn = Boolean(session);
  const others = articlesIn(topic.slug).filter((article) => article.slug !== slug);

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <Link href="/help">Help centre</Link><span aria-hidden>/</span><Link href={`/help/${topic.slug}`}>{topic.title}</Link>
        </nav>
        <h1>{meta.title}</h1>
      </header>
      <article><ArticleSections content={{ ...content, faq: [] }} signedIn={signedIn} /></article>
      {others.length ? (
        <section className={styles.more} aria-labelledby="more-title">
          <h2 id="more-title">More in {topic.title}</h2>
          <nav className={styles.articles} aria-label="More articles">
            {others.map((article) => (
              <Link key={article.slug} href={helpHref(article)}>
                <span><strong>{article.title}</strong><small>{article.summary}</small></span>
                <ArrowRight size={18} aria-hidden />
              </Link>
            ))}
          </nav>
        </section>
      ) : null}
      <HelpContact signedIn={signedIn} />
    </div>
  );
}
