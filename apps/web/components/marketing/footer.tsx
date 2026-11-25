import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { RailorMark } from "../brand";
import { HORIZON_ARCS, HORIZON_NODES, HORIZON_SIZE } from "./footer-horizon-data";
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
      {/* The sign-off: the dotted Earth rising under the page, money moving along Railor's busiest corridors, and the name set large over it. Decorative only. */}
      <div className={styles.scene} aria-hidden="true">
        <div className={styles.planet}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a static decorative SVG; nothing to optimise */}
          <img className={styles.planetDots} src="/images/footer-horizon.svg" alt="" width={HORIZON_SIZE.width} height={HORIZON_SIZE.height} loading="lazy" decoding="async" />
          <svg className={styles.planetRoutes} viewBox={`0 0 ${HORIZON_SIZE.width} ${HORIZON_SIZE.height}`} preserveAspectRatio="xMidYMax slice" focusable="false">
            {HORIZON_ARCS.map((arc, index) => (
              <g key={`${arc.from}-${arc.to}`} style={{ "--route": index } as React.CSSProperties}>
                <path className={styles.route} d={arc.d} pathLength={1} />
                <path className={styles.comet} d={arc.d} pathLength={1} />
              </g>
            ))}
            {HORIZON_NODES.map((node, index) => (
              <g key={node.code} transform={`translate(${node.x} ${node.y})`} style={{ "--node": index } as React.CSSProperties}>
                <circle className={styles.cityHalo} r="12" />
                <circle className={styles.city} r="4.5" />
              </g>
            ))}
          </svg>
        </div>
        <p className={styles.wordmark}>
          {"Railor".split("").map((letter, index) => (
            <span key={index} style={{ "--l": index } as React.CSSProperties}>{letter}</span>
          ))}
        </p>
      </div>
    </footer>
  );
}
