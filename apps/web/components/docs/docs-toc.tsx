"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@railor/ui";

interface Heading {
  id: string;
  label: string;
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Sticky "On this page" rail. Reads the article's h2s, so no page has to opt in. */
export function DocsToc({ articleId }: { articleId: string }) {
  const pathname = usePathname();
  const [items, setItems] = useState<Heading[]>([]);
  const [active, setActive] = useState("");

  // Collect headings (and give any that lack an id one) whenever the page changes.
  useEffect(() => {
    const article = document.getElementById(articleId);
    if (!article) return;

    const scan = () => {
      const seen = new Set<string>();
      const next = Array.from(article.querySelectorAll<HTMLElement>("h2")).map((heading) => {
        const label = heading.dataset.toc ?? heading.textContent?.trim() ?? "";
        const base = heading.id || slug(label) || "section";
        let id = base;
        for (let n = 2; seen.has(id); n++) id = `${base}-${n}`;
        seen.add(id);
        if (heading.id !== id) heading.id = id;
        return { id, label };
      });
      setItems((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };

    let frame = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(scan);
    });
    scan();
    observer.observe(article, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [articleId, pathname]);

  // Highlight the last heading that has scrolled past the sticky nav.
  useEffect(() => {
    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      let current = headings[0]!.id;
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= 128) current = heading.id;
      }
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) current = headings[headings.length - 1]!.id;
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [items]);

  if (items.length < 2) return null;

  return (
    <nav aria-label="On this page" className="sticky top-20 hidden self-start xl:block">
      <p className="mb-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)]">
        On this page
      </p>
      <ul className="flex flex-col border-l border-[var(--color-line)]">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={item.id === active ? "location" : undefined}
              onClick={(event) => {
                const target = document.getElementById(item.id);
                if (!target) return;
                event.preventDefault();
                const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                target.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
                history.replaceState(null, "", `#${item.id}`);
              }}
              className={cn(
                "-ml-px block border-l-2 py-1.5 pl-3.5 text-[13px] leading-snug transition-colors duration-150",
                item.id === active
                  ? "border-[var(--color-orange)] font-semibold text-[var(--color-ink)]"
                  : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-ink)]",
              )}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
