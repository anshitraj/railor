"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  ChevronDown,
  Code2,
  History,
  Info,
  KeyRound,
  LayoutDashboard,
  Map as MapIcon,
  Menu,
  Package,
  Search,
  ShieldCheck,
  Terminal,
  X,
  type LucideIcon,
} from "lucide-react";
import { RailorMark } from "../brand";
import styles from "./nav.module.css";
export { RailorMark } from "../brand";

interface MenuLink { label: string; href: string; hint: string; icon: LucideIcon }
type NavLink = { label: string; href: string } | { label: string; menu: MenuLink[] };

const LINKS: NavLink[] = [
  { label: "Compare prices", href: "/prices" },
  { label: "Providers", href: "/providers" },
  { label: "Coverage", href: "/coverage" },
  {
    label: "Developers",
    menu: [
      { label: "Documentation", href: "/docs", hint: "Quick start and guides", icon: BookOpen },
      { label: "API reference", href: "/docs/api", hint: "REST endpoints and examples", icon: Code2 },
      { label: "SDKs", href: "/docs/sdks", hint: "TypeScript and Python", icon: Package },
      { label: "MCP for AI tools", href: "/docs/mcp", hint: "Claude, Cursor, Codex and more", icon: Terminal },
      { label: "Changelog", href: "/docs/changelog", hint: "What shipped recently", icon: History },
    ],
  },
  {
    label: "Company",
    menu: [
      { label: "About", href: "/company", hint: "Why Railor exists", icon: Info },
      { label: "Trust", href: "/company/trust", hint: "Where every price comes from", icon: ShieldCheck },
      { label: "Roadmap", href: "/company/roadmap", hint: "What we are building next", icon: MapIcon },
      { label: "Status", href: "/status", hint: "Live service status", icon: Activity },
    ],
  },
];

/** Where a search from the public site goes: sign in first, then the question opens in the workspace. */
export function searchSignInHref(query: string) {
  const q = query.trim();
  return q ? `/login?intent=start&q=${encodeURIComponent(q)}` : "/login?intent=start";
}

/** The featured card in the Developers menu. */
function DevelopersFeature({ signedIn, onPick }: { signedIn: boolean; onPick: () => void }) {
  return (
    <Link href={signedIn ? "/app/developers" : "/login?intent=start&next=%2Fapp%2Fdevelopers"} className={styles.feature} onClick={onPick}>
      <span className={styles.featureIcon}><KeyRound size={16} aria-hidden /></span>
      <strong>Free API key</strong>
      <small>Compare prices from your own code, or let an AI agent do it.</small>
      <code>POST /v1/prices</code>
      <span className={styles.featureCta}>{signedIn ? "Open developer tools" : "Get a key"} <ArrowRight size={13} aria-hidden /></span>
    </Link>
  );
}

