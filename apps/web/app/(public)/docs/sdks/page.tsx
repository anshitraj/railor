import { CodeSample, SectionLabel, StageBadge } from "@railor/ui";

export const metadata = { title: "SDKs" };

export default function SdkDocs() {
  return (
    <>
      <div className="flex flex-col gap-3">
        <SectionLabel>Reference</SectionLabel>
        <h1 className="flex items-center gap-3 text-[32px] font-semibold tracking-tight">
          SDKs <StageBadge stage="beta" />
        </h1>
        <p className="text-[15px] leading-relaxed text-[var(--color-muted)]">
          The SDK surface mirrors the REST tree exactly, so a method name is a path and nothing has
          to be learned twice. Until the packages are published, these shapes are stable enough to
          write against with `fetch`.
        </p>
      </div>

      <CodeSample
        variants={[
          {
            language: "ts",
            label: "TypeScript",
            code: `import { Railor } from "@railor/sdk"

const railor = new Railor({ apiKey: process.env.RAILOR_API_KEY! })

await railor.corridors.search({ entityCountry: "IN", destinationCountry: "AE" })
await railor.providers.list({ product: "payout" })
await railor.providers.retrieve("ironwood-settlement")
await railor.changes.list({ provider: "meridian-pay", limit: 10 })`,
          },
          {
            language: "python",
            label: "Python",
            code: `from railor import Railor

railor = Railor(api_key=os.environ["RAILOR_API_KEY"])

railor.corridors.search(entity_country="IN", destination_country="AE")
railor.providers.list(product="payout")
railor.providers.retrieve("ironwood-settlement")
railor.changes.list(provider="meridian-pay", limit=10)`,
          },
        ]}
        caption="One key works across REST, SDKs, CLI and MCP."
      />
    </>
  );
}
