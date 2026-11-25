import type { GuideMeta } from "./catalog";
import type { GuideContent } from "./content";

/** JSON-LD for a guide: the article and its questions, so search engines can read both. */
export function guideJsonLd(guide: GuideMeta, content: GuideContent, origin = ""): unknown[] {
  const url = origin ? `${origin.replace(/\/$/, "")}/guides/${guide.slug}` : undefined;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: guide.title,
      description: guide.summary,
      dateModified: guide.updated,
      author: { "@type": "Organization", name: "Railor" },
      publisher: { "@type": "Organization", name: "Railor" },
      ...(url ? { mainEntityOfPage: url, url } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: content.faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*/g, "") },
      })),
    },
  ];
}

/** Safe to place inside a <script> tag: a "<" can never close it. */
export const jsonLdScript = (data: unknown): string => JSON.stringify(data).replace(/</g, "\\u003c");
