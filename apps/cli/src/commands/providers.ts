import { Command } from "commander";
import type { RailorClient } from "../client.js";
import { fail } from "../errors.js";
import { printJson, table } from "../format.js";

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
}
