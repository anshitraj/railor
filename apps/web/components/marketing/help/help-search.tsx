"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, Search } from "lucide-react";
import { HELP_ARTICLES, helpHref, helpTopic, searchHelp } from "../../../lib/help/catalog";
import styles from "./help.module.css";

/**
 * "Search for articles". Opening the box with nothing typed lists the articles
 * people open most, so it works with a tap and no typing. Arrow keys move
 * through the results and Enter opens one.
 */
export function HelpSearch() {
  const router = useRouter();
  const id = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const typed = query.trim().length > 0;
  const results = useMemo(() => (typed ? searchHelp(query) : HELP_ARTICLES.filter((article) => article.popular).slice(0, 6)), [query, typed]);
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;

  const go = (index: number) => {
    const article = results[index];
    if (!article) return;
    setOpen(false);
    router.push(helpHref(article));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((index) => Math.min(results.length - 1, index + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(0, index - 1)); }
    else if (event.key === "Enter" && open && results.length) { event.preventDefault(); go(active); }
    else if (event.key === "Escape") setOpen(false);
  };

  return (
    <div ref={wrapper} className={styles.search} onBlur={(event) => { if (!wrapper.current?.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
      <label className={styles.searchField}>
        <Search size={22} aria-hidden />
        <span className="sr-only">Search for articles</span>
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results.length ? optionId(active) : undefined}
          autoComplete="off"
          placeholder="Search for articles"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </label>

      <div className={styles.panel} data-open={open || undefined} inert={!open}>
        <p className={styles.panelLabel}>{typed ? (results.length ? "Articles" : "No articles found") : "Popular articles"}</p>
        {results.length ? (
          <ul id={listId} role="listbox" aria-label="Help articles">
            {results.map((article, index) => (
              <li key={`${article.topic}/${article.slug}`} id={optionId(index)} role="option" aria-selected={index === active} data-active={index === active || undefined} onMouseEnter={() => setActive(index)}>
                <Link href={helpHref(article)} tabIndex={-1} onClick={() => setOpen(false)}>
                  <span><strong>{article.title}</strong><small>{helpTopic(article.topic)?.title}</small></span>
                  <ArrowRight size={16} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.none}>Try fewer or different words, or <Link href="/help#contact" onClick={() => setOpen(false)}>contact us</Link>.</p>
        )}
      </div>
    </div>
  );
}
