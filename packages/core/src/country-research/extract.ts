/**
 * Structured extraction — runs only after Tavily/Firecrawl have already
 * retrieved real source content. This is not "ask the model what it
 * knows"; the model never answers from memory, only from the source text
 * handed to it in the prompt.
 *
 * Uses Gemini (@google/genai) — the same provider llm.ts already uses for
 * query interpretation — rather than a new OpenAI integration, since
 * Railor already has a working, keyed Gemini setup and no OpenAI key.
 * Unlike llm.ts's Gemini use (optional, silently skipped without a key),
 * extraction here is this feature's core, not an enhancement — a missing
 * GEMINI_API_KEY is a hard failure, not a silent no-op.
 *
 * Deliberately a separate model knob from llm.ts's RAILOR_LLM_MODEL: query
 * interpretation is small, latency-sensitive, and runs on every public
 * search request, so Flash is the right tradeoff there. Extraction is rare
 * (five countries, at most every COUNTRY_RESEARCH_MIN_RECHECK_HOURS), reads
 * a much larger prompt, and quality matters more than latency — Pro is the
 * right tradeoff here. Sharing one env var would force the wrong choice on
 * one of the two.
 */
import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { CountryProfileExtraction } from "@railor/types";
import { COUNTRY_RESEARCH_CONFIG } from "./config.js";

const DEFAULT_MODEL = "gemini-3.1-pro-preview";

export class GeminiNotConfiguredError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not set — country research cannot extract structured data without it.");
  }
}

export class ExtractionRefusedError extends Error {}
export class ExtractionTruncatedError extends Error {}
export class ExtractionInvalidError extends Error {}

let client: GoogleGenAI | undefined;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new GeminiNotConfiguredError();
  client ??= new GoogleGenAI({ apiKey, httpOptions: { timeout: COUNTRY_RESEARCH_CONFIG.extractionTimeoutMs } });
  return client;
}

export interface ExtractionSource {
  url: string;
  title: string | null;
  category: string;
  content: string;
}

const SYSTEM_PROMPT = `You are extracting structured payment-infrastructure facts about a country from a fixed set of supplied sources.

Rules, all mandatory:
- Use only the information present in the supplied sources below. Do not use your own training-data memory as a source of truth.
- Do not invent, infer beyond what the text supports, or fill in "typical" values for missing information.
- If the sources do not establish an answer for a field, return null for a single value or an empty array for a list — never guess.
- Every non-null value must be attributable to at least one of the supplied source URLs; list those URLs in that field's sourceUrls.
- Separate stated fact from your own interpretation. If a source is ambiguous or only implies something, prefer null over a confident-sounding guess.
- Never claim legal or regulatory certainty a source does not itself establish. Regulatory status is often nuanced — reflect that nuance in the text rather than flattening it into a false yes/no.`;

/* -------------------------------------------------------------------------- */
/* Gemini response schema — hand-built, since the SDK has no zod-schema       */
/* helper (unlike OpenAI's zodResponseFormat). Mirrors CountryProfileExtraction */
/* field-for-field; the zod schema below stays the actual source of truth —   */
/* this only shapes what Gemini is asked to return.                          */
/* -------------------------------------------------------------------------- */

const sourcedText: Schema = {
  type: Type.OBJECT,
  properties: { value: { type: Type.STRING, nullable: true }, sourceUrls: { type: Type.ARRAY, items: { type: Type.STRING } } },
  required: ["value", "sourceUrls"],
};
const sourcedBoolean: Schema = {
  type: Type.OBJECT,
  properties: { value: { type: Type.BOOLEAN, nullable: true }, sourceUrls: { type: Type.ARRAY, items: { type: Type.STRING } } },
  required: ["value", "sourceUrls"],
};
const sourcedStringArray: Schema = {
  type: Type.OBJECT,
  properties: {
    value: { type: Type.ARRAY, items: { type: Type.STRING } },
    sourceUrls: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["value", "sourceUrls"],
};

const EXTRACTION_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    centralBankName: sourcedText,
    regulatorNames: sourcedStringArray,
    pspLicensingSummary: sourcedText,
    ibanSupported: sourcedBoolean,
    ibanNote: sourcedText,
    swiftSupported: sourcedBoolean,
    swiftNote: sourcedText,
    instantPaymentAvailable: sourcedBoolean,
    instantPaymentSystem: sourcedText,
    localPaymentRails: sourcedStringArray,
    bankAccountRequirements: sourcedStringArray,
    routingCodeType: sourcedText,
    routingCodeDescription: sourcedText,
    cryptoStatus: sourcedText,
    stablecoinStatus: sourcedText,
    kycRequirements: sourcedStringArray,
    kybRequirements: sourcedStringArray,
    amlRequirements: sourcedStringArray,
    crossBorderRestrictions: sourcedStringArray,
    supportedPayoutCurrencies: sourcedStringArray,
  },
};

function renderSources(countryName: string, sources: ExtractionSource[]): string {
  const maxChars = COUNTRY_RESEARCH_CONFIG.maxCharsToLlm;
  let budget = maxChars;
  const parts: string[] = [`Country: ${countryName}\n\nSources:`];

  for (const source of sources) {
    if (budget <= 0) break;
    const header = `\n\n### Source: ${source.title ?? source.url}\nURL: ${source.url}\nCategory: ${source.category}\n---`;
    const remaining = Math.max(0, budget - header.length);
    const body = source.content.slice(0, remaining);
    parts.push(`${header}\n${body}`);
    budget -= header.length + body.length;
  }

  return parts.join("");
}

const REFUSAL_FINISH_REASONS = new Set(["SAFETY", "RECITATION", "LANGUAGE", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII"]);

/**
 * Extracts a CountryProfileExtraction from already-fetched source content.
 * Every `sourceUrls` entry the model returns that isn't among the URLs
 * actually supplied gets dropped by the caller (see ingest.ts) — this
 * function trusts the model's citations only as far as validate() checks them.
 */
export async function extractCountryProfile(
  countryName: string,
  sources: ExtractionSource[],
): Promise<CountryProfileExtraction> {
  if (sources.length === 0) {
    throw new ExtractionInvalidError("No source content was supplied — refusing to extract from nothing.");
  }

  const ai = getClient();
  const model = process.env.COUNTRY_RESEARCH_LLM_MODEL?.trim() || DEFAULT_MODEL;

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: renderSources(countryName, sources) }] }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: EXTRACTION_RESPONSE_SCHEMA,
      temperature: 0,
    },
  });

  if (response.promptFeedback?.blockReason) {
    throw new ExtractionRefusedError(`Gemini blocked the prompt: ${response.promptFeedback.blockReason}`);
  }

  const candidate = response.candidates?.[0];
  const finishReason = candidate?.finishReason as string | undefined;
  if (finishReason && REFUSAL_FINISH_REASONS.has(finishReason)) {
    throw new ExtractionRefusedError(`Gemini declined the extraction (finishReason: ${finishReason}).`);
  }
  if (finishReason && finishReason !== "STOP") {
    throw new ExtractionTruncatedError(`Gemini extraction did not finish cleanly (finishReason: ${finishReason}).`);
  }

  if (!response.text) {
    throw new ExtractionInvalidError("Gemini returned no text content to parse.");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(response.text);
  } catch (error) {
    throw new ExtractionInvalidError(`Gemini's response wasn't valid JSON: ${(error as Error).message}`);
  }

  const parsed = CountryProfileExtraction.safeParse(raw);
  if (!parsed.success) {
    throw new ExtractionInvalidError(`Extraction result failed schema validation: ${parsed.error.message}`);
  }
  return parsed.data;
}
