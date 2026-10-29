import { z } from "zod";
import type { AgentAnswer } from "./agent-presentation";
import type { IntentDraft } from "../components/app/intent-builder";
import type { RankingPreset } from "@railor/types";

export const CHAT_HISTORY_LIMIT = 7;
export const CHAT_MESSAGE_LIMIT = 200;
export interface ChatMessage { id: number; role: "user" | "agent"; text: string; answer?: AgentAnswer }
export interface AgentChat {
  id: string; title: string; createdAt: number; updatedAt: number; messages: ChatMessage[];
  intent: IntentDraft | null; preference: RankingPreset; policyId: string; product: string; method: string;
}

const short = z.string().max(160);
const Intent = z.object({
  sourceKind: z.enum(["fiat", "asset"]), sourceEntityCountry: short,
  sourceEntityType: z.enum(["business", "individual"]), beneficiaryType: z.enum(["business", "individual"]),
  sourceCurrency: short, sourceAsset: short, sourceNetwork: short, destinationCountry: short,
  destinationCurrency: short, endpointType: short, namedRail: short, amount: z.number().finite().optional(),
});
const Answer = z.object({ title: z.string().max(500), lines: z.array(z.string().max(10000)).max(40), reasonCodes: z.array(short).max(100), providerSlug: short.optional() });
const Chat = z.object({
  id: short.min(1), title: short.min(1), createdAt: z.number().int().nonnegative(), updatedAt: z.number().int().nonnegative(),
  messages: z.array(z.object({ id: z.number().int().nonnegative(), role: z.enum(["user", "agent"]), text: z.string().max(20000), answer: Answer.optional() })).min(1).max(CHAT_MESSAGE_LIMIT),
  intent: Intent.nullable(), preference: z.enum(["balanced", "cheapest", "fastest", "most_reliable", "max_recipient_amount"]),
  policyId: short, product: short, method: short,
});

export function agentHistoryKey(workspaceId: string, userId: string) {
  return `railor.agent.chats.v1.${encodeURIComponent(JSON.stringify([workspaceId, userId]))}`;
}
export function chatTitle(messages: ChatMessage[]) {
  return (messages.find((message) => message.role === "user")?.text.replace(/\s+/g, " ").trim() || "New conversation").slice(0, 70);
}
export function upsertAgentChat(history: AgentChat[], chat: AgentChat): AgentChat[] {
  return [chat, ...history.filter((item) => item.id !== chat.id)].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, CHAT_HISTORY_LIMIT);
}
/** Saved chats contain text and editable route inputs, never executable quotes or cached policy verdicts. */
export function parseAgentHistory(raw: string | null): AgentChat[] {
  if (!raw || raw.length > 3_000_000) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const valid = data.flatMap((item) => { const result = Chat.safeParse(item); return result.success ? [result.data as AgentChat] : []; });
    const unique = new Map<string, AgentChat>();
    valid.sort((a, b) => b.updatedAt - a.updatedAt).forEach((chat) => { if (!unique.has(chat.id)) unique.set(chat.id, chat); });
    return [...unique.values()].slice(0, CHAT_HISTORY_LIMIT);
  } catch { return []; }
}
