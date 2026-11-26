"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { ProviderWordmark } from "../app/provider-wordmark";
import { FEATURED_PROVIDERS, type Audience } from "../../lib/featured-providers";
import { providerSite } from "../../lib/provider-sites";
import { goHref } from "../../lib/provider-go";
import styles from "./featured-providers.module.css";

const FILTERS: Array<"All" | Audience> = ["All", "Personal", "Freelancers", "Business"];
const PROFILE: Record<Audience, string> = {
  Personal: "profile=personal&country=IN&direction=receive&purpose=personal",
  Freelancers: "profile=freelancer&country=IN&direction=receive&purpose=services",
  Business: "profile=business&country=IN&direction=receive&purpose=services",
};

/** Well-known providers with who they serve, a price check for that audience, and their own site. */
export function FeaturedProviders() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const shown = FEATURED_PROVIDERS.filter((provider) => filter === "All" || provider.for.includes(filter));
  return (
    <div>
      <div className={styles.filters} role="group" aria-label="Show providers for">
        {FILTERS.map((option) => (
          <button key={option} type="button" aria-pressed={filter === option} className="press" onClick={() => setFilter(option)}>
            {option === "All" ? "Everyone" : option}
            <span>{option === "All" ? FEATURED_PROVIDERS.length : FEATURED_PROVIDERS.filter((provider) => provider.for.includes(option)).length}</span>
          </button>
        ))}
      </div>
      <ul className={styles.grid}>
        {shown.map((provider) => {
          const audience = filter === "All" ? provider.for[0]! : filter;
          const site = providerSite(provider.slug) ? goHref(provider.slug) : null;
          return (
            <li key={provider.slug} className={styles.card}>
              <div className={styles.top}>
                <div>
                  <h3><ProviderWordmark slug={provider.slug} name={provider.name} size="large" /></h3>
                  <div className={styles.tags}>{provider.for.map((item) => <span key={item} data-kind={item}>{item}</span>)}</div>
                </div>
              </div>
              <p>{provider.summary}</p>
              <div className={styles.actions}>
                <Link href={`/prices?from=USD&to=INR&amount=1000&market=1&${PROFILE[audience]}`} className={`${styles.primary} press`}>Compare prices<ArrowRight size={15} aria-hidden /></Link>
                {site ? <a href={site} target="_blank" rel="noreferrer noopener" className={styles.secondary}>Website<ArrowUpRight size={14} aria-hidden /></a> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
