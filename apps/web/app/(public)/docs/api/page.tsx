import { Card, CodeSample, SectionLabel, StageBadge } from "@railor/ui";
import { getSession } from "../../../../lib/auth";
import { getOrgTestKey } from "../../../../lib/org";

export const metadata = { title: "API reference" };
export const dynamic = "force-dynamic";

const ENDPOINTS: Array<{
  method: string;
  path: string;
  summary: string;
  stage: "live" | "beta" | "soon";
}> = [
  { method: "POST", path: "/v1/corridors/search", summary: "Evaluate every provider against a corridor.", stage: "beta" },
  { method: "GET", path: "/v1/providers", summary: "List mapped providers, filterable by product or country.", stage: "beta" },
  { method: "GET", path: "/v1/changes", summary: "Detected changes, newest first. Filter by provider, or since a duration (7d/24h) or ISO date.", stage: "beta" },
  { method: "POST", path: "/v1/eligibility", summary: "Readiness against your org's KYB profile: what is satisfied, what is outstanding, per provider.", stage: "beta" },
  { method: "GET", path: "/v1/watchlists", summary: "List monitors with unread alert counts.", stage: "beta" },
  { method: "POST", path: "/v1/watchlists", summary: "Arm a monitor on a provider, corridor, country, asset or product. Idempotent per target.", stage: "beta" },
  { method: "GET·PATCH·DELETE", path: "/v1/watchlists/{id}", summary: "Inspect, retune or disarm one monitor; GET includes recent alerts.", stage: "beta" },
  { method: "GET", path: "/v1/watchlists/{id}/alerts", summary: "What one monitor has raised, newest first.", stage: "beta" },
  { method: "POST", path: "/v1/compare", summary: "Like-for-like comparison of 2–4 providers.", stage: "soon" },
  { method: "GET", path: "/v1/capabilities", summary: "Raw capability rows with evidence.", stage: "soon" },
];

export default async function ApiDocs() {
  const session = await getSession();
  const key = session?.organization ? await getOrgTestKey(session.organization.id) : null;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <>
      <div className="flex flex-col gap-3">
        <SectionLabel>Reference</SectionLabel>
        <h1 className="text-[32px] font-semibold tracking-tight">API</h1>
        <p className="text-[15px] leading-relaxed text-[var(--color-muted)]">
          Stripe-shaped: bearer authentication, snake_case fields, `object` discriminators and an
          evidence envelope on every claim. Endpoints not yet built are listed as such rather than
          documented as if they exist.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Authentication</h2>
        <CodeSample
          apiKey={key ?? undefined}
          variants={[
            {
              language: "curl",
              label: "cURL",
              code: `curl ${base}/v1/providers \\
  -H "Authorization: Bearer RAILOR_API_KEY"`,
            },
          ]}
          caption="Test keys (rk_test_…) stay revealable in the dashboard. Live keys (rk_live_…) are shown once and stored hashed."
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Endpoints</h2>
        <Card className="divide-y divide-[var(--color-line)] p-0">
          {ENDPOINTS.map((endpoint) => (
            <div key={endpoint.path} className="flex flex-wrap items-center gap-3 p-4">
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  endpoint.method === "GET"
                    ? "bg-[var(--color-ok-bg)] text-[var(--color-ok)]"
                    : "bg-[var(--color-lavender)] text-[var(--color-purple)]"
                }`}
              >
                {endpoint.method}
              </span>
              <code className="text-[13px]">{endpoint.path}</code>
              <StageBadge stage={endpoint.stage} />
              <span className="w-full text-[13px] text-[var(--color-muted)] sm:w-auto sm:flex-1">
                {endpoint.summary}
              </span>
            </div>
          ))}
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Errors</h2>
        <CodeSample
          variants={[
            {
              language: "json",
              label: "Error",
              code: `{
  "object": "error",
  "error": {
    "code": "invalid_api_key",
    "message": "That API key is not valid."
  }
}`,
            },
          ]}
          caption="401 missing_api_key · 401 invalid_api_key · 400 invalid_request · 404 provider_not_found · 404 watchlist_not_found · 404 target_not_found"
        />
      </section>
    </>
  );
}
