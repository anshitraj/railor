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
    <footer className="bg-[var(--color-ink)] text-[var(--color-paper)]">
      <div className="mx-auto grid w-[min(1360px,calc(100%-2rem))] gap-10 py-16 lg:grid-cols-[1.4fr_2fr]">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <RailorMark />
            <span className="font-display text-[21px] font-bold tracking-[-0.055em]">Railor</span>
          </div>
          <p className="max-w-sm text-[13.5px] leading-relaxed text-white/55">
            Financial infrastructure, mapped. Discover, compare and monitor the rails powering
            global money movement.
          </p>
          <dl className="grid grid-cols-2 gap-3 pt-2 text-[13px] text-white">
            <div>
              <dt className="text-white/40">Providers mapped</dt>
              <dd className="tabular font-medium">{counts.providers}</dd>
            </div>
            <div>
              <dt className="text-white/40">Countries indexed</dt>
              <dd className="tabular font-medium">{counts.countries}</dd>
            </div>
            <div>
              <dt className="text-white/40">Sources monitored</dt>
              <dd className="tabular font-medium">{counts.sources}</dd>
            </div>
            <div>
              <dt className="text-white/40">Capabilities tracked</dt>
              <dd className="tabular font-medium">{counts.capabilities}</dd>
            </div>
          </dl>
          <p className="max-w-sm text-[11.5px] leading-relaxed text-white/35">
            This deployment runs on a clearly-labelled demonstration dataset. Providers shown are
            fictional and exist to exercise the product, not to describe real companies.
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          {GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-2">
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/40">
                {group.title}
              </p>
              {group.links.map(([label, href]) => (
                <Link
                  key={label}
                  href={href}
                  className="text-[13.5px] text-white/65 hover:text-[var(--color-orange)]"
                >
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex w-[min(1360px,calc(100%-2rem))] flex-wrap items-center gap-4 py-5 text-[12px] text-white/35">
          <span>© {new Date().getFullYear()} Railor</span>
          <Link href="/company/trust" className="hover:text-white">
            Terms
          </Link>
          <Link href="/company/trust" className="hover:text-white">
            Privacy
          </Link>
          <span className="flex-1" />
          <span>Say unknown, not wrong.</span>
        </div>
      </div>
    </footer>
  );
}

