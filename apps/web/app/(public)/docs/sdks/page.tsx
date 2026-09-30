import { Fragment } from "react";
import { CodeSample, StageBadge } from "@railor/ui";
import { DocsHeader } from "../../../../components/docs/docs-header";
import { getSession } from "../../../../lib/auth";
import { getOrgTestKey } from "../../../../lib/org";

export const metadata = { title: "SDKs" };
export const dynamic = "force-dynamic";

const METHODS: Array<[string, string, string]> = [
  ["corridors.search(params)", "corridors.search(**params)", "POST /v1/corridors/search"],
  ["eligibility.check(params)", "eligibility.check(**params)", "POST /v1/eligibility"],
  ["providers.list(params)", "providers.list(product=, country=)", "GET /v1/providers"],
  ["providers.retrieve(slug)", "providers.retrieve(slug)", "GET /v1/providers/{id}"],
  ["compare({ providers })", "compare(providers)", "POST /v1/compare"],
  ["capabilities.list(params) · listAll()", "capabilities.list(...) · list_all()", "GET /v1/capabilities"],
  ["changes.list(params)", "changes.list(limit=, provider=, since=)", "GET /v1/changes"],
  ["watchlists.list/create/retrieve/update/delete/alerts", "watchlists.*", "/v1/watchlists"],
  ["decisions.create/retrieve/revalidate/events/evidence", "—", "/v1/decisions"],
  ["policies.list/create/retrieve/createVersion/activate", "—", "/v1/policies"],
];

/** Long slash-separated method names wrap at the slashes instead of forcing a scrollbar. */
function Breakable({ text }: { text: string }) {
  return (
    <>
      {text.split(/(?<=\/)/).map((part, i) => (
        <Fragment key={i}>
          {i > 0 ? <wbr /> : null}
          {part}
        </Fragment>
      ))}
    </>
  );
}

export default async function SdkDocs() {
  const session = await getSession();
  const key = session?.organization ? await getOrgTestKey(session.organization.id) : null;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <>
      <DocsHeader eyebrow="Reference" title="SDKs" badge={<StageBadge stage="beta" />}>
        The SDK surface mirrors the REST tree, so a method name is a path and nothing has to be
        learned twice. Inputs are idiomatic (camelCase in TypeScript, snake_case in Python);
        responses come back exactly as the API sent them, evidence and confidence included.
      </DocsHeader>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Install</h2>
        <CodeSample
          variants={[
            {
              language: "bash",
              label: "TypeScript",
              code: `# inside this monorepo (workspace package, zero dependencies)
pnpm add @railor/sdk --workspace

# or build a publishable copy
pnpm --filter @railor/sdk build`,
            },
            {
              language: "bash",
              label: "Python",
              code: `pip install -e packages/sdk-python`,
            },
          ]}
          caption="Both packages live in the Railor repository; registry publication is pending, so install from source."
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Quick start</h2>
        <CodeSample
          apiKey={key ?? undefined}
          variants={[
            {
              language: "ts",
              label: "TypeScript",
              code: `import { Railor, RailorAPIError } from "@railor/sdk"

const railor = new Railor({ apiKey: "RAILOR_API_KEY", baseUrl: "${base}" })

const routes = await railor.corridors.search({
  entityCountry: "IN",
  destinationCountry: "AE",
  sourceAsset: "USDC",
  destinationCurrency: "AED",
})
console.log(routes.providers_checked, routes.data)

const profile = await railor.providers.retrieve("northwind-rails")
const diff = await railor.compare({ providers: ["northwind-rails", "meridian-pay"], onlyDifferences: true })

for await (const row of railor.capabilities.listAll({ destinationCountry: "AE" })) {
  // every row carries availability, confidence and its evidence
}

try {
  await railor.providers.retrieve("does-not-exist")
} catch (error) {
  if (error instanceof RailorAPIError) console.log(error.status, error.code)
}`,
            },
            {
              language: "python",
              label: "Python",
              code: `from railor import Railor, RailorAPIError

railor = Railor(api_key="RAILOR_API_KEY", base_url="${base}")

routes = railor.corridors.search(
    entity_country="IN",
    destination_country="AE",
    source_asset="USDC",
    destination_currency="AED",
)

profile = railor.providers.retrieve("northwind-rails")
diff = railor.compare(["northwind-rails", "meridian-pay"], only_differences=True)

for row in railor.capabilities.list_all(destination_country="AE"):
    ...  # availability, confidence and evidence on every row`,
            },
          ]}
          caption="Signed in, these samples render with your workspace's test key. Idempotent requests retry on 429/5xx; writes never retry."
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-semibold">Methods</h2>
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white">
          <table className="w-full min-w-[560px] text-left text-[13px]">
            <thead className="border-b border-[var(--color-line)] text-[11px] uppercase tracking-[0.1em] text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-2.5 font-medium">TypeScript</th>
                <th className="px-4 py-2.5 font-medium">Python</th>
                <th className="px-4 py-2.5 font-medium">Endpoint</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)] font-mono text-[12px]">
              {METHODS.map(([ts, py, endpoint]) => (
                <tr key={endpoint}>
                  <td className="px-4 py-2">
                    <Breakable text={ts} />
                  </td>
                  <td className="px-4 py-2 text-[var(--color-ink-soft)]">
                    <Breakable text={py} />
                  </td>
                  <td className="px-4 py-2 text-[var(--color-muted)]">
                    <Breakable text={endpoint} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
