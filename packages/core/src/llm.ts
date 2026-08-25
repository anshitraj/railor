/**
 * Optional LLM adapter — proposes values only for the fields the
 * deterministic rules in interpret.ts left blank. It never runs against a
 * field the rules already found, and every value it proposes is constrained
 * to Railor's own known vocabulary (country codes, asset symbols, currency
 * codes) so it can suggest "AE", never a code nothing downstream recognizes.
 *
 * Unset GEMINI_API_KEY = this module is never reached; interpretRules alone
 * is the full, correct interpreter (see interpret.ts).
 */
import { GoogleGenAI, Type } from "@google/genai";
import type { CorridorQuery, Interpretation, QueryToken } from "@railor/types";
import { ASSET_TERMS, COUNTRY_TERMS, CURRENCY_TERMS } from "./vocab.js";

const DEFAULT_MODEL = "gemini-flash-latest";

const MISSING_FIELDS = ["entityCountry", "sourceAsset", "destinationCountry", "destinationCurrency"] as const;
type FillableField = (typeof MISSING_FIELDS)[number];

const FIELD_LABEL: Record<FillableField, string> = {
  entityCountry: "Entity",
  sourceAsset: "Asset",
  destinationCountry: "Destination",
  destinationCurrency: "Destination currency",
};

let client: GoogleGenAI | null | undefined;

function getClient(): GoogleGenAI | null {
  if (client !== undefined) return client;
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  return client;
}

function countryEnum() {
  return COUNTRY_TERMS.map((c) => c.code);
}

/**
 * Asks the model to fill `base.missing`, constrained to enums built from the
 * same vocab the rule engine uses, then merges anything it confidently
 * returns in as `derivation: "model"` tokens. Any failure — no key, a network
 * error, a malformed response, a value outside the enum — falls back to
 * returning `base` untouched rather than surfacing an error to the caller.
 */
export async function fillMissingFields(input: string, base: Interpretation): Promise<Interpretation> {
  const ai = getClient();
  const targets = MISSING_FIELDS.filter((f) => base.missing.includes(f));
  if (!ai || targets.length === 0) return base;

  const properties: Record<string, { type: Type; enum: string[]; description: string }> = {};
  if (targets.includes("entityCountry")) {
    properties.entityCountry = {
      type: Type.STRING,
      enum: countryEnum(),
      description: "Where the customer's company is incorporated.",
    };
  }
  if (targets.includes("destinationCountry")) {
    properties.destinationCountry = {
      type: Type.STRING,
      enum: countryEnum(),
      description: "Where the money ends up.",
    };
  }
  if (targets.includes("sourceAsset")) {
    properties.sourceAsset = {
      type: Type.STRING,
      enum: ASSET_TERMS.map((a) => a.symbol),
      description: "Stablecoin being sent.",
    };
  }
  if (targets.includes("destinationCurrency")) {
    properties.destinationCurrency = {
      type: Type.STRING,
      enum: CURRENCY_TERMS.map((c) => c.code),
      description: "Fiat currency the recipient is paid in.",
    };
  }

  let parsed: Partial<Record<FillableField, string>>;
  try {
    const model = process.env.RAILOR_LLM_MODEL?.trim() || DEFAULT_MODEL;
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                `A payments-infrastructure search engine received this query: "${input}"\n\n` +
                `Already understood, do not repeat or contradict: ${JSON.stringify(base.query)}\n\n` +
                `Propose values only for fields you can genuinely infer from the sentence and its ` +
                `evident intent. Omit any field you are not reasonably confident about rather than guessing.`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: { type: Type.OBJECT, properties },
        temperature: 0,
      },
    });
    parsed = response.text ? JSON.parse(response.text) : {};
  } catch (error) {
    console.error("[llm] Gemini call failed, falling back to rules-only interpretation", error);
    return base;
  }

  const query: CorridorQuery = { ...base.query };
  const tokens: QueryToken[] = [...base.tokens];
  let contributed = false;

  const accept = (field: FillableField, validValues: string[]) => {
    if (query[field]) return;
    const value = parsed[field];
    if (!value || !validValues.includes(value)) return;
    query[field] = value;
    tokens.push({
      field,
      value,
      label: `${FIELD_LABEL[field]}: ${value}`,
      confidence: 0.7,
      derivation: "model",
    });
    contributed = true;
  };

  if (targets.includes("entityCountry")) accept("entityCountry", countryEnum());
  if (targets.includes("destinationCountry")) accept("destinationCountry", countryEnum());
  if (targets.includes("sourceAsset")) accept("sourceAsset", ASSET_TERMS.map((a) => a.symbol));
  if (targets.includes("destinationCurrency")) accept("destinationCurrency", CURRENCY_TERMS.map((c) => c.code));

  if (!contributed) return base;

  const missing = MISSING_FIELDS.filter((f) => !query[f]);
  return { ...base, query, tokens, missing, interpreter: "rules+model" };
}
