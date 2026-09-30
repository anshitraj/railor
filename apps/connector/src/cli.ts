import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { runConnectorOnce } from "./runtime.js";
import { sealVault } from "./vault.js";

async function main() {
  if (process.argv.includes("--seal-vault")) {
    const path = process.env.RAILOR_VAULT_PATH;
    const key = process.env.RAILOR_VAULT_KEY;
    if (!path || !key) throw new Error("vault_configuration_required");
    let input = "";
    for await (const chunk of process.stdin) { input += chunk; if (input.length > 500000) throw new Error("vault_too_large"); }
    await writeFile(path, sealVault(JSON.parse(input), key), { flag: "wx", mode: 0o600 });
    console.log("Encrypted vault created. Configure Windows ACLs if applicable; keep its key in a separate secret manager.");
    return;
  }
  const { RAILOR_CLOUD_ORIGIN: origin, RAILOR_CONNECTOR_TOKEN: token, RAILOR_CONNECTOR_ID: installationId } = process.env;
  if (!origin || !token || !installationId) throw new Error("connector_configuration_required");
  const config = { origin, token, installationId, journalDir: resolve(process.env.RAILOR_CONNECTOR_JOURNAL ?? ".railor-connector-journal"), allowLocalhost: process.env.RAILOR_CONNECTOR_ALLOW_LOCALHOST === "true", vaultPath: process.env.RAILOR_VAULT_PATH, vaultKey: process.env.RAILOR_VAULT_KEY };
  let stopped = false; process.on("SIGINT", () => { stopped = true; }); process.on("SIGTERM", () => { stopped = true; });
  do {
    try { const result = await runConnectorOnce(config); console.log(JSON.stringify(result)); }
    catch { console.error("Connector cycle failed. No job was automatically replayed. Check connectivity and the local journal."); if (process.argv.includes("--once")) process.exitCode = 1; }
    if (process.argv.includes("--once") || stopped) break;
    await new Promise((done) => setTimeout(done, 5000));
  } while (!stopped);
}
main().catch(() => { console.error("Connector startup failed. Check configuration; secret values have been omitted."); process.exitCode = 1; });
