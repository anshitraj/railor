import Link from "next/link";
import { RailorMark } from "./nav";

const GROUPS: Array<{ title: string; links: Array<[string, string]> }> = [
  {
    title: "Product",
    links: [
      ["Search", "/#search"],
      ["Corridor Explorer", "/app/corridors"],
      ["Provider Directory", "/providers"],
      ["Change feed", "/changes"],
      ["Monitoring", "/app/monitoring"],
    ],
  },
  {
    title: "Developers",
    links: [
      ["Documentation", "/docs"],
      ["API reference", "/docs/api"],
      ["MCP server", "/docs/mcp"],
      ["SDKs", "/docs/sdks"],
      ["Changelog", "/docs/changelog"],
    ],
  },
  {
    title: "Company",
    links: [
      ["About", "/company"],
      ["Roadmap", "/company/roadmap"],
      ["Trust", "/company/trust"],
    ],
  },
];

export function MarketingFooter({
  counts,
}: {
  counts: { providers: number; countries: number; sources: number; capabilities: number };
}) {
  return (
    <footer className="border-t border-[var(--color-line)] bg-white">
      <div className="mx-auto grid w-[min(1180px,calc(100%-2rem))] gap-10 py-14 lg:grid-cols-[1.4fr_2fr]">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <RailorMark />
            <span className="text-[15px] font-semibold">Railor</span>
          </div>
          <p className="max-w-sm text-[13.5px] leading-relaxed text-[var(--color-muted)]">
            Financial infrastructure, mapped. Discover, compare and monitor the rails powering
            global money movement.
          </p>
          <dl className="grid grid-cols-2 gap-3 pt-2 text-[13px]">
            <div>
              <dt className="text-[var(--color-faint)]">Providers mapped</dt>
              <dd className="tabular font-medium">{counts.providers}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-faint)]">Countries indexed</dt>
              <dd className="tabular font-medium">{counts.countries}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-faint)]">Sources monitored</dt>
              <dd className="tabular font-medium">{counts.sources}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-faint)]">Capabilities tracked</dt>
              <dd className="tabular font-medium">{counts.capabilities}</dd>
            </div>
          </dl>
          <p className="max-w-sm text-[11.5px] leading-relaxed text-[var(--color-faint)]">
            This deployment runs on a clearly-labelled demonstration dataset. Providers shown are
            fictional and exist to exercise the product, not to describe real companies.
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          {GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-2">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
                {group.title}
              </p>
              {group.links.map(([label, href]) => (
                <Link
                  key={label}
                  href={href}
                  className="text-[13.5px] text-[var(--color-ink-soft)] hover:text-[var(--color-purple)]"
                >
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-[var(--color-line)]">
        <div className="mx-auto flex w-[min(1180px,calc(100%-2rem))] flex-wrap items-center gap-4 py-5 text-[12px] text-[var(--color-faint)]">
          <span>© {new Date().getFullYear()} Railor</span>
          <Link href="/company/trust" className="hover:text-[var(--color-ink-soft)]">
            Terms
          </Link>
          <Link href="/company/trust" className="hover:text-[var(--color-ink-soft)]">
            Privacy
          </Link>
          <span className="flex-1" />
          <span>Say unknown, not wrong.</span>
        </div>
      </div>
    </footer>
  );
}

