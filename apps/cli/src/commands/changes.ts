import { Command } from "commander";
import type { RailorClient } from "../client.js";
import { fail } from "../errors.js";
import { dim, printJson, table } from "../format.js";

export function registerChangeCommands(program: Command, getClient: () => RailorClient) {
  const changes = program.command("changes").description("detected provider changes");

  changes
    .command("list")
    .description("list detected changes, newest first")
    .option("--provider <slug>", "filter to one provider")
    .option("--since <duration>", 'e.g. "7d", "24h", "30m", or an ISO date')
    .option("--limit <n>", "max rows (default 25, max 100)", "25")
    .option("--json", "print raw JSON instead of a table")
    .action(
      async (flags: { provider?: string; since?: string; limit: string; json?: boolean }) => {
        try {
          const client = getClient();
          const result = await client.get<{
            data: Array<{
              provider: { slug: string; name: string };
              kind: string;
              summary: string;
              detected_at: string;
              review_status: string;
            }>;
          }>("/v1/changes", {
            provider: flags.provider,
            since: flags.since,
            limit: flags.limit,
          });

          if (flags.json) return printJson(result);

          console.log(
            table(
              result.data.map((c) => ({
                provider: c.provider.name,
                kind: c.kind,
                detected: new Date(c.detected_at).toLocaleString(),
                status: c.review_status === "pending" ? dim("pending") : c.review_status,
                summary: c.summary.slice(0, 60),
              })),
              ["provider", "kind", "detected", "status", "summary"],
            ),
          );
        } catch (error) {
          fail(error);
        }
      },
    );
}
