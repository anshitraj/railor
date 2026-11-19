import type { RankingPreset } from "@railor/types";
import type { AgentAnswer } from "./agent-presentation";

/**
 * Slash commands and small talk for the Agent chat. All of this runs in the
 * browser: commands change how the existing comparison is ranked or explained,
 * or open a page. None of them invents a price, a route or a decision.
 */
export type AgentCommand =
  | { name: string; hint: string; kind: "preference"; value: RankingPreset }
  | { name: string; hint: string; kind: "ask"; question: string }
  | { name: string; hint: string; kind: "link"; href: string }
  | { name: string; hint: string; kind: "edit" | "new" | "help" };

export const AGENT_COMMANDS: AgentCommand[] = [
  { name: "/cheapest", hint: "Rank by lowest total cost", kind: "preference", value: "cheapest" },
  { name: "/fastest", hint: "Rank by delivery time", kind: "preference", value: "fastest" },
  { name: "/reliable", hint: "Rank by reliability", kind: "preference", value: "most_reliable" },
  { name: "/arrives", hint: "Rank by what reaches the recipient", kind: "preference", value: "max_recipient_amount" },
  { name: "/balanced", hint: "Balance cost, speed and reliability", kind: "preference", value: "balanced" },
  { name: "/why", hint: "Explain the recommendation", kind: "ask", question: "Why is there no best option?" },
  { name: "/missing", hint: "What would make this comparison complete", kind: "ask", question: "What information is missing?" },
  { name: "/policy", hint: "How your company rules affected it", kind: "ask", question: "How did my policy affect this?" },
  { name: "/edit", hint: "Edit the request details", kind: "edit" },
  { name: "/prices", hint: "Open the price calculator", kind: "link", href: "/app/prices" },
  { name: "/stablecoin", hint: "USDT or USDC to INR on Indian exchanges", kind: "link", href: "/app/prices?mode=stablecoin" },
  { name: "/new", hint: "Start a new chat", kind: "new" },
  { name: "/help", hint: "What the agent can do", kind: "help" },
];

/** Commands whose name starts with what's typed after "/". */
export function matchCommands(text: string): AgentCommand[] {
  if (!text.startsWith("/") || /\s/.test(text.trim())) return [];
  const query = text.trim().toLowerCase();
  return AGENT_COMMANDS.filter((command) => command.name.startsWith(query));
}

export function findCommand(text: string): AgentCommand | null | undefined {
  const name = text.trim().toLowerCase().split(/\s+/)[0] ?? "";
  if (!name.startsWith("/")) return undefined;
  return AGENT_COMMANDS.find((command) => command.name === name) ?? null;
}

export const EXAMPLE_PROMPTS = [
  "Send $5,000 from our US company to a freelancer in India",
  "Pay 2,000 EUR to a UK supplier from our German company",
  "Send 100k USDC on Solana to a Brazilian supplier in BRL via PIX",
];

export const HELP_ANSWER: AgentAnswer = {
  title: "Here’s what I can do",
  lines: [
    "Describe a payment in your own words: the amount, the currency, who sends it and where it goes. I’ll read it into a request you can check, then compare providers with the evidence behind each one.",
    "After a comparison, ask why a provider ranks where it does, what’s missing, or switch the ranking with a command.",
    "Type / to see every command.",
  ],
  reasonCodes: [],
  chips: [...EXAMPLE_PROMPTS.slice(0, 2), "/cheapest", "/stablecoin"],
};

/** A friendly reply for greetings, thanks and "what can you do", instead of an empty payment form. */
export function smallTalk(text: string): AgentAnswer | null {
  const value = text.trim().toLowerCase().replace(/[!.?]+$/, "");
  if (/^(?:hi|hello|hey|hiya|yo|good (?:morning|afternoon|evening)|namaste)(?: there| railor)?$/.test(value)) {
    return { title: "Hi! Where’s the money going?", lines: ["Tell me the amount, the currency and who receives it, and I’ll compare the providers that can do it."], reasonCodes: [], chips: EXAMPLE_PROMPTS };
  }
  if (/^(?:thanks|thank you|thx|cheers|great|ok|okay|cool)$/.test(value)) {
    return { title: "Anytime.", lines: ["Ask a follow-up, or describe another payment."], reasonCodes: [], chips: ["/new", "/prices"] };
  }
  if (/^(?:help|what can you do|how does this work|commands|menu)$/.test(value)) return HELP_ANSWER;
  return null;
}

/** When the text had no payment facts at all, ask for them instead of showing a blank request. */
export function needsPaymentFacts(question: string): AgentAnswer {
  const followup = /^(?:which|what|who|why|how)\b/i.test(question.trim());
  return {
    title: followup ? "Tell me about the payment first" : "I couldn’t find a payment in that",
    lines: [followup
      ? "I answer questions about a comparison once there is one. Describe the payment: the amount, the currency and where it goes."
      : "Include the amount, the currency and where it’s going. For example:"],
    reasonCodes: [],
    chips: EXAMPLE_PROMPTS,
  };
}
