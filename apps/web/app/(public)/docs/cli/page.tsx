import { CodeSample, StageBadge } from "@railor/ui";
import { Bullet, Bullets } from "../../../../components/docs/bullets";
import { DocsHeader } from "../../../../components/docs/docs-header";

export const metadata = { title: "CLI" };

export default function CliDocs() {
  return (
    <>
      <DocsHeader eyebrow="Reference" title="CLI" badge={<StageBadge stage="beta" />}>
        A thin client over the same /v1 endpoints the app and the SDKs use — every command maps
        onto one HTTP call, and <code>--json</code> on any of them prints exactly what that call
        returned.
      </DocsHeader>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Install &amp; authenticate</h2>
        <CodeSample
          variants={[
            {
              language: "bash",
              label: "This repo",
              code: `# from the monorepo root — no separate install step
pnpm cli login rail_test_your_key_here

# or skip login entirely and set it per-shell
export RAILOR_API_KEY=rail_test_your_key_here`,
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
railor providers get northwind-rails
railor changes list --provider meridian-pay --since 7d
railor changes list --since 24h --json`,
            },
            {
              language: "bash",
              label: "Compare & capabilities",
              code: `railor compare northwind-rails meridian-pay --diff
railor capabilities list --to AE --asset USDC --availability supported
railor capabilities list --provider northwind-rails --limit 50 --after <last-id>`,
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
        <Bullets>
          <Bullet>
            A corridor watch targets a corridor you have already saved (its id, from the app or{" "}
            <code>corridors search --json</code>) — there is no separate endpoint for defining one
            ad hoc, so the CLI does not invent one either.
          </Bullet>
          <Bullet>
            API key creation stays in the dashboard&apos;s developer portal. It is a
            security-sensitive action gated to org owners/admins; the CLI only ever <em>uses</em> a
            key, it never mints one.
          </Bullet>
          <Bullet>
            Every list command accepts <code>--json</code> for scripting; everything else is a
            formatted table.
          </Bullet>
        </Bullets>
      </section>
    </>
  );
}
