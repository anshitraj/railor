import Link from "next/link";
import { CodeSample, SectionLabel } from "@railor/ui";
import { getSession } from "../../../lib/auth";
import { getOrgTestKey } from "../../../lib/org";

export const metadata = { title: "Documentation" };
export const dynamic = "force-dynamic";

export default async function DocsIndex() {
  const session = await getSession();
  const key = session?.organization ? await getOrgTestKey(session.organization.id) : null;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <>
      <div className="flex flex-col gap-3">
        <SectionLabel>Getting started</SectionLabel>
        <h1 className="text-[32px] font-semibold tracking-tight">60 seconds to a real answer</h1>
        <p className="text-[15px] leading-relaxed text-[var(--color-muted)]">
          Railor answers one question: which providers can serve this corridor, why, and what
          supports that answer. Everything below returns the same data the app renders.
        </p>
      </div>

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

      <section className="flex flex-col gap-2">
        <h2 className="text-[20px] font-semibold">Next</h2>
        <ul className="flex flex-col gap-1.5 text-[14.5px]">
          <li>
            <Link href="/docs/api" className="text-[var(--color-purple)]">
              API reference
            </Link>{" "}
            — endpoints, authentication, errors.
          </li>
          <li>
            <Link href="/docs/mcp" className="text-[var(--color-purple)]">
              MCP server
            </Link>{" "}
            — let an agent ask the same questions.
          </li>
          <li>
            <Link href="/docs/sdks" className="text-[var(--color-purple)]">
              SDKs
            </Link>{" "}
            — TypeScript and Python shapes.
          </li>
        </ul>
      </section>
    </>
  );
}
