import { Command } from "commander";
import type { RailorClient } from "../client.js";
import { fail } from "../errors.js";
import { bold, dim, printJson } from "../format.js";

export function registerCompareCommands(program: Command, getClient: () => RailorClient) {
  program
    .command("compare <providers...>")
    .description("compare 2–4 providers side by side (POST /v1/compare)")
    .option("--diff", "only show dimensions where providers disagree")
    .option("--json", "print raw JSON")
    .action(async (providers: string[], flags: { diff?: boolean; json?: boolean }) => {
      try {
        const result = await getClient().post<{
          dimensions: string[];
          differing_dimensions: string[];
          providers: Array<{ id: string; name: string; dimensions: Record<string, unknown> }>;
        }>("/v1/compare", { providers, only_differences: Boolean(flags.diff) });
        if (flags.json) return printJson(result);
        for (const dimension of result.dimensions) {
          const marker = result.differing_dimensions.includes(dimension) ? "≠" : "=";
          console.log(`${bold(`${marker} ${dimension}`)}`);
          for (const p of result.providers) {
            const value = p.dimensions[dimension];
            const text = Array.isArray(value) ? value.join(", ") || dim("—") : String(value);
            console.log(`   ${p.id.padEnd(24)} ${text}`);
          }
        }
      } catch (error) {
        fail(error);
      }
    });
}
