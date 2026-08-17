import { Command } from "commander";

export interface CorridorFlags {
  entity?: string;
  to?: string;
  asset?: string;
  network?: string;
  currency?: string;
  method?: string;
  product?: string;
  customer: "business" | "individual";
  amount?: string;
}

/** Shared between `corridors search` and `eligibility check` — same route, same shape. */
export function addCorridorOptions<T extends Command>(command: T): T {
  return command
    .option("--entity <country>", "entity jurisdiction, e.g. IN")
    .option("--to <country>", "destination country, e.g. AE")
    .option("--asset <symbol>", "stablecoin symbol, e.g. USDC")
    .option("--network <slug>", "blockchain, e.g. base")
    .option("--currency <code>", "destination currency, e.g. AED")
    .option("--method <rail>", "payment method, e.g. bank_transfer_local")
    .option("--product <type>", "product, e.g. payout")
    .option("--customer <type>", "business or individual", "business")
    .option("--amount <n>", "amount, in --currency") as T;
}

export function corridorBody(flags: CorridorFlags) {
  return {
    entity_country: flags.entity,
    destination_country: flags.to,
    asset: flags.asset,
    network: flags.network,
    destination_currency: flags.currency,
    payment_method: flags.method,
    product: flags.product,
    customer_type: flags.customer,
    amount: flags.amount ? Number(flags.amount) : undefined,
  };
}
