import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { RailorMark } from "../brand";
import styles from "./footer.module.css";

const GROUPS: Array<{ title: string; links: Array<[string, string]> }> = [
  { title: "Product", links: [["Compare prices", "/prices"], ["Providers", "/providers"], ["Market coverage", "/coverage"], ["Guides", "/guides"], ["Change feed", "/changes"], ["Pricing", "/pricing"]] },
  { title: "Developers", links: [["Documentation", "/docs"], ["API reference", "/docs/api"], ["SDKs", "/docs/sdks"], ["MCP for AI tools", "/docs/mcp"], ["Changelog", "/docs/changelog"]] },
  { title: "Company", links: [["About", "/company"], ["Trust", "/company/trust"], ["Help centre", "/help"], ["Roadmap", "/company/roadmap"], ["Status", "/status"]] },
  { title: "Legal", links: [["Terms", "/legal/terms"], ["Privacy", "/legal/privacy"]] },
];

/** One footer for every public page: where to go next, and the plain-language caveat on prices. */
export function MarketingFooter(_props: { counts?: unknown } = {}) {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.about}>
            <Link href="/" className={styles.brand} aria-label="Railor home">
              <RailorMark size={30} />
              <span>Railor</span>
            </Link>
            <p>Compare every way to move money across borders, with the source behind every number.</p>
            <div className={styles.actions}>
              <Link href="/login?intent=start" className={`${styles.primary} press`}>Get started free</Link>
              <Link href="/prices" className={`${styles.secondary} press`}>Compare prices</Link>
            </div>
          </div>
          <nav className={styles.columns} aria-label="Footer">
            {GROUPS.map((group) => (
              <div key={group.title}>
                <p className={styles.columnTitle}>{group.title}</p>
                <ul>
                  {group.links.map(([label, href]) => (
                    <li key={href}><Link href={href}>{label}</Link></li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className={styles.bottom}>
          <p>© {new Date().getFullYear()} Railor. Prices are public quotes, published fees or dated estimates — confirm the final amount with the provider before you send.</p>
          <Link href="/status" className={styles.status}><span aria-hidden />Service status<ArrowUpRight size={13} aria-hidden /></Link>
        </div>
      </div>
      {/* The sign-off: Railor's rail running across the map, with the name set large over it. Decorative only. */}
      <div className={styles.scene} aria-hidden="true">
        <Image className={styles.sceneImage} src="/images/railor-hero-route.png" alt="" fill sizes="100vw" quality={70} />
        <p className={styles.wordmark}>
          {"Railor".split("").map((letter, index) => (
            <span key={index} style={{ "--l": index } as React.CSSProperties}>{letter}</span>
          ))}
        </p>
      </div>
    </footer>
  );
}
