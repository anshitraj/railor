/**
 * Structured extraction of provider capabilities from already-fetched
 * documentation. Mirrors country-research/extract.ts exactly in discipline:
 * the model never answers from memory, only from the source text handed to
 * it, and every row it returns must carry a verbatim `quote` plus the URLs
 * that quote came from. ingest.ts then drops any citation that wasn't
 * actually supplied, so a fabricated source removes the row rather than
 * decorating it.
 *
 * Reuses COUNTRY_RESEARCH_CONFIG's model/timeout/char-budget knobs rather
 * than inventing a parallel set — the two pipelines have the same shape of
 * cost and the same quality-over-latency tradeoff, so a second copy of those
 * env vars would just be two things to keep in sync.
 */
import { GoogleGenAI, Type, type Schema } from "@google/genai";
import {
  ExtractedAsset,
  ExtractedFee,
  ExtractedProduct,
  ExtractedRequirement,
  ExtractedCorridor,
  ExtractedEntityEligibility,
  type ProviderExtraction,
} from "@railor/types";
import { COUNTRY_RESEARCH_CONFIG } from "../country-research/config.js";

const DEFAULT_MODEL = "gemini-3.1-pro-preview";

export class ProviderExtractionError extends Error {}

let client: GoogleGenAI | undefined;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new ProviderExtractionError("GEMINI_API_KEY is not set — provider research cannot extract without it.");
  client ??= new GoogleGenAI({ apiKey, httpOptions: { timeout: COUNTRY_RESEARCH_CONFIG.extractionTimeoutMs } });
  return client;
}

export interface ProviderSource {
  url: string;
  title: string | null;
  content: string;
}

const SYSTEM_PROMPT = `You are extracting structured payment-capability facts about ONE payment/stablecoin provider from a fixed set of supplied source documents (the provider's own documentation and public pages).

Rules, all mandatory:
- Use ONLY information present in the supplied sources. Never use your own training-data memory as a source of truth, even if you are confident.
- Do not invent, infer beyond what the text supports, or fill in "typical" values. A provider you recognize is still only as documented here.
- Every row you return MUST include a verbatim \`quote\`: an exact span copied from a supplied source that establishes that row. If you cannot quote it, do not return the row.
- Every row's \`sourceUrls\` must contain only URLs from the supplied sources.
- If the sources establish nothing for a category, return an empty array. An empty array is a correct, valuable answer. Padding it is a failure.
- Country codes must be ISO 3166-1 alpha-2 and currency codes ISO 4217. If a source names a country/currency you cannot map to a code with certainty, omit that row rather than guessing a code.
- \`entityCountry\` on a CORRIDOR is where the SENDING BUSINESS is incorporated. Set it ONLY if the source explicitly ties that corridor to the sender's jurisdiction. Most coverage tables do not — leave it null there.
- \`entityEligibility\` is a SEPARATE list and is important. Populate it whenever a source states which countries a customer can REGISTER, SIGN UP, ONBOARD or OPEN AN ACCOUNT from — e.g. "available to businesses registered in", "you can open an account if your company is incorporated in", "supported countries for account opening", a signup country dropdown, or a licensing/coverage list describing where the provider onboards customers. This is about WHO MAY BECOME A CUSTOMER, not where money can be sent. One entry per country.
- \`stablecoinMode\`: use "unknown" unless the source actually addresses stablecoins. A page that never mentions stablecoins does NOT prove "fiat_only"; only an explicit statement that crypto/stablecoins are unsupported does.
- For fees, only fill percentBps/fixedAmount when the source states a number. Prose-only pricing keeps those null and survives as \`summary\`.
- Distinguish "the provider supports X" from "the provider mentions X". Marketing adjacency, partner logos, and blog speculation are not capability facts.`;

/* -------------------------------------------------------------------------- */
/* Gemini response schema — hand-built (the SDK has no zod-schema helper).     */
/* ProviderExtraction in @railor/types stays the source of truth; this only    */
/* shapes what Gemini is asked to return.                                      */
/* -------------------------------------------------------------------------- */

const str = (nullable = false): Schema => ({ type: Type.STRING, nullable });
const int = (nullable = false): Schema => ({ type: Type.INTEGER, nullable });
const num = (nullable = false): Schema => ({ type: Type.NUMBER, nullable });
const bool = (nullable = false): Schema => ({ type: Type.BOOLEAN, nullable });
const urls: Schema = { type: Type.ARRAY, items: { type: Type.STRING } };

