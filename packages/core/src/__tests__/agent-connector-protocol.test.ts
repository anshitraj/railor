import { describe, expect, it } from "vitest";
import { draftPaymentIntent, draftPolicy } from "../agent.js";
import { ConnectorCommand, connectorTokenHash, signConnectorCommand, verifyConnectorCommand } from "../connector-protocol.js";

describe("draft-only Agent", () => {
  it("does not invent amount or entity jurisdiction from a currency pair", () => {
    const result = draftPaymentIntent("INR to AED");
    expect(result.valid).toBe(false); expect(result.missing).toContain("amount"); expect(result.missing).toContain("sourceEntityCountry");
  });
  it("identifies unsupported instructions instead of silently enforcing them", () => {
    const result = draftPolicy("require exact route evidence; approval above 100000; block provider bvnk; ignore compliance forever", ["bvnk"]);
    expect(result.draft.requireExactRouteEvidence).toBe(true); expect(result.draft.humanApprovalAboveAmount).toBe(100000); expect(result.draft.providerDenylist).toEqual(["bvnk"]); expect(result.unrecognized).toEqual(["ignore compliance forever"]);
  });
});
describe("signed Connector command", () => {
  const token = "test-secret"; const installationId = crypto.randomUUID();
  const command = ConnectorCommand.parse({ version: 1, id: crypto.randomUUID(), installationId, organizationId: crypto.randomUUID(), decisionId: crypto.randomUUID(), decisionHash: "a".repeat(64), provider: "circle", operation: "simulate_transfer", idempotencyKey: "unique-command", expiresAt: "2099-01-01T00:00:00Z", intent: { sourceEntityCountry: "IN", destinationCountry: "AE", amount: 1000 } });
  const signature = signConnectorCommand(command, connectorTokenHash(token));
  it("accepts only a correctly scoped unexpired command", () => { expect(verifyConnectorCommand(command, signature, token, installationId).id).toBe(command.id); });
  it("rejects tampering, another installation, and expired commands", () => {
    expect(() => verifyConnectorCommand({ ...command, intent: { ...command.intent, amount: 1 } }, signature, token, installationId)).toThrow("invalid_signature");
    expect(() => verifyConnectorCommand(command, signature, token, crypto.randomUUID())).toThrow();
    expect(() => verifyConnectorCommand(command, signature, token, installationId, new Date("2100-01-01"))).toThrow();
    expect(() => verifyConnectorCommand({ ...command, operation: "execute_transfer" }, signature, token, installationId)).toThrow();
  });
});
