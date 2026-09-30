import { Command } from "commander";
import type { RailorClient } from "../client.js";
import { fail } from "../errors.js";
import { bold, dim, printJson, table } from "../format.js";

export function registerProviderCommands(program: Command, getClient: () => RailorClient) {
  const providers = program.command("providers").description("browse mapped providers");

  providers
    .command("list")
    .description("list providers, optionally filtered")
    .option("--product <type>", "filter by product, e.g. payout")
    .option("--country <code>", "filter by headquarters country")
    .option("--json", "print raw JSON instead of a table")
    .action(async (flags: { product?: string; country?: string; json?: boolean }) => {
      try {
        const client = getClient();
        const result = await client.get<{
          data: Array<{
            slug: string;
            name: string;
            category: string;
            products: string[];
            has_api: boolean;
            last_verified_at: string | null;
          }>;
        }>("/v1/providers", { product: flags.product, country: flags.country });

        if (flags.json) return printJson(result);

        console.log(
          table(
            result.data.map((p) => ({
              slug: p.slug,
              name: p.name,
              category: p.category,
              products: p.products.slice(0, 3).join(", "),
              api: p.has_api ? "yes" : "no",
            })),
            ["slug", "name", "category", "products", "api"],
          ),
        );
      } catch (error) {
        fail(error);
      }
    });

  providers
    .command("get <slug>")
    .description("one provider's coverage, requirements and sources")
    .option("--json", "print raw JSON")
    .action(async (slug: string, flags: { json?: boolean }) => {
      try {
        const p = await getClient().get<{
          id: string;
          name: string;
          category: string;
          products: Array<{ product: string }>;
          coverage: { capability_rows: number; supported_rows: number; destination_countries: string[]; assets: string[] };
          requirements: Array<{ key: string; mandatory: boolean }>;
          evidence: Array<{ url: string; verified_at: string | null }>;
          last_verified_at: string | null;
        }>(`/v1/providers/${encodeURIComponent(slug)}`);
        if (flags.json) return printJson(p);
        console.log(`${bold(p.name)} ${dim(`(${p.id} · ${p.category})`)}`);
        console.log(`products      ${p.products.map((x) => x.product).join(", ") || dim("none")}`);
        console.log(`coverage      ${p.coverage.supported_rows}/${p.coverage.capability_rows} supported rows · ${p.coverage.destination_countries.length} destination countries`);
        console.log(`assets        ${p.coverage.assets.join(", ") || dim("none")}`);
        console.log(`requirements  ${p.requirements.filter((r) => r.mandatory).map((r) => r.key).join(", ") || dim("none published")}`);
        console.log(`verified      ${p.last_verified_at ?? dim("unknown")}`);
        for (const e of p.evidence.slice(0, 5)) console.log(dim(`  source ${e.url}`));
      } catch (error) {
        fail(error);
      }
    });
}