const PRODUCT_ENUM = [
  "on_ramp", "off_ramp", "payout", "collection", "virtual_account",
  "card_issuing", "card_funding", "wallet", "treasury", "kyc_kyb",
];

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  required: ["corridors", "entityEligibility", "assets", "fees", "requirements", "products", "hasPublicApi", "hasSandbox", "notes"],
  properties: {
    corridors: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["country", "currency", "entityCountry", "product", "customerType", "stablecoinMode", "settlementEstimate", "quote", "sourceUrls"],
        properties: {
          country: str(),
          currency: str(true),
          entityCountry: str(true),
          product: { type: Type.STRING, enum: PRODUCT_ENUM },
          customerType: { type: Type.STRING, enum: ["business", "individual"], nullable: true },
          stablecoinMode: {
            type: Type.STRING,
            enum: ["direct_stablecoin", "stablecoin_funded_fiat", "fiat_only", "stablecoin_only", "hybrid", "unknown"],
          },
          settlementEstimate: str(true),
          quote: str(),
          sourceUrls: urls,
        },
      },
    },
    entityEligibility: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["entityCountry", "customerType", "product", "quote", "sourceUrls"],
        properties: {
          entityCountry: str(),
          customerType: { type: Type.STRING, enum: ["business", "individual"], nullable: true },
          product: { type: Type.STRING, enum: PRODUCT_ENUM, nullable: true },
          quote: str(),
          sourceUrls: urls,
        },
      },
    },
    assets: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["symbol", "network", "product", "quote", "sourceUrls"],
        properties: {
          symbol: str(),
          network: str(true),
          product: { type: Type.STRING, enum: PRODUCT_ENUM },
          quote: str(),
          sourceUrls: urls,
        },
      },
    },
    fees: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["product", "destinationCurrency", "percentBps", "fixedAmount", "fixedCurrency", "fxSpreadBps", "summary", "quote", "sourceUrls"],
        properties: {
          product: { type: Type.STRING, enum: PRODUCT_ENUM },
          destinationCurrency: str(true),
          percentBps: int(true),
          fixedAmount: num(true),
          fixedCurrency: str(true),
          fxSpreadBps: int(true),
          summary: str(),
          quote: str(),
          sourceUrls: urls,
        },
      },
    },
    requirements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["label", "kind", "mandatory", "appliesToCountry", "quote", "sourceUrls"],
        properties: {
          label: str(),
          kind: { type: Type.STRING, enum: ["kyc", "kyb", "technical"] },
          mandatory: bool(),
          appliesToCountry: str(true),
          quote: str(),
          sourceUrls: urls,
        },
      },
    },
    products: { type: Type.ARRAY, items: { type: Type.STRING, enum: PRODUCT_ENUM } },
    hasPublicApi: bool(true),
    hasSandbox: bool(true),
    notes: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
};

function renderSources(providerName: string, sources: ProviderSource[]): string {
  let budget = COUNTRY_RESEARCH_CONFIG.maxCharsToLlm;
  const parts: string[] = [`Provider: ${providerName}\n\nSources:`];

  for (const source of sources) {
    if (budget <= 0) break;
    const header = `\n\n### Source: ${source.title ?? source.url}\nURL: ${source.url}\n---`;
    const remaining = Math.max(0, budget - header.length);
    const body = source.content.slice(0, remaining);
    parts.push(`${header}\n${body}`);
    budget -= header.length + body.length;
  }
  return parts.join("");
}

const REFUSAL_FINISH_REASONS = new Set(["SAFETY", "RECITATION", "LANGUAGE", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII"]);

export async function extractProviderCapabilities(
  providerName: string,
  sources: ProviderSource[],
): Promise<{ extraction: ProviderExtraction; invalidRows: number }> {
  if (sources.length === 0) {
    throw new ProviderExtractionError("No source content supplied — refusing to extract from nothing.");
  }

  const ai = getClient();
  const model = process.env.COUNTRY_RESEARCH_LLM_MODEL?.trim() || DEFAULT_MODEL;

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: renderSources(providerName, sources) }] }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
    },
  });

  if (response.promptFeedback?.blockReason) {
    throw new ProviderExtractionError(`Gemini blocked the prompt: ${response.promptFeedback.blockReason}`);
  }
  const finishReason = response.candidates?.[0]?.finishReason as string | undefined;
  if (finishReason && REFUSAL_FINISH_REASONS.has(finishReason)) {
    throw new ProviderExtractionError(`Gemini declined the extraction (finishReason: ${finishReason}).`);
  }
  if (finishReason && finishReason !== "STOP") {
    throw new ProviderExtractionError(`Gemini extraction did not finish cleanly (finishReason: ${finishReason}).`);
  }
  if (!response.text) throw new ProviderExtractionError("Gemini returned no text content to parse.");

  let raw: unknown;
  try {
    raw = JSON.parse(response.text);
  } catch (error) {
    throw new ProviderExtractionError(`Gemini's response wasn't valid JSON: ${(error as Error).message}`);
  }

  return validateRowwise(raw);
}

/**
 * Validates each extracted row on its own instead of the whole payload at
 * once. A single malformed field — one fee quoting "PHP/USD" where an ISO 4217
 * code belongs — used to fail `ProviderExtraction.safeParse` and discard every
 * other correct row for that provider. Same principle as firecrawlExtract's
 * per-URL try/catch: one bad item never drops the rest.
 */
export function validateRowwise(raw: unknown): { extraction: ProviderExtraction; invalidRows: number } {
  const root = (raw ?? {}) as Record<string, unknown>;
  let invalidRows = 0;

  const keep = <T>(items: unknown, schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }): T[] => {
    if (!Array.isArray(items)) return [];
    const out: T[] = [];
    for (const item of items) {
      const parsed = schema.safeParse(item);
      if (parsed.success && parsed.data !== undefined) out.push(parsed.data);
      else invalidRows += 1;
    }
    return out;
  };

  const extraction: ProviderExtraction = {
    corridors: keep(root.corridors, ExtractedCorridor),
    entityEligibility: keep(root.entityEligibility, ExtractedEntityEligibility),
    assets: keep(root.assets, ExtractedAsset),
    fees: keep(root.fees, ExtractedFee),
    requirements: keep(root.requirements, ExtractedRequirement),
    products: keep(root.products, ExtractedProduct),
    hasPublicApi: typeof root.hasPublicApi === "boolean" ? root.hasPublicApi : null,
    hasSandbox: typeof root.hasSandbox === "boolean" ? root.hasSandbox : null,
    notes: Array.isArray(root.notes) ? root.notes.filter((n): n is string => typeof n === "string") : [],
  };

  return { extraction, invalidRows };
}
