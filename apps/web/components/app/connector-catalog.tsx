"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Clock3, Plug, Search } from "lucide-react";
import { ProviderWordmark } from "./provider-wordmark";
import styles from "./connector-catalog.module.css";

type Provider = { slug: string; name: string; category: string; description: string };
const PAGE_SIZE = 24;

export function ConnectorCatalog({ providers }: { providers: Provider[] }) {
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const term = search.trim().toLowerCase();
  const results = providers.filter(({ name, slug, category }) => `${name} ${slug} ${category}`.toLowerCase().includes(term));

  return (
    <section className={styles.catalog} aria-labelledby="connector-title">
      <header className={styles.header}>
        <span className={styles.mark}><Plug size={24} aria-hidden /></span>
        <div><h1 id="connector-title">Connectors</h1><p>Browse payment providers for future Railor integrations.</p></div>
        <Link href="/app/settings/connections">Manage provider accounts <ArrowUpRight size={15} aria-hidden /></Link>
      </header>
      <div className={styles.card}>
        <div className={styles.toolbar}>
          <label className={styles.search}>
            <Search size={17} aria-hidden />
            <input type="search" value={search} aria-label="Search connectors" placeholder="Search providers" onChange={(event) => {
              setSearch(event.target.value);
              setVisible(PAGE_SIZE);
            }} />
          </label>
          <span role="status">{results.length} {results.length === 1 ? "provider" : "providers"}</span>
        </div>
        {results.length ? (
          <ul role="list" className={styles.rows}>
            {results.slice(0, visible).map((provider) => (
              <li key={provider.slug}>
                <div className={styles.provider}><strong><ProviderWordmark slug={provider.slug} name={provider.name} size="large" /></strong><p>{provider.description || provider.category}</p></div>
                <button type="button" disabled className={styles.soon} aria-label={`${provider.name} · Coming soon`}><Clock3 size={14} aria-hidden /> Coming soon</button>
              </li>
            ))}
          </ul>
        ) : <p className={styles.empty}>No providers match your search.</p>}
        {results.length > visible ? <div className={styles.more}><button type="button" onClick={() => setVisible((count) => count + PAGE_SIZE)}>Show more providers</button></div> : null}
      </div>
    </section>
  );
}
