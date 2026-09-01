/**
 * Natural language → structured corridor query.
 *
 * Deterministic first: a lexicon + positional rules cover the phrasings
 * founders actually type ("Indian company sending USDC to a UAE supplier who
 * receives AED"). An optional model adapter (see `llm.ts`) may *fill fields the
 * rules left empty* — it can never overwrite something the user literally
 * typed, and anything it contributes is labelled `derivation: "model"`.
 *
 * The output is not an answer, it is a proposal: the UI renders every token as
 * an editable chip so correcting Railor costs one click.
 */
import type { CorridorQuery, Interpretation, QueryToken } from "@railor/types";
import {
  ASSET_TERMS,
  BUSINESS_TERMS,
  COUNTRY_TERMS,
  CURRENCY_TERMS,
  DESTINATION_MARKERS,
  INDIVIDUAL_TERMS,
  METHOD_TERMS,
  NAMED_RAIL_TERMS,
  NETWORK_TERMS,
  ORIGIN_MARKERS,
  PRODUCT_TERMS,
  REGION_TERMS,
  SEPA_RAIL_COUNTRIES,
  SEPA_RAIL_TEMPLATES,
} from "./vocab.js";

interface Match {
  kind: "country" | "currency" | "asset" | "network" | "product" | "method" | "customerType" | "namedRail" | "sepaTemplate";
  value: string;
  index: number;
  text: string;
  /** Longer surface forms win when two terms overlap. */
  length: number;
}

const ENTITY_HINTS = [
  "company",
  "companies",
  "incorporated",
  "registered",
  "entity",
  "business",
  "startup",
  "ltd",
  "llc",
  "pvt",
  "based",
  "our",
];
const DESTINATION_HINTS = [
  "supplier",
  "beneficiary",
  "recipient",
  "receives",
  "receiving",
  "vendor",
  "partner",
  "customer",
  "contractor",
  "employee",
  "payout",
  "paid",
];

function findTerms(
  haystack: string,
  terms: string[],
  kind: Match["kind"],
  value: string,
): Match[] {
  const out: Match[] = [];
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const idx = haystack.indexOf(term, from);
      if (idx === -1) break;
      const before = idx === 0 ? " " : haystack[idx - 1]!;
      const after = idx + term.length >= haystack.length ? " " : haystack[idx + term.length]!;
      const boundary = /[^a-z0-9]/.test(before) && /[^a-z0-9]/.test(after);
      if (boundary) out.push({ kind, value, index: idx, text: term, length: term.length });
      from = idx + term.length;
    }
  }
  return out;
}

/**
 * Drops shorter matches that sit inside a longer one of the *same kind*
 * ("us" inside "russia", both countries). Different kinds are allowed to
 * overlap on purpose: "sepa instant" is a method match ("sepa") and a
 * sepaTemplate match ("sepa instant") at the same position, and both need
 * to survive — paymentMethod and namedRail are independent facts, not
 * alternatives competing for the same span of text.
 */
function dedupeOverlaps(matches: Match[]): Match[] {
  const sorted = [...matches].sort((a, b) => b.length - a.length);
  const kept: Match[] = [];
  for (const m of sorted) {
    const overlapping = kept.some(
      (k) => k.kind === m.kind && m.index < k.index + k.length && k.index < m.index + m.length,
    );
    if (!overlapping) kept.push(m);
  }
  return kept.sort((a, b) => a.index - b.index);
}

function nearestMarkerRole(text: string, index: number): "entity" | "destination" | null {
  const window = text.slice(Math.max(0, index - 40), index);
  let role: "entity" | "destination" | null = null;
  let best = -1;
  for (const marker of ORIGIN_MARKERS) {
    const at = window.lastIndexOf(marker);
    if (at > best) {
      best = at;
      role = "entity";
    }
  }
  for (const marker of DESTINATION_MARKERS) {
    const at = window.lastIndexOf(marker);
    if (at > best) {
      best = at;
      role = "destination";
    }
  }
  return role;
}

function hintRole(text: string, index: number, length: number): "entity" | "destination" | null {
  const around = text.slice(Math.max(0, index - 25), Math.min(text.length, index + length + 30));
  const entityHit = ENTITY_HINTS.some((h) => around.includes(h));
  const destHit = DESTINATION_HINTS.some((h) => around.includes(h));
  if (entityHit && !destHit) return "entity";
  if (destHit && !entityHit) return "destination";
  return null;
}

function parseAmount(text: string): { amount: number; currency?: string; matched: string } | null {
  const m = text.match(
    /(?:([$€£₹₦])\s?)?(\d[\d,.]*)\s?(k|m|thousand|million)?\s?(usd|eur|gbp|aed|inr|ngn|sgd|brl)?/i,
  );
  if (!m || !m[2]) return null;
  const raw = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(raw) || raw < 10) return null;
  const scale = m[3]?.toLowerCase();
  const amount = scale === "k" || scale === "thousand" ? raw * 1_000 : scale === "m" || scale === "million" ? raw * 1_000_000 : raw;
  const symbolCurrency: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", "₹": "INR", "₦": "NGN" };
  const currency = m[4]?.toUpperCase() ?? (m[1] ? symbolCurrency[m[1]] : undefined);
  return { amount, currency, matched: m[0].trim() };
}