export function MarketingNav({ signedIn = false }: { signedIn?: boolean }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const header = useRef<HTMLElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setMobileOpen(false); setOpen(null); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!header.current?.contains(event.target as Node)) setOpen(null); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // The mobile sheet owns the screen while it is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [mobileOpen]);

  const openMenu = (label: string) => { window.clearTimeout(closeTimer.current); setOpen(label); };
  const closeSoon = () => { window.clearTimeout(closeTimer.current); closeTimer.current = window.setTimeout(() => setOpen(null), 120); };

  return (
    <header
      ref={header}
      className={styles.header}
      data-scrolled={scrolled || mobileOpen || undefined}
      onKeyDown={(event) => { if (event.key === "Escape") { setOpen(null); setMobileOpen(false); } }}
    >
      <nav className={styles.bar} aria-label="Main">
        <Link href="/" className={styles.brand} aria-label="Railor home">
          <RailorMark size={28} />
          <span>Railor</span>
        </Link>

        <ul className={styles.links} onMouseLeave={() => setHover(null)}>
          {LINKS.map((link) => "href" in link ? (
            <li key={link.label} onMouseEnter={() => setHover(link.label)}>
              <Link href={link.href} className={styles.link} aria-current={pathname === link.href || pathname.startsWith(`${link.href}/`) ? "page" : undefined}>
                {hover === link.label ? <motion.span layoutId="nav-hover" className={styles.hoverPill} transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.3, bounce: 0 }} /> : null}
                <span className={styles.linkText}>{link.label}</span>
              </Link>
            </li>
          ) : (
            <li key={link.label} className={styles.menuItem} onMouseEnter={() => { setHover(link.label); openMenu(link.label); }} onMouseLeave={closeSoon}>
              <button
                type="button"
                className={styles.link}
                aria-expanded={open === link.label}
                onClick={() => setOpen((current) => (current === link.label ? null : link.label))}
              >
                {hover === link.label || open === link.label ? <motion.span layoutId="nav-hover" className={styles.hoverPill} transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.3, bounce: 0 }} /> : null}
                <span className={styles.linkText}>{link.label}</span>
                <ChevronDown size={14} aria-hidden className={styles.chevron} data-open={open === link.label || undefined} />
              </button>
              <div className={styles.menu} data-open={open === link.label || undefined} data-wide={link.label === "Developers" || undefined} inert={open !== link.label}>
                <ul>
                  {link.menu.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className={styles.menuLink} onClick={() => setOpen(null)}>
                        <span className={styles.menuIcon}><item.icon size={17} aria-hidden /></span>
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.hint}</small>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {link.label === "Developers" ? <DevelopersFeature signedIn={signedIn} onPick={() => setOpen(null)} /> : null}
              </div>
            </li>
          ))}
        </ul>

        <div className={styles.actions}>
          <button type="button" className={styles.iconButton} aria-label="Search Railor" onClick={() => setSearchOpen(true)}>
            <Search size={18} aria-hidden />
          </button>
          {signedIn ? (
            <Link href="/app" className={`${styles.cta} press`} aria-label="Open workspace"><LayoutDashboard size={15} aria-hidden /><span className={styles.ctaLong}>Open workspace</span><span className={styles.ctaShort}>Workspace</span></Link>
          ) : (
            <>
              <Link href="/login" className={styles.signIn}>Sign in</Link>
              <Link href="/login?intent=start" className={`${styles.cta} press`}>
                Get started
              </Link>
            </>
          )}
          <button
            type="button"
            className={styles.menuButton}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((value) => !value)}
          >
            {mobileOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
        </div>
      </nav>

      <div id="mobile-menu" className={styles.sheet} data-open={mobileOpen || undefined} inert={!mobileOpen}>
        <div className={styles.sheetInner}>
          <ul className={styles.sheetLinks}>
            {LINKS.filter((link): link is { label: string; href: string } => "href" in link).map((link) => (
              <li key={link.href}><Link href={link.href} onClick={() => setMobileOpen(false)}>{link.label}<ArrowRight size={18} aria-hidden /></Link></li>
            ))}
          </ul>
          {LINKS.filter((link): link is { label: string; menu: MenuLink[] } => "menu" in link).map((group) => (
            <div key={group.label} className={styles.sheetGroup}>
              <p>{group.label}</p>
              <ul>
                {group.menu.map((item) => (
                  <li key={item.href}><Link href={item.href} onClick={() => setMobileOpen(false)}><item.icon size={16} aria-hidden />{item.label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
          <div className={styles.sheetActions}>
            {signedIn ? (
              <Link href="/app" className={`${styles.cta} press`} onClick={() => setMobileOpen(false)}>Open workspace</Link>
            ) : (
              <>
                <Link href="/login?intent=start" className={`${styles.cta} press`} onClick={() => setMobileOpen(false)}>Get started</Link>
                <Link href="/login" className={styles.sheetSecondary} onClick={() => setMobileOpen(false)}>Sign in</Link>
              </>
            )}
          </div>
        </div>
      </div>

      <NavSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}

const SEARCH_EXAMPLES = ["USD to INR for a freelancer", "Stablecoin payouts to Nigeria", "Business account in the UAE"];

/** Search is a signed-in feature: a public search sends the question to sign-in and opens it in the workspace. */
function NavSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [hint, setHint] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    setHint(false);
    const frame = window.requestAnimationFrame(() => input.current?.focus());
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { window.cancelAnimationFrame(frame); document.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  if (!open) return null;
  const go = (query: string) => {
    if (!query.trim()) { setHint(true); input.current?.focus(); return; }
    onClose();
    router.push(searchSignInHref(query));
  };

  return (
    <div className={styles.searchLayer}>
      <button type="button" className={styles.searchBackdrop} aria-label="Close search" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.searchPanel}>
        <p id={titleId} className="sr-only">Search Railor</p>
        <form onSubmit={(event) => { event.preventDefault(); go(value); }} className={styles.searchForm}>
          <Search size={18} aria-hidden />
          <input
            ref={input}
            value={value}
            onChange={(event) => { setValue(event.target.value); setHint(false); }}
            placeholder="Search providers, countries or routes"
            aria-label="Search providers, countries or routes"
            aria-describedby={`${titleId}-note`}
          />
          <button type="submit" className={`${styles.searchGo} press`}>Search</button>
        </form>
        <div className={styles.searchBody}>
          {hint ? <p role="status" className={styles.searchHint}>Type what you are looking for, or pick an example.</p> : null}
          <p className={styles.searchLabel}>Try</p>
          <div className={styles.searchExamples}>
            {SEARCH_EXAMPLES.map((example) => (
              <button key={example} type="button" className="press" onClick={() => go(example)}>{example}</button>
            ))}
          </div>
          <p id={`${titleId}-note`} className={styles.searchNote}>Search results open in your free Railor workspace after you sign in.</p>
        </div>
      </div>
    </div>
  );
}
