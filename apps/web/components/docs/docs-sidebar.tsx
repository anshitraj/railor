"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, ChevronsUpDown, Search, X } from "lucide-react";
import { TechnologyLogo, TechnologyLogoStack, useModalFocus } from "@railor/ui";
import { DOCS_NAV, DOCS_PAGES, type DocsGroup, type DocsLink } from "./docs-nav";
import styles from "./docs-sidebar.module.css";

const SPRING = { type: "spring", duration: 0.32, bounce: 0 } as const;

function matches(link: DocsLink, query: string) {
  const q = query.trim().toLowerCase();
  return !q || `${link.label} ${link.hint} ${link.keywords ?? ""}`.toLowerCase().includes(q);
}

function Mark({ link }: { link: DocsLink }) {
  if (link.href === "/docs/mcp") return <TechnologyLogo name="MCP" size={17} />;
  if (link.href === "/docs/sdks") return <TechnologyLogoStack names={["TypeScript", "Python"]} size={15} />;
  return <link.icon size={15} strokeWidth={2} aria-hidden />;
}

/**
 * The docs rail. Desktop: a sticky list with search ("/" focuses it), a pill
 * that glides to the current page, and a line that fills as you read. Phones:
 * a floating "Docs" pill opens the same list as a bottom sheet.
 */
export function DocsSidebar({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const rail = useRef<HTMLElement>(null);
  const current = DOCS_PAGES.find((page) => page.href === pathname) ?? DOCS_PAGES[0]!;

  // Reading progress, written straight to a CSS variable so scrolling never re-renders the rail.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const value = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 1;
      document.documentElement.style.setProperty("--docs-read", value.toFixed(3));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(frame); };
  }, [pathname]);

  // "/" jumps to search, like most docs sites.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== "/" || event.metaKey || event.ctrlKey || target?.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      if (window.matchMedia("(min-width: 1024px)").matches) input.current?.focus();
      else setSheet(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { setSheet(false); setQuery(""); }, [pathname]);

  return (
    <>
      <nav ref={rail} aria-label="Documentation" className={styles.rail}>
        <label className={styles.search}>
          <Search size={15} aria-hidden />
          <input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setQuery(""); event.currentTarget.blur(); } }} placeholder="Search docs" aria-label="Search the docs" />
          {query ? <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); input.current?.focus(); }}><X size={13} /></button> : <kbd aria-hidden>/</kbd>}
        </label>
        <NavList groups={DOCS_NAV} pathname={pathname} query={query} layoutId="docs-rail-active" reduce={Boolean(reduce)} />
        {children ? <div className={styles.extra}>{children}</div> : null}
      </nav>

      <button type="button" className={`${styles.fab} press`} aria-haspopup="dialog" aria-expanded={sheet} onClick={() => setSheet(true)}>
        <span className={styles.fabIcon}><Mark link={current} /></span>
        <span className={styles.fabText}><small>Docs</small>{current.label}</span>
        <ChevronsUpDown size={15} aria-hidden />
        <i className={styles.fabProgress} aria-hidden />
      </button>

      <AnimatePresence>{sheet ? <Sheet onClose={() => setSheet(false)} pathname={pathname} reduce={Boolean(reduce)} /> : null}</AnimatePresence>
    </>
  );
}

function Sheet({ onClose, pathname, reduce }: { onClose: () => void; pathname: string; reduce: boolean }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const panel = useModalFocus<HTMLDivElement>(true, onClose);
  useEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    if (!window.matchMedia("(pointer: coarse)").matches) inputRef.current?.focus();
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);
  return (
    <div className={styles.sheetLayer}>
      <motion.button type="button" aria-label="Close docs menu" className={styles.backdrop} onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />
      <motion.div ref={panel} role="dialog" aria-modal="true" aria-label="Documentation" className={styles.sheet}
        initial={reduce ? { opacity: 0 } : { y: "100%" }} animate={reduce ? { opacity: 1 } : { y: 0 }} exit={reduce ? { opacity: 0 } : { y: "100%" }}
        transition={reduce ? { duration: 0.15 } : { duration: 0.42, ease: [0.32, 0.72, 0, 1] }}>
        <span className={styles.grabber} aria-hidden />
        <div className={styles.sheetHead}>
          <label className={styles.search}>
            <Search size={15} aria-hidden />
            <input ref={inputRef} enterKeyHint="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search docs" aria-label="Search the docs" />
          </label>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className={styles.sheetBody}><NavList groups={DOCS_NAV} pathname={pathname} query={query} layoutId="docs-sheet-active" reduce={reduce} onNavigate={onClose} /></div>
      </motion.div>
    </div>
  );
}

function NavList({ groups, pathname, query, layoutId, reduce, onNavigate }: { groups: DocsGroup[]; pathname: string; query: string; layoutId: string; reduce: boolean; onNavigate?: () => void }) {
  const filtered = useMemo(() => groups.map((group) => ({ ...group, links: group.links.filter((link) => matches(link, query)) })).filter((group) => group.links.length), [groups, query]);
  if (!filtered.length) return <p className={styles.empty}>Nothing matches “{query.trim()}”. Try “API key”, “fees” or “MCP”.</p>;
  return (
    <div className={styles.groups}>
      {filtered.map((group) => (
        <div key={group.label} className={styles.group}>
          <p className={styles.groupLabel}>{group.label}</p>
          <ul>
            {group.links.map((link) => {
              const active = pathname === link.href;
              const external = !link.href.startsWith("/docs");
              return (
                <li key={link.href}>
                  <Link href={link.href} aria-current={active ? "page" : undefined} className={styles.item} onClick={onNavigate}>
                    {active ? <motion.span layoutId={layoutId} className={styles.activePill} transition={reduce ? { duration: 0 } : SPRING} aria-hidden><i className={styles.read} /></motion.span> : null}
                    <span className={styles.icon}><Mark link={link} /></span>
                    <span className={styles.text}><strong>{link.label}{external ? <ArrowUpRight size={12} aria-hidden /> : null}</strong><small>{link.hint}</small></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
