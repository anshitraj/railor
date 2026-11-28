import { describe, expect, it } from "vitest";
import { AGENT_COMMANDS, findCommand, matchCommands, needsPaymentFacts, smallTalk } from "./agent-commands";
import { parseAgentHistory } from "./agent-history";

describe("agent slash commands", () => {
  it("filters the menu by what's typed after the slash", () => {
    expect(matchCommands("/").length).toBe(AGENT_COMMANDS.length);
    expect(matchCommands("/fa").map((command) => command.name)).toEqual(["/fastest"]);
    expect(matchCommands("/cheapest please")).toEqual([]);
    expect(matchCommands("send /x")).toEqual([]);
  });

  it("tells a command, an unknown command and plain text apart", () => {
    expect(findCommand("/cheapest")).toMatchObject({ kind: "preference", value: "cheapest" });
    expect(findCommand("/CHEAPEST now")).toMatchObject({ value: "cheapest" });
    expect(findCommand("/nope")).toBeNull();
    expect(findCommand("send 100 USD")).toBeUndefined();
  });
});

describe("agent small talk", () => {
  it("greets instead of opening a blank payment form", () => {
    expect(smallTalk("hi")?.title).toContain("Where’s the money going");
    expect(smallTalk("Hello!")?.chips?.length).toBeGreaterThan(0);
    expect(smallTalk("help")?.title).toBe("Here’s what I can do");
    expect(smallTalk("thanks")?.title).toBe("Anytime.");
  });

  it("leaves real requests alone", () => {
    expect(smallTalk("hi, send 500 USD to India")).toBeNull();
    expect(smallTalk("Send $5,000 to a freelancer in India")).toBeNull();
  });

  it("asks for payment facts, with examples to tap", () => {
    expect(needsPaymentFacts("What is the fastest?").title).toBe("Tell me about the payment first");
    expect(needsPaymentFacts("hey i want").title).toBe("Sure — tell me a bit more about the transfer");
    expect(needsPaymentFacts("hey i want").chips?.length).toBe(3);
    expect(needsPaymentFacts("blah").chips?.length).toBe(3);
  });
});

describe("saved chats", () => {
  const chat = (answer: object) => JSON.stringify([{ id: "a", title: "t", createdAt: 1, updatedAt: 1, messages: [{ id: 1, role: "agent", text: "", answer: { title: "x", lines: [], reasonCodes: [], ...answer } }], intent: null, preference: "balanced", policyId: "", product: "", method: "" }]);

  it("keeps chips and in-app links", () => {
    const [saved] = parseAgentHistory(chat({ chips: ["/cheapest"], links: [{ label: "Prices", href: "/app/prices?mode=stablecoin" }] }));
    expect(saved?.messages[0]?.answer).toMatchObject({ chips: ["/cheapest"], links: [{ href: "/app/prices?mode=stablecoin" }] });
  });

  it("drops a chat whose link points outside the app", () => {
    expect(parseAgentHistory(chat({ links: [{ label: "x", href: "https://example.com" }] }))).toEqual([]);
  });
});
