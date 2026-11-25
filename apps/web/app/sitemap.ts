import type { MetadataRoute } from "next";
import { GUIDES } from "../lib/guides/catalog";

/** The public pages a search engine should find, guides included: they answer what people search before they send money. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const pages = ["", "/prices", "/providers", "/coverage", "/pricing", "/guides", "/guides/countries", "/company", "/company/trust"];
  return [
    ...pages.map((path) => ({ url: `${base}${path}` })),
    ...GUIDES.map((guide) => ({ url: `${base}/guides/${guide.slug}`, lastModified: guide.updated })),
  ];
}
