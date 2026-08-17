import { Command } from "commander";
import type { RailorClient } from "../client.js";
import { addCorridorOptions, corridorBody, type CorridorFlags } from "../corridor-flags.js";
import { fail } from "../errors.js";
import { printJson, table, verdict } from "../format.js";

export function registerCorridorCommands(program: Command, getClient: () => RailorClient) {
  const corridors = program.command("corridors").description("evaluate providers against a route");

  addCorridorOptions(
    corridors
      .command("search")
      .description("check every mapped provider against a corridor")
      .option(
        "--preset <name>",
        "balanced | cheapest | fastest | easiest_onboarding | widest_coverage",
        "balanced",
      )
      .option("--json", "print raw JSON instead of a table"),
  ).action(async (flags: CorridorFlags & { preset: string; json?: boolean }) => {
    try {
      const client = getClient();
      const result = await client.post<{
        providers_checked: number;
        counts: Record<string, number>;
        data: Array<{
          provider: { slug: string; name: string };
          eligibility: string;
          confidence: number;
          reasons: Array<{ message: string }>;
        }>;
      }>("/v1/corridors/search", { ...corridorBody(flags), preset: flags.preset });

      if (flags.json) return printJson(result);

      console.log(
        `${result.providers_checked} checked · ` +
          Object.entries(result.counts)
            .map(([k, v]) => `${v} ${k}`)
            .join(" · "),
      );
      console.log();
      console.log(
        table(
          result.data.map((r) => ({
            provider: r.provider.name,
            eligibility: verdict(r.eligibility),
            confidence: r.confidence.toFixed(2),
            reason: r.reasons[0]?.message.slice(0, 70) ?? "",
          })),
          ["provider", "eligibility", "confidence", "reason"],
        ),
      );
    } catch (error) {
      fail(error);
    }
  });
}
