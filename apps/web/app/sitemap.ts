import type { MetadataRoute } from "next";
import { GUIDES } from "../lib/guides/catalog";
import { HELP_ARTICLES, HELP_TOPICS, helpHref } from "../lib/help/catalog";

/** The public pages a search engine should find, guides included: they answer what people search before they send money. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const pages = ["", "/prices", "/coverage", "/pricing", "/guides", "/guides/countries", "/company", "/company/trust", "/help", ...HELP_TOPICS.map((topic) => `/help/${topic.slug}`)];
  return [
    ...pages.map((path) => ({ url: `${base}${path}` })),
    ...HELP_ARTICLES.map((article) => ({ url: `${base}${helpHref(article)}` })),
    ...GUIDES.map((guide) => ({ url: `${base}/guides/${guide.slug}`, lastModified: guide.updated })),
  ];
}
