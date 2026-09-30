import { Command } from "commander";
import type { RailorClient } from "../client.js";
import { fail } from "../errors.js";
import { printJson, table } from "../format.js";

export function registerCapabilityCommands(program: Command, getClient: () => RailorClient) {
  const capabilities = program.command("capabilities").description("raw capability rows with evidence");

  capabilities
    .command("list")
    .description("list capability rows (GET /v1/capabilities)")
    .option("--provider <slug>", "one provider")
    .option("--entity <code>", "entity country")
    .option("--to <code>", "destination country")
    .option("--currency <code>", "destination currency")
    .option("--asset <symbol>", "source asset")
    .option("--availability <state>", "supported | partial | unsupported | unknown")
    .option("--limit <n>", "rows per page", "25")
    .option("--after <id>", "cursor: the last id from the previous page")
    .option("--json", "print raw JSON")
    .action(
      async (flags: {
        provider?: string;
        entity?: string;
        to?: string;
        currency?: string;
        asset?: string;
        availability?: string;
        limit?: string;
        after?: string;
        json?: boolean;
      }) => {
        try {
          const result = await getClient().get<{
            has_more: boolean;
            data: Array<{
              id: string;
              provider: { id: string };
              product: string;
              entity_country: string | null;
              source_asset: string | null;
              destination_country: string | null;
              destination_currency: string | null;
              availability: string;
              confidence: number | null;
            }>;
          }>("/v1/capabilities", {
            provider: flags.provider,
            entity_country: flags.entity,
            destination_country: flags.to,
            destination_currency: flags.currency,
            asset: flags.asset,
            availability: flags.availability,
            limit: flags.limit,
            starting_after: flags.after,
          });
          if (flags.json) return printJson(result);
          console.log(
            table(
              result.data.map((c) => ({
                provider: c.provider.id,
                product: c.product,
                entity: c.entity_country ?? "any",
                route: `${c.source_asset ?? "*"} → ${c.destination_country ?? "*"}/${c.destination_currency ?? "*"}`,
                availability: c.availability,
                confidence: c.confidence === null ? "—" : c.confidence.toFixed(2),
              })),
              ["provider", "product", "entity", "route", "availability", "confidence"],
            ),
          );
          if (result.has_more) console.log(`\nMore rows: --after ${result.data.at(-1)?.id}`);
        } catch (error) {
          fail(error);
        }
      },
    );
}
