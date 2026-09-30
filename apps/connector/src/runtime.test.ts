import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConnectorCommand, signConnectorCommand, connectorTokenHash } from "@railor/core/connector-protocol";
import { runConnectorOnce, validateCloudOrigin } from "./runtime.js";
import { openVault, sealVault } from "./vault.js";
const { quoteMock } = vi.hoisted(() => ({ quoteMock: vi.fn() }));
vi.mock("@railor/core/adapters", () => ({ getAdapter: () => ({ getQuote: quoteMock }) }));

it("encrypts local credentials and rejects tampering or another key", () => {
  const sealed = sealVault({ circle: { apiKey: "test-fixture-not-real" } }, "a".repeat(64));
  expect(sealed).not.toContain("test-fixture-not-real"); expect(openVault(sealed, "a".repeat(64)).circle?.apiKey).toBe("test-fixture-not-real");
  expect(() => openVault(sealed, "b".repeat(64))).toThrow();
});
it("rejects insecure origins, credentials and redirect-prone paths", () => {
  expect(() => validateCloudOrigin("http://example.com")).toThrow(); expect(() => validateCloudOrigin("https://secret@example.com")).toThrow(); expect(() => validateCloudOrigin("https://example.com/path")).toThrow(); expect(validateCloudOrigin("http://127.0.0.1:3200", true)).toBe("http://127.0.0.1:3200");
});
describe("sandbox runtime", () => {
  it("uses the encrypted local vault for a quote without uploading credentials", async () => {
    const dir = await mkdtemp(join(tmpdir(), "railor-connector-quote-test-"));
    try {
      const token = "test-token"; const installationId = crypto.randomUUID(); const key = "a".repeat(64);
      const vaultPath = join(dir, "vault.json"); await writeFile(vaultPath, sealVault({ circle: { apiKey: "local-only-fixture-secret" } }, key));
      const command = ConnectorCommand.parse({ version: 1, id: crypto.randomUUID(), installationId, organizationId: crypto.randomUUID(), decisionId: crypto.randomUUID(), decisionHash: "a".repeat(64), provider: "circle", operation: "get_quote", idempotencyKey: "quote-command", expiresAt: "2099-01-01T00:00:00Z", intent: { sourceEntityCountry: "IN", destinationCountry: "AE", destinationCurrency: "AED", sourceAsset: "USDC", amount: 1000 } });
      const observedAt = new Date().toISOString();
      quoteMock.mockResolvedValue({ providerSlug: "circle", sourceAsset: "USDC", destinationCurrency: "AED", amount: 1000, costPartial: true, quoteType: "live", accountContext: "customer_connected", verificationType: "provider_reported", observedAt, quotedAt: observedAt });
      const sent: string[] = [];
      const fetcher = (async (_url: unknown, init: RequestInit) => { sent.push(String(init.body)); const body = JSON.parse(String(init.body)); return Response.json({ data: body.action === "poll" ? { command, signature: signConnectorCommand(command, connectorTokenHash(token)) } : { status: "succeeded" } }); }) as typeof fetch;
      expect((await runConnectorOnce({ origin: "https://example.test", token, installationId, journalDir: join(dir, "journal"), vaultPath, vaultKey: key }, fetcher)).status).toBe("succeeded");
      expect(quoteMock.mock.calls.at(-1)?.[0]).toEqual({ apiKey: "local-only-fixture-secret" });
      expect(sent.join("")).not.toContain("local-only-fixture-secret"); expect(sent.join("")).toContain('"code":"quoted"');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("journals the receipt and retries delivery without replaying execution", async () => {
    const dir = await mkdtemp(join(tmpdir(), "railor-connector-test-"));
    try {
      const token = "test-token"; const installationId = crypto.randomUUID();
      const command = ConnectorCommand.parse({ version: 1, id: crypto.randomUUID(), installationId, organizationId: crypto.randomUUID(), decisionId: crypto.randomUUID(), decisionHash: "a".repeat(64), provider: "circle", operation: "simulate_transfer", idempotencyKey: "unique-receipt", expiresAt: "2099-01-01T00:00:00Z", intent: { sourceEntityCountry: "IN", destinationCountry: "AE", amount: 1000 } });
      let polls = 0; let receipts = 0;
      const fetcher = (async (_url: unknown, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        if (body.action === "receipt") { receipts++; if (receipts === 1) throw new Error("network interrupted"); return Response.json({ data: { status: "succeeded" } }); }
        polls++; return Response.json({ data: polls === 1 ? { command, signature: signConnectorCommand(command, connectorTokenHash(token)) } : null });
      }) as typeof fetch;
      const config = { origin: "https://example.test", token, installationId, journalDir: dir };
      await expect(runConnectorOnce(config, fetcher)).rejects.toThrow("network interrupted");
      expect(await runConnectorOnce(config, fetcher)).toEqual({ status: "idle" }); expect(receipts).toBe(2); expect(polls).toBe(2);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
