import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { Flag, currencyFlagCode } from "@railor/ui";
import { getSession } from "../../../../lib/auth";
import { GUIDES, GUIDE_TOPICS, guideBySlug, guideHref } from "../../../../lib/guides/catalog";
import { GUIDE_CONTENT } from "../../../../lib/guides/content";
import { convertHref } from "../../../../lib/guides/destinations";
import { guideJsonLd, jsonLdScript } from "../../../../lib/guides/schema";
import { ArticleFaq, ArticleSections } from "../../../../components/marketing/guides/article-body";
import { GuideCard } from "../../../../components/marketing/guides/guide-card";
import { WaysToSendSection, WaysToSendSkeleton } from "../../../../components/marketing/guides/ways-section";
import { ComparisonSkeleton, RouteComparison } from "../../../../components/marketing/guides/route-comparison";
import { GuideSearch } from "../../../../components/marketing/guides/guide-search";
import { LiveRanking, RankingSkeleton, rankAmount } from "../../../../components/marketing/guides/live-ranking";
import styles from "../../../../components/marketing/guides/guides.module.css";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const guide = guideBySlug((await params).slug);
  if (!guide) return { title: "Guide not found" };
  return {
    title: guide.title,
    description: guide.summary,
    alternates: { canonical: guideHref(guide.slug) },
    openGraph: { title: guide.title, description: guide.summary, type: "article", modifiedTime: guide.updated },
  };
}

export default async function GuidePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  const content = GUIDE_CONTENT[slug];
  if (!guide || !content) notFound();

  const [session, query] = await Promise.all([getSession(), searchParams]);
  const signedIn = Boolean(session);
  const topic = GUIDE_TOPICS.find((item) => item.id === guide.topic);
  const amount = rankAmount(query.amount);
  const compare = convertHref({ code: guide.route.country, currency: guide.route.to }, { signedIn, from: guide.route.from });
  const related = [...GUIDES.filter((item) => item.slug !== slug && item.topic === guide.topic), ...GUIDES.filter((item) => item.slug !== slug && item.topic !== guide.topic)].slice(0, 3);
  const updated = new Date(`${guide.updated}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const fromFlag = currencyFlagCode(guide.route.from);

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(guideJsonLd(guide, content, process.env.NEXT_PUBLIC_APP_URL)) }} />
      <header className={styles.articleHead}>
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <Link href="/guides">Guides</Link>
          <span aria-hidden>/</span>
          <span>{topic?.label}</span>
        </nav>
        <h1>{guide.title}</h1>
        <p className={styles.articleMeta}>
          <span className={styles.byline}>By Railor</span>
          <span>{guide.live ? "Live ranking" : `${guide.minutes} min read`}</span>
          <span>Facts checked {updated}</span>
          <span className={styles.byline}><Link href="/docs/pricing">How Railor compares prices</Link></span>
        </p>
      </header>
      {guide.banner ? (
        <figure className={styles.articleBanner} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element -- a static vector illustration drawn for this guide */}
          <img src={guide.banner} alt="" width={1200} height={440} decoding="async" fetchPriority="high" />
        </figure>
      ) : null}

      <div className={styles.layout}>
        <div>
          <ArticleSections
            content={content}
            signedIn={signedIn}
            beforeSections={<>
              <GuideSearch route={guide.route} signedIn={signedIn} />
              {guide.live ? (
                <Suspense key={amount} fallback={<RankingSkeleton />}>
                  <LiveRanking amount={amount} signedIn={signedIn} />
                </Suspense>
              ) : null}
            </>}
          />
          {guide.live ? null : (
            <Suspense key={query.amount ?? "default"} fallback={<ComparisonSkeleton />}>
              <RouteComparison routes={guide.compare ?? [guide.route]} signedIn={signedIn} amountParam={query.amount} />
            </Suspense>
          )}
          <Suspense fallback={<WaysToSendSkeleton />}>
            <WaysToSendSection route={guide.route} signedIn={signedIn} />
          </Suspense>
          <ArticleFaq faq={content.faq} signedIn={signedIn} />
          <section className={styles.related} aria-labelledby="related-title">
            <h2 id="related-title">Keep reading</h2>
            <div className={styles.grid}>{related.map((item) => <GuideCard key={item.slug} guide={item} />)}</div>
          </section>
        </div>

        <aside className={styles.aside} aria-label="Compare this route">
          <div className={styles.cta}>
            <span className={styles.ctaFlags} aria-hidden>
              {fromFlag ? <Flag code={fromFlag} size={22} round /> : null}
              <ArrowRight size={16} />
              <Flag code={guide.route.country} size={22} round />
            </span>
            <strong>See what arrives for {guide.route.label}</strong>
            <p>Every provider that can serve you, ranked by what the recipient receives, with the source of each price.</p>
            <Link href={compare} className={`${styles.ctaButton} press`}>Compare {guide.route.label}<ArrowRight size={16} aria-hidden /></Link>
          </div>
          <nav className={styles.toc} aria-label="In this guide">
            <p>In this guide</p>
            {content.sections.map((section) => <a key={section.id} href={`#${section.id}`}>{section.heading}</a>)}
            {guide.live ? null : <a href="#compare-providers">Compare providers</a>}
            <a href="#ways-to-send">Ways to send {guide.route.label}</a>
          </nav>
        </aside>
      </div>
    </article>
  );
}
