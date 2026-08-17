import Link from "next/link";
import { getSession } from "../../../lib/auth";
import { getOrgTestKey } from "../../../lib/org";

export const dynamic = "force-dynamic";

const NAV: Array<[string, Array<[string, string]>]> = [
  [
    "Getting started",
    [
      ["Overview", "/docs"],
      ["Guides", "/docs/guides"],
    ],
  ],
  [
    "Reference",
    [
      ["API", "/docs/api"],
      ["SDKs", "/docs/sdks"],
      ["CLI", "/docs/cli"],
      ["MCP", "/docs/mcp"],
    ],
  ],
  [
    "Product",
    [
      ["Changelog", "/docs/changelog"],
      ["Trust", "/company/trust"],
    ],
  ],
];

export default async function DocsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const key = session?.organization ? await getOrgTestKey(session.organization.id) : null;

  return (
    <div className="grid gap-10 lg:grid-cols-[200px_1fr]">
      <aside className="flex flex-col gap-5">
        {NAV.map(([group, links]) => (
          <div key={group} className="flex flex-col gap-1.5">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
              {group}
            </p>
            {links.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="text-[13.5px] text-[var(--color-ink-soft)] hover:text-[var(--color-purple)]"
              >
                {label}
              </Link>
            ))}
          </div>
        ))}

        <div className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white p-3">
          {key ? (
            <>
              <p className="text-[11px] uppercase tracking-wide text-[var(--color-purple)]">
                Your test key
              </p>
              <code className="break-all text-[11.5px] text-[var(--color-ink-soft)]">{key}</code>
              <p className="mt-1 text-[11px] text-[var(--color-faint)]">
                Snippets on these pages are rendered with it.
              </p>
            </>
          ) : (
            <>
              <p className="text-[12px] text-[var(--color-ink-soft)]">
                Sign in and every snippet renders with your own test key.
              </p>
              <Link
                href="/login?intent=start"
                className="mt-1 inline-block text-[12.5px] font-medium text-[var(--color-purple)]"
              >
                Sign in →
              </Link>
            </>
          )}
        </div>
      </aside>

      <article className="flex max-w-3xl flex-col gap-6">{children}</article>
    </div>
  );
}
