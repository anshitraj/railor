import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ConnectorReceipt, ConnectorQuote, verifyConnectorCommand } from "@railor/core/connector-protocol";
import { loadProviderCredentials } from "./vault.js";
import type { z } from "zod";

export interface RuntimeConfig { origin: string; token: string; installationId: string; journalDir: string; allowLocalhost?: boolean; vaultPath?: string; vaultKey?: string }

export function validateCloudOrigin(value: string, allowLocalhost = false) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Expected a bare cloud origin");
  if (url.protocol !== "https:" && !(allowLocalhost && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("HTTPS is required");
  return url.origin;
}

export async function runConnectorOnce(config: RuntimeConfig, fetcher: typeof fetch = fetch) {
  const origin = validateCloudOrigin(config.origin, config.allowLocalhost);
  const send = async (body: unknown) => {
    const response = await fetcher(`${origin}/api/connector/poll`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`cloud_request_failed_${response.status}`);
    return response.json() as Promise<{ data: unknown }>;
  };
  await mkdir(config.journalDir, { recursive: true, mode: 0o700 });
  // Receipt delivery is retried before polling. The cloud never requeues a
  // claimed job automatically; a lost acknowledgment must not rerun an effect.
  const { readdir } = await import("node:fs/promises");
  for (const filename of await readdir(config.journalDir)) {
    if (!/^[a-f0-9-]{36}\.receipt\.json$/.test(filename)) continue;
    const receipt = ConnectorReceipt.parse(JSON.parse(await readFile(join(config.journalDir, filename), "utf8")));
    await send({ action: "receipt", receipt });
    await rename(join(config.journalDir, filename), join(config.journalDir, filename.replace(".receipt.json", ".delivered.json")));
  }
  const envelope = (await send({ action: "poll" })).data as { command: unknown; signature: string } | null;
  if (!envelope) return { status: "idle" as const };
  const command = verifyConnectorCommand(envelope.command, envelope.signature, config.token, config.installationId);
  const marker = join(config.journalDir, `${command.id}.started`);
  let receipt: z.infer<typeof ConnectorReceipt>;
  try {
    const lock = await open(marker, "wx", 0o600);
    try { await lock.writeFile(command.decisionHash); await lock.sync(); } finally { await lock.close(); }
    // This executable only simulates. Do not replace this branch with a money
    // transfer without provider idempotency + reconciliation conformance.
    if (command.operation === "get_quote") {
      try {
        if (!config.vaultPath || !config.vaultKey) throw new Error("vault_required");
        const { getAdapter } = await import("@railor/core/adapters");
        const adapter = getAdapter(command.provider);
        if (!adapter?.getQuote) throw new Error("quote_adapter_unavailable");
        const credentials = await loadProviderCredentials(config.vaultPath, config.vaultKey, command.provider);
        const intent = command.intent;
        const quote = ConnectorQuote.parse(await adapter.getQuote(credentials, { sourceAsset: intent.sourceAsset ?? intent.sourceCurrency ?? "", sourceNetwork: intent.sourceNetwork,
          destinationCurrency: intent.destinationCurrency ?? "", destinationCountry: intent.destinationCountry,
          entityCountry: intent.sourceEntityCountry, amount: intent.amount, paymentMethodType: intent.namedRail }));
        receipt = { jobId: command.id, status: "succeeded", code: "quoted", quote };
      } catch { receipt = { jobId: command.id, status: "failed", code: "runtime_failure" }; }
    } else receipt = { jobId: command.id, status: "succeeded", code: "simulated", reference: `sim_${command.id}` };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    try {
      receipt = ConnectorReceipt.parse(JSON.parse(await readFile(join(config.journalDir, `${command.id}.delivered.json`), "utf8"))) as typeof receipt;
    } catch { receipt = { jobId: command.id, status: "unknown", code: "outcome_unknown" }; }
  }
  const pending = join(config.journalDir, `${command.id}.receipt.json`);
  await writeFile(`${pending}.tmp`, JSON.stringify(receipt), { mode: 0o600 });
  await rename(`${pending}.tmp`, pending);
  await send({ action: "receipt", receipt });
  await rename(pending, join(config.journalDir, `${command.id}.delivered.json`));
  return { status: receipt.status, jobId: command.id };
}