const countryName = (code: string) => COUNTRY_TERMS.find((c) => c.code === code)?.name ?? code;

/**
 * Rule-based interpretation. Always runs; always deterministic; never invents
 * a provider, a capability or a fact — it only structures what was typed.
 */
export function interpretRules(input: string): Interpretation {
  const text = ` ${input.toLowerCase().replace(/\s+/g, " ").trim()} `;
  const raw: Match[] = [];

  for (const c of COUNTRY_TERMS) raw.push(...findTerms(text, c.terms, "country", c.code));
  for (const r of REGION_TERMS)
    for (const code of r.countries.slice(0, 1))
      raw.push(...findTerms(text, r.terms, "country", code));
  for (const c of CURRENCY_TERMS) raw.push(...findTerms(text, c.terms, "currency", c.code));
  for (const a of ASSET_TERMS) raw.push(...findTerms(text, a.terms, "asset", a.symbol));
  for (const n of NETWORK_TERMS) raw.push(...findTerms(text, n.terms, "network", n.slug));
  for (const p of PRODUCT_TERMS) raw.push(...findTerms(text, p.terms, "product", p.product));
  for (const m of METHOD_TERMS) raw.push(...findTerms(text, m.terms, "method", m.method));
  for (const r of NAMED_RAIL_TERMS) raw.push(...findTerms(text, r.terms, "namedRail", r.code));
  for (const s of SEPA_RAIL_TEMPLATES) raw.push(...findTerms(text, s.qualifierTerms, "sepaTemplate", s.suffix));
  raw.push(...findTerms(text, BUSINESS_TERMS, "customerType", "business"));
  raw.push(...findTerms(text, INDIVIDUAL_TERMS, "customerType", "individual"));

  const matches = dedupeOverlaps(raw);
  const tokens: QueryToken[] = [];
  const query: CorridorQuery = { customerType: "business" };

  /* ---- countries: entity vs destination ------------------------------- */
  const countryMatches = matches.filter((m) => m.kind === "country");
  const roles = new Map<Match, "entity" | "destination">();
  for (const m of countryMatches) {
    const role = nearestMarkerRole(text, m.index) ?? hintRole(text, m.index, m.length);
    if (role) roles.set(m, role);
  }
  const unassigned = countryMatches.filter((m) => !roles.has(m));
  if (unassigned.length === 1 && countryMatches.length === 1) {
    // A lone country in a payout question is almost always the destination.
    roles.set(unassigned[0]!, "destination");
  } else if (unassigned.length) {
    // Reading order: earlier country is the origin, later is the destination.
    const hasEntity = [...roles.values()].includes("entity");
    const hasDest = [...roles.values()].includes("destination");
    unassigned.forEach((m, i) => {
      if (!hasEntity && i === 0) roles.set(m, "entity");
      else if (!hasDest) roles.set(m, "destination");
      else roles.set(m, "destination");
    });
  }

  for (const [m, role] of roles) {
    const field = role === "entity" ? "entityCountry" : "destinationCountry";
    if (query[field]) continue;
    query[field] = m.value;
    tokens.push({
      field,
      value: m.value,
      label: `${role === "entity" ? "Entity" : "Destination"}: ${countryName(m.value)}`,
      confidence: nearestMarkerRole(text, m.index) ? 0.95 : 0.82,
      matchedText: m.text,
      derivation: "source",
    });
  }

  /* ---- assets, networks, currencies ----------------------------------- */
  const asset = matches.find((m) => m.kind === "asset");
  if (asset) {
    query.sourceAsset = asset.value;
    tokens.push({
      field: "sourceAsset",
      value: asset.value,
      label: `Asset: ${asset.value}`,
      confidence: 0.98,
      matchedText: asset.text,
      derivation: "source",
    });
  }

  const network = matches.find((m) => m.kind === "network");
  if (network) {
    query.sourceNetwork = network.value;
    tokens.push({
      field: "sourceNetwork",
      value: network.value,
      label: `Network: ${network.value}`,
      confidence: 0.9,
      matchedText: network.text,
      derivation: "source",
    });
  }

  const currency = matches.find((m) => m.kind === "currency" && m.value !== "USD") ??
    matches.find((m) => m.kind === "currency");
  if (currency) {
    query.destinationCurrency = currency.value;
    tokens.push({
      field: "destinationCurrency",
      value: currency.value,
      label: `Destination currency: ${currency.value}`,
      confidence: 0.93,
      matchedText: currency.text,
      derivation: "source",
    });
  }

  /* ---- product + method ------------------------------------------------ */
  const product = matches.find((m) => m.kind === "product");
  if (product) {
    query.product = product.value as CorridorQuery["product"];
    const label = PRODUCT_TERMS.find((p) => p.product === product.value)?.label ?? product.value;
    tokens.push({
      field: "product",
      value: product.value,
      label: `Product: ${label}`,
      confidence: 0.9,
      matchedText: product.text,
      derivation: "source",
    });
  }

  const method = matches.find((m) => m.kind === "method");
  if (method) {
    query.paymentMethod = method.value as CorridorQuery["paymentMethod"];
    const label = METHOD_TERMS.find((p) => p.method === method.value)?.label ?? method.value;
    tokens.push({
      field: "paymentMethod",
      value: method.value,
      label: `Rail: ${label}`,
      confidence: 0.85,
      matchedText: method.text,
      derivation: "source",
    });
  }

  /* ---- named rails: independent of, never collapsed into, paymentMethod - */
  const namedRailMatch = matches.find((m) => m.kind === "namedRail");
  if (namedRailMatch) {
    query.namedRail = namedRailMatch.value;
    tokens.push({
      field: "namedRail",
      value: namedRailMatch.value,
      label: `Rail: ${namedRailMatch.value}`,
      confidence: 0.9,
      matchedText: namedRailMatch.text,
      derivation: "source",
    });
  }

  // SEPA's rails are country-specific rows (SEPA_ICT_DE, SEPA_ICT_FR, ...);
  // "SEPA Instant" alone never names one, so this only resolves once a
  // destination country is known — and only to a country named_rails
  // actually has that pair for. No country, or a non-SEPA country: no
  // resolution, no fallback guess.
  const sepaTemplateMatch = matches.find((m) => m.kind === "sepaTemplate");
  if (
    sepaTemplateMatch &&
    !query.namedRail &&
    query.destinationCountry &&
    SEPA_RAIL_COUNTRIES.includes(query.destinationCountry)
  ) {
    const code = `SEPA_${sepaTemplateMatch.value}_${query.destinationCountry}`;
    query.namedRail = code;
    tokens.push({
      field: "namedRail",
      value: code,
      label: `Rail: SEPA ${sepaTemplateMatch.value === "ICT" ? "Instant" : "Credit Transfer"} (${query.destinationCountry})`,
      confidence: 0.85,
      matchedText: sepaTemplateMatch.text,
      derivation: "source",
    });
  }

  /* ---- customer type --------------------------------------------------- */
  const customer = matches.find((m) => m.kind === "customerType");
  if (customer) {
    query.customerType = customer.value as CorridorQuery["customerType"];
    tokens.push({
      field: "customerType",
      value: customer.value,
      label: `Customer: ${customer.value === "business" ? "Business" : "Individual"}`,
      confidence: 0.88,
      matchedText: customer.text,
      derivation: "source",
    });
  }

  /* ---- amount ---------------------------------------------------------- */
  const amount = parseAmount(input);
  if (amount) {
    query.amount = amount.amount;
    query.amountCurrency = (amount.currency ?? query.destinationCurrency ?? "USD") as string;
    tokens.push({
      field: "amount",
      value: amount.amount,
      label: `Amount: ${amount.amount.toLocaleString()} ${query.amountCurrency}`,
      confidence: 0.8,
      matchedText: amount.matched,
      derivation: "source",
    });
  }

  /* ---- inferences (never silent: rendered as chips without matchedText) - */
  if (query.destinationCurrency && !query.destinationCountry) {
    const home = COUNTRY_TERMS.find((c) => c.defaultCurrency === query.destinationCurrency);
    if (home) {
      query.destinationCountry = home.code;
      tokens.push({
        field: "destinationCountry",
        value: home.code,
        label: `Destination: ${home.name}`,
        confidence: 0.6,
        derivation: "source",
      });
    }
  }
  if (query.destinationCountry && !query.destinationCurrency) {
    const home = COUNTRY_TERMS.find((c) => c.code === query.destinationCountry);
    if (home) {
      query.destinationCurrency = home.defaultCurrency;
      tokens.push({
        field: "destinationCurrency",
        value: home.defaultCurrency,
        label: `Destination currency: ${home.defaultCurrency}`,
        confidence: 0.55,
        derivation: "source",
      });
    }
  }
  if (!query.product && query.sourceAsset && query.destinationCurrency) {
    query.product = "off_ramp";
    tokens.push({
      field: "product",
      value: "off_ramp",
      label: "Product: Off-ramp",
      confidence: 0.65,
      derivation: "source",
    });
  }
  if (!query.paymentMethod && query.product === "off_ramp") {
    query.paymentMethod = "bank_transfer_local";
    tokens.push({
      field: "paymentMethod",
      value: "bank_transfer_local",
      label: "Rail: Local bank transfer",
      confidence: 0.5,
      derivation: "source",
    });
  }

  const missing = (
    ["entityCountry", "sourceAsset", "destinationCountry", "destinationCurrency"] as const
  ).filter((f) => !query[f]);

  return { input, query, tokens, missing, interpreter: "rules" };
}

/** Convenience for tests and for the API: rules only, no network calls. */
export function interpret(input: string): Interpretation {
  return interpretRules(input);
}
