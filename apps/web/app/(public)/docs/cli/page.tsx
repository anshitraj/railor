import { CodeSample, SectionLabel, StageBadge } from "@railor/ui";

export const metadata = { title: "CLI" };

export default function CliDocs() {
  return (
    <>
      <div className="flex flex-col gap-3">
        <SectionLabel>Reference</SectionLabel>
        <h1 className="flex items-center gap-3 text-[32px] font-semibold tracking-tight">
          CLI <StageBadge stage="beta" />
        </h1>
        <p className="text-[15px] leading-relaxed text-[var(--color-muted)]">
          A thin client over the same /v1 endpoints the app and the SDKs use — every command maps
          onto one HTTP call, and <code>--json</code> on any of them prints exactly what that call
          returned.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Install &amp; authenticate</h2>
        <CodeSample
          variants={[
            {
              language: "bash",
              label: "This repo",
              code: `# from the monorepo root — no separate install step
pnpm cli login rk_test_your_key_here

# or skip login entirely and set it per-shell
export RAILOR_API_KEY=rk_test_your_key_here`,
            },
          ]}
          caption="Once published, the same binary runs as `railor` after a global install."
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Commands</h2>
        <CodeSample
          variants={[
            {
              language: "bash",
              label: "Corridors",
              code: `railor corridors search --entity IN --to AE --asset USDC --currency AED
railor corridors search --entity IN --to AE --asset USDC --preset cheapest --json`,
            },
            {
              language: "bash",
              label: "Providers & changes",
              code: `railor providers list --product payout
railor changes list --provider meridian-pay --since 7d
railor changes list --since 24h --json`,
            },
            {
              language: "bash",
              label: "Watching",
              code: `railor watch list
railor watch add --type provider --target meridian-pay
railor watch add --type corridor --target <saved-corridor-id> --digest daily
railor watch alerts <watchlist-id>
railor watch remove <watchlist-id>`,
            },
            {
              language: "bash",
              label: "Eligibility",
              code: `railor eligibility --entity IN --to AE --asset USDC --currency AED
railor eligibility --provider ironwood-settlement --satisfied company_registration,director_identity`,
            },
          ]}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Notes</h2>
        <ul className="flex flex-col gap-1.5 text-[14.5px] leading-relaxed text-[var(--color-muted)]">
          <li>
            • A corridor watch targets a corridor you have already saved (its id, from the app or{" "}
            <code>corridors search --json</code>) — there is no separate endpoint for defining one
            ad hoc, so the CLI does not invent one either.
          </li>
          <li>
            • API key creation stays in the dashboard&apos;s developer portal. It is a
            security-sensitive action gated to org owners/admins; the CLI only ever *uses* a key,
            it never mints one.
          </li>
          <li>• Every list command accepts --json for scripting; everything else is a formatted table.</li>
        </ul>
      </section>
    </>
  );
}
