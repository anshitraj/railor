import { describe, expect, it } from "vitest";
import { agentHistoryKey, chatTitle, parseAgentHistory, upsertAgentChat, type AgentChat } from "./agent-history";

const chat = (id: string, updatedAt = 1): AgentChat => ({
  id, title: `Route ${id}`, createdAt: 1, updatedAt,
  messages: [{ id: 1, role: "user", text: `Compare route ${id}` }],
  intent: null, preference: "balanced", policyId: "policy-1", product: "", method: "",
});

describe("agent conversation history", () => {
  it("keeps only the latest seven chats and replaces the matching conversation", () => {
    const history = Array.from({ length: 10 }, (_, index) => chat(String(index), index + 1));
    const next = upsertAgentChat(history, { ...chat("3", 20), title: "Updated conversation" });
    expect(next.map((item) => item.id)).toEqual(["3", "9", "8", "7", "6", "5", "4"]);
    expect(next[0]?.title).toBe("Updated conversation");
  });

  it("isolates history by both workspace and signed-in user", () => {
    expect(agentHistoryKey("org-1", "user-1")).not.toBe(agentHistoryKey("org-2", "user-1"));
    expect(agentHistoryKey("org-1", "user-1")).not.toBe(agentHistoryKey("org-1", "user-2"));
    expect(agentHistoryKey("a.b", "c")).not.toBe(agentHistoryKey("a", "b.c"));
  });

  it("deduplicates saved chats, caps retention, and skips malformed entries", () => {
    const stored = [...Array.from({ length: 10 }, (_, index) => chat(String(index), index + 1)), chat("3", 20), { id: "bad" }];
    expect(parseAgentHistory(JSON.stringify(stored)).map((item) => item.id)).toEqual(["3", "9", "8", "7", "6", "5", "4"]);
    expect(parseAgentHistory("{broken")).toEqual([]);
    expect(parseAgentHistory(null)).toEqual([]);
    expect(parseAgentHistory(JSON.stringify({ chats: stored }))).toEqual([]);
  });

  it("restores explanations and editable inputs without reviving quotes or policy verdicts", () => {
    const saved = { ...chat("route"), preview: { bestCandidate: { quoteId: "expired" } },
      messages: [{ id: 1, role: "agent", text: "", answer: { title: "Why this provider?", lines: ["More evidence is needed."], reasonCodes: ["missing_quote"], providerSlug: "wise" } }],
      intent: { sourceKind: "fiat", sourceEntityCountry: "SG", sourceEntityType: "business", beneficiaryType: "business",
        sourceCurrency: "USD", sourceAsset: "", sourceNetwork: "", destinationCountry: "DE", destinationCurrency: "EUR",
        endpointType: "", namedRail: "", amount: 1000, quote: { rate: 1 }, policyVerdict: "pass" },
    };
    const restored = parseAgentHistory(JSON.stringify([saved]))[0];
    expect(restored?.messages[0]?.answer?.reasonCodes).toEqual(["missing_quote"]);
    expect(restored?.intent?.amount).toBe(1000);
    expect(restored).not.toHaveProperty("preview");
    expect(restored?.intent).not.toHaveProperty("quote");
    expect(restored?.intent).not.toHaveProperty("policyVerdict");
  });

  it("uses the first user message as a compact title", () => {
    expect(chatTitle([{ id: 1, role: "user", text: "  Send\n1000 USD   to Mexico  " }])).toBe("Send 1000 USD to Mexico");
    expect(chatTitle([{ id: 1, role: "user", text: "x".repeat(200) }])).toHaveLength(70);
  });
});
