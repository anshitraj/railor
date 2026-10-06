import Link from "next/link";
import { ArrowRight, Code2, Package, Zap, type LucideIcon } from "lucide-react";
import { CodeSample, TechnologyLogo, TechnologyLogoStack } from "@railor/ui";
import { DocsHeader } from "../../../components/docs/docs-header";
import { getSession } from "../../../lib/auth";
import { getOrgTestKey } from "../../../lib/org";

export const metadata = { title: "Documentation" };
export const dynamic = "force-dynamic";

const NEXT_STEPS: Array<{ href: string; title: string; blurb: string; icon: LucideIcon }> = [
  { href: "/docs/api", title: "API reference", blurb: "Endpoints, authentication, errors.", icon: Code2 },
  { href: "/docs/mcp", title: "MCP server", blurb: "Let an agent ask the same questions.", icon: Zap },
  { href: "/docs/sdks", title: "SDKs", blurb: "TypeScript and Python shapes.", icon: Package },
];

export default async function DocsIndex() {
  const session = await getSession();
  const key = session?.organization ? await getOrgTestKey(session.organization.id) : null;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <>
      <DocsHeader eyebrow="Getting started" title="60 seconds to a real answer">
        Railor answers one question: which providers can serve this corridor, why, and what
        supports that answer. Everything below returns the same data the app renders.
      </DocsHeader>

      <CodeSample
        apiKey={key ?? undefined}
        variants={[
          {
            language: "curl",
            label: "cURL",
            code: `curl ${base}/v1/corridors/search \\
  -H "Authorization: Bearer RAILOR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "entity_country": "IN",
    "destination_country": "AE",
    "asset": "USDC",
    "destination_currency": "AED",
    "customer_type": "business"
  }'`,
          },
          {
            language: "ts",
            label: "TypeScript",
            code: `const res = await fetch("${base}/v1/corridors/search", {
  method: "POST",
  headers: {
    Authorization: "Bearer RAILOR_API_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    entity_country: "IN",
    destination_country: "AE",
    asset: "USDC",
    destination_currency: "AED",
    customer_type: "business",
  }),
})

const { data, counts, providers_checked } = await res.json()`,
          },
          {
            language: "python",
            label: "Python",
            code: `import httpx

res = httpx.post(
    "${base}/v1/corridors/search",
    headers={"Authorization": "Bearer RAILOR_API_KEY"},
    json={
        "entity_country": "IN",
        "destination_country": "AE",
        "asset": "USDC",
        "destination_currency": "AED",
        "customer_type": "business",
    },
)
print(res.json()["counts"])`,
          },
        ]}
        caption={key ? "Rendered with your workspace's test key." : "Sign in to render this with your own key."}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">What comes back</h2>
        <p className="text-[14.5px] leading-relaxed text-[var(--color-muted)]">
          Each result carries an eligibility verdict, the reasons behind it (including what is
          nonetheless true and what would change it), a confidence score, the time the underlying
          claim was last verified, and the evidence it rests on.
        </p>
        <CodeSample
          variants={[
            {
              language: "json",
              label: "Response",
              code: `{
  "object": "corridor_search",
  "providers_checked": 15,
  "counts": { "supported": 2, "additional_requirements": 3, "unavailable": 10, "unknown": 0 },
  "data": [
    {
      "object": "provider_result",
      "provider": { "slug": "ironwood-settlement", "name": "Ironwood Settlement" },
      "eligibility": "supported",
      "confidence": 0.95,
      "confidence_band": "verified",
      "last_verified_at": "2026-08-17T12:24:00Z",
      "reasons": [
        {
          "code": "all_checks_passed",
          "message": "Ironwood Settlement publishes support for every dimension of this query.",
          "also_true": [],
          "would_change": []
        }
      ],
      "evidence": [
        {
          "source_url": "https://demo.railor.dev/sources/ironwood/coverage",
          "source_type": "official_docs",
          "last_verified_at": "2026-08-17T12:24:00Z",
          "confidence": 0.95
        }
      ]
    }
  ]
}`,
            },
          ]}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-[20px] font-semibold">Next</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {NEXT_STEPS.map(({ href, title, blurb, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="group flex h-full flex-col gap-4 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-lift)]"
              >
                <span className="flex h-9 w-fit min-w-9 items-center justify-center rounded-xl bg-[var(--color-sand)] px-2 text-[var(--color-orange-deep)] transition-colors group-hover:bg-[var(--color-orange)] group-hover:text-white">
                  {href === "/docs/mcp" ? <TechnologyLogo name="MCP" size={23} /> : href === "/docs/sdks" ? <TechnologyLogoStack names={["TypeScript", "Python"]} size={23} /> : <Icon size={17} strokeWidth={2} aria-hidden />}
                </span>
                <span className="flex flex-col gap-1">
                  <span className="flex items-center gap-1.5 font-display text-[16px] font-semibold tracking-[-0.02em]">
                    {title}
                    <ArrowRight
                      size={14}
                      aria-hidden
                      className="text-[var(--color-faint)] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--color-orange-deep)]"
                    />
                  </span>
                  <span className="text-[13px] leading-snug text-[var(--color-muted)]">{blurb}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
