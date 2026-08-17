import { Command } from "commander";
import type { RailorClient } from "../client.js";
import { fail } from "../errors.js";
import { dim, printJson, table } from "../format.js";

/**
 * Mirrors POST /v1/watchlists exactly: `--type` + `--target` are
 * `target_type` / `target_id` on the wire. A corridor target is the id of a
 * corridor already saved through the app — there is no separate "define an
 * ad-hoc corridor" endpoint, so the CLI doesn't pretend one exists either.
 */
export function registerWatchCommands(program: Command, getClient: () => RailorClient) {
  const watch = program.command("watch").description("monitor providers, corridors, countries, assets or products");

  watch
    .command("list")
    .description("list your monitors")
    .option("--json", "print raw JSON instead of a table")
    .action(async (flags: { json?: boolean }) => {
      try {
        const client = getClient();
        const result = await client.get<{
          data: Array<{
            id: string;
            target_type: string;
            target_id: string;
            label: string;
            digest: string;
            unread_alerts: number;
          }>;
        }>("/v1/watchlists");

        if (flags.json) return printJson(result);

        console.log(
          table(
            result.data.map((w) => ({
              id: w.id,
              type: w.target_type,
              label: w.label,
              digest: w.digest,
              unread: w.unread_alerts > 0 ? String(w.unread_alerts) : dim("0"),
            })),
            ["id", "type", "label", "digest", "unread"],
          ),
        );
      } catch (error) {
        fail(error);
      }
    });

  watch
    .command("add")
    .description("arm a monitor")
    .requiredOption("--type <target>", "provider | corridor | country | asset | product")
    .requiredOption(
      "--target <id>",
      "provider slug, saved-corridor id, ISO country, asset symbol, or product",
    )
    .option("--label <text>", "override the auto-derived label")
    .option(
      "--kinds <list>",
      "comma-separated change kinds to alert on (default: a sensible set per type)",
    )
    .option("--digest <cadence>", "instant | daily | weekly", "instant")
    .option("--json", "print raw JSON instead of a table")
    .action(
      async (flags: {
        type: string;
        target: string;
        label?: string;
        kinds?: string;
        digest: string;
        json?: boolean;
      }) => {
        try {
          const client = getClient();
          const result = await client.post<{
            created: boolean;
            data: { id: string; label: string };
          }>("/v1/watchlists", {
            target_type: flags.type,
            target_id: flags.target,
            label: flags.label,
            kinds: flags.kinds ? flags.kinds.split(",").map((k) => k.trim()) : undefined,
            digest: flags.digest,
          });

          if (flags.json) return printJson(result);

          console.log(
            (result.created ? "Armed" : "Already armed") +
              ` — ${result.data.label} (${result.data.id})`,
          );
        } catch (error) {
          fail(error);
        }
      },
    );

  watch
    .command("remove")
    .description("disarm a monitor")
    .argument("<id>", "watchlist id, from `railor watch list`")
    .action(async (id: string) => {
      try {
        await getClient().del(`/v1/watchlists/${id}`);
        console.log(`Disarmed ${id}.`);
      } catch (error) {
        fail(error);
      }
    });

  watch
    .command("alerts")
    .description("what a monitor has raised")
    .argument("<id>", "watchlist id, from `railor watch list`")
    .option("--limit <n>", "max rows", "25")
    .option("--json", "print raw JSON instead of a table")
    .action(async (id: string, flags: { limit: string; json?: boolean }) => {
      try {
        const client = getClient();
        const result = await client.get<{
          data: Array<{
            change: {
              provider: { name: string };
              summary: string;
              detected_at: string;
              kind: string;
            };
            read_at: string | null;
          }>;
        }>(`/v1/watchlists/${id}/alerts`, { limit: flags.limit });

        if (flags.json) return printJson(result);

        console.log(
          table(
            result.data.map((a) => ({
              provider: a.change.provider.name,
              kind: a.change.kind,
              detected: new Date(a.change.detected_at).toLocaleString(),
              read: a.read_at ? "yes" : dim("no"),
              summary: a.change.summary.slice(0, 55),
            })),
            ["provider", "kind", "detected", "read", "summary"],
          ),
        );
      } catch (error) {
        fail(error);
      }
    });
}
