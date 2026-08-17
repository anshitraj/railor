import { Command } from "commander";
import type { RailorClient } from "../client.js";
import { addCorridorOptions, corridorBody, type CorridorFlags } from "../corridor-flags.js";
import { fail } from "../errors.js";
import { printJson, table, verdict } from "../format.js";

interface EligibilityFlags extends CorridorFlags {
  provider?: string;
  satisfied?: string;
  json?: boolean;
}

export function registerEligibilityCommands(program: Command, getClient: () => RailorClient) {
  addCorridorOptions(
    program
      .command("eligibility")
      .description("check readiness against your org's KYB profile (or a what-if override)"),
  )
    .option("--provider <slug>", "check one provider instead of every mapped one")
    .option(
      "--satisfied <keys>",
      "comma-separated requirement keys to treat as held, overriding your stored profile",
    )
    .option("--json", "print raw JSON instead of a table")
    .action(async (flags: EligibilityFlags) => {
      try {
        const client = getClient();
        const result = await client.post<{
          kyb_profile: { source: string; profile_complete: boolean };
          data: Array<{
            provider: { name: string };
            eligibility: string;
            readiness: { outstanding: Array<{ label: string }> };
          }>;
        }>("/v1/eligibility", {
          ...corridorBody(flags),
          provider: flags.provider,
          satisfied_requirements: flags.satisfied
            ? flags.satisfied.split(",").map((s) => s.trim())
            : undefined,
        });

        if (flags.json) return printJson(result);

        console.log(
          `readiness source: ${result.kyb_profile.source}` +
            (result.kyb_profile.profile_complete ? "" : " (no documents recorded yet)"),
        );
        console.log();
        console.log(
          table(
            result.data.map((r) => ({
              provider: r.provider.name,
              eligibility: verdict(r.eligibility),
              outstanding: r.readiness.outstanding.map((o) => o.label).join(", ") || "—",
            })),
            ["provider", "eligibility", "outstanding"],
          ),
        );
      } catch (error) {
        fail(error);
      }
    });
}
