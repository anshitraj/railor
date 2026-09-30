import { Command } from "commander";
import type { RailorClient } from "../client.js";
import { fail } from "../errors.js";
import { bold, dim, printJson, table } from "../format.js";

interface Payment {
  id: string;
  status: string;
  mode: string;
  amount: string;
  source_currency: string;
  destination_currency: string;
  selected_provider: string | null;
  failure_message: string | null;
  created_at: string;
  route?: { candidates: Array<{ provider: string; score: number; confidence: number; executor: string }>; excluded: Array<{ provider: string; reason: string }> };
}

function show(p: Payment) {
  console.log(`${bold(`${p.amount} ${p.source_currency} → ${p.destination_currency}`)} ${dim(`(${p.mode})`)}`);
  console.log(`status    ${p.status}${p.failure_message ? dim(` — ${p.failure_message}`) : ""}`);
  console.log(`provider  ${p.selected_provider ?? dim("chosen at submit")}`);
  console.log(`id        ${p.id}`);
  for (const [i, c] of (p.route?.candidates ?? []).entries()) console.log(dim(`  ${i + 1}. ${c.provider}  score ${c.score.toFixed(2)}  conf ${Math.round(c.confidence * 100)}%  via ${c.executor}`));
  for (const e of p.route?.excluded ?? []) console.log(dim(`  ✕ ${e.provider}: ${e.reason}`));
}

export function registerPaymentCommands(program: Command, getClient: () => RailorClient) {
  const payments = program.command("payments").description("payments sent through your connected provider accounts");

  payments
    .command("list")
    .description("recent payments for this key's mode (GET /v1/payments)")
    .option("--status <status>", "filter, e.g. processing")
    .option("--json", "print raw JSON")
    .action(async (flags: { status?: string; json?: boolean }) => {
      try {
        const result = await getClient().get<{ data: Payment[] }>("/v1/payments", { status: flags.status });
        if (flags.json) return printJson(result);
        console.log(
          table(
            result.data.map((p) => ({ id: p.id.slice(0, 8), status: p.status, amount: `${p.amount} ${p.source_currency}`, to: p.destination_currency, provider: p.selected_provider ?? "—", created: p.created_at.slice(0, 16) })),
            ["id", "status", "amount", "to", "provider", "created"],
          ),
        );
      } catch (error) {
        fail(error);
      }
    });

  payments
    .command("get <id>")
    .description("one payment with its route (GET /v1/payments/{id})")
    .option("--json", "print raw JSON")
    .action(async (id: string, flags: { json?: boolean }) => {
      try {
        const p = await getClient().get<Payment>(`/v1/payments/${encodeURIComponent(id)}`);
        if (flags.json) return printJson(p);
        show(p);
      } catch (error) {
        fail(error);
      }
    });

  payments
    .command("submit <id>")
    .description("send a ready payment (POST /v1/payments/{id}/submit)")
    .option("--json", "print raw JSON")
    .action(async (id: string, flags: { json?: boolean }) => {
      try {
        const p = await getClient().post<Payment>(`/v1/payments/${encodeURIComponent(id)}/submit`);
        if (flags.json) return printJson(p);
        show(p);
      } catch (error) {
        fail(error);
      }
    });

  program
    .command("routes")
    .description("plan a payment route without creating it (POST /v1/routes)")
    .requiredOption("--entity <country>", "sending entity country, e.g. IN")
    .requiredOption("--to <country>", "destination country, e.g. AE")
    .requiredOption("--currency <code>", "destination currency, e.g. AED")
    .requiredOption("--amount <n>", "amount in the source asset/currency")
    .option("--asset <symbol>", "source stablecoin, e.g. USDC")
    .option("--network <slug>", "source network, e.g. base")
    .option("--source-currency <code>", "fiat source currency instead of an asset")
    .option("--json", "print raw JSON")
    .action(async (flags: { entity: string; to: string; currency: string; amount: string; asset?: string; network?: string; sourceCurrency?: string; json?: boolean }) => {
      try {
        const plan = await getClient().post<{
          policy_verdict: string;
          outcome: string;
          outcome_reason: string | null;
          candidates: Array<{ provider: string; score: number; confidence: number; executor: string }>;
          excluded: Array<{ provider: string; reason: string }>;
        }>("/v1/routes", {
          intent: {
            source_entity_country: flags.entity,
            destination_country: flags.to,
            destination_currency: flags.currency,
            amount: Number(flags.amount),
            source_asset: flags.asset,
            source_network: flags.network,
            source_currency: flags.sourceCurrency,
          },
        });
        if (flags.json) return printJson(plan);
        console.log(`${bold("policy")} ${plan.policy_verdict} → ${plan.outcome}${plan.outcome_reason ? dim(` — ${plan.outcome_reason}`) : ""}`);
        for (const [i, c] of plan.candidates.entries()) console.log(`  ${i + 1}. ${c.provider.padEnd(22)} score ${c.score.toFixed(2)}  conf ${Math.round(c.confidence * 100)}%  ${dim(c.executor)}`);
        for (const e of plan.excluded) console.log(dim(`  ✕ ${e.provider}: ${e.reason}`));
      } catch (error) {
        fail(error);
      }
    });

  program
    .command("prices")
    .description("what arrives through each provider, labelled by basis (POST /v1/prices)")
    .requiredOption("--from <code>", "currency you send, e.g. USD")
    .requiredOption("--to <code>", "currency they receive, e.g. INR")
    .requiredOption("--amount <n>", "amount in the send currency")
    .option("--market", "include dated consumer estimates from Wise's comparison feed")
    .option("--json", "print raw JSON")
    .action(async (flags: { from: string; to: string; amount: string; market?: boolean; json?: boolean }) => {
      try {
        const result = await getClient().post<{
          reference: { rate: number; source: string } | null;
          data: Array<{ provider_name: string; basis: string; recipient_amount: number | null; fee_amount: number | null; fee_currency: string | null; total_cost_pct: number | null; cost_complete: boolean; shortfall_vs_best: number | null }>;
          unavailable: Array<{ provider_name: string; reason: string }>;
        }>("/v1/prices", { source_currency: flags.from, destination_currency: flags.to, amount: Number(flags.amount), include_market: Boolean(flags.market) });
        if (flags.json) return printJson(result);
        const to = flags.to.toUpperCase();
        if (result.reference) console.log(dim(`reference 1 ${flags.from.toUpperCase()} = ${result.reference.rate} ${to} (${result.reference.source})`));
        const columns = ["provider", "basis", `gets (${to})`, "fee", "cost", "vs best"];
        const rows = result.data.map((r) => ({
          provider: r.provider_name,
          basis: r.basis.replace("_", " "),
          [`gets (${to})`]: r.recipient_amount === null ? "—" : r.recipient_amount.toLocaleString("en-US"),
          fee: r.fee_amount === null ? "—" : `${r.fee_amount} ${r.fee_currency ?? ""}`.trim(),
          cost: r.total_cost_pct === null ? "—" : `${r.total_cost_pct.toFixed(2)}%${r.cost_complete ? "" : " (partial)"}`,
          "vs best": r.shortfall_vs_best === 0 ? "best" : r.shortfall_vs_best ? (r.shortfall_vs_best > 0 ? `-${r.shortfall_vs_best}` : `+${-r.shortfall_vs_best}`) : "",
        }));
        console.log(table(rows, columns));
        for (const u of result.unavailable) console.log(dim(`  ${u.provider_name}: ${u.reason}`));
      } catch (error) {
        fail(error);
      }
    });
}
