import { createHash } from "node:crypto";
import { GoogleGenAI, Type } from "@google/genai";
import { whereAlpha2 } from "iso-3166-1";
import { unconfirmedAssessment, type CustomerContext } from "./customer-profiles.js";
import { KNOWN_PROVIDER_SITES } from "./logos.js";
import { guardedGet } from "./net-guard.js";
import { COUNTRY_TERMS } from "./vocab.js";
import type { PriceCheckInput, PriceRow } from "./pricing.js";

/**
 * Web check: before a price row is trusted, ask Google whether what it
 * implies is true ("Wise can pay INR into an Indian bank account", "an
 * individual in India can receive family money through Skydo").
 *
 *   1. Gemini answers with Google Search grounding. Only its citations are
 *      kept; prose without grounding metadata is discarded.
 *   2. Railor fetches every cited page itself (public HTTPS only, robots.txt
 *      obeyed, size-capped). Social and user-generated pages are not evidence.
 *   3. A second, ungrounded pass picks a verdict and one sentence copied from
 *      those pages.
 *   4. The verdict stands only if that sentence is on the fetched page and
 *      addresses the statement; otherwise it is "unclear".
 *
 * A contradiction quoted from the provider's own site demotes the row. A
 * confirmation never promotes one: documented rules stay human-reviewed.
 */

export type WebCheckVerdict = "supported" | "contradicted" | "unclear";

export interface WebCheckClaim {
  key: string;
  kind: "corridor" | "profile";
  providerSlug: string;
  providerName: string;
  /** The provider's own site; a quote from it counts as official. */
  domain: string | null;
  statement: string;
}

export interface WebCheckResult {
  key: string;
  providerSlug: string;
  kind: WebCheckClaim["kind"];
  statement: string;
  verdict: WebCheckVerdict;
  quote: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  official: boolean;
  searchQueries: string[];
  pages: Array<{ url: string; title: string }>;
  /** Why a check is unclear or failed. */
  note: string | null;
  model: string;
  checkedAt: string;
}

/** What a price row carries: the statement checked and, once checked, what settled it. */
export interface RowWebCheck {
  statement: string;
  state: WebCheckVerdict | "pending" | "not_checked";
  quote: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  official: boolean;
  checkedAt: string | null;
  note: string | null;
  /** The check disagrees with what the row shows, so the row needs review. */
  conflict: boolean;
}

export interface WebCheckSummary {
  configured: boolean;
  /** Google AI is configured but refusing calls (billing, auth or quota); checks resume on their own. */
  paused: boolean;
  checked: number;
  pending: number;
  contradicted: number;
}

const currencyNames = new Intl.DisplayNames(["en"], { type: "currency" });

function currencyName(code: string) {
  try {
    return currencyNames.of(code) ?? code;
  } catch {
    return code;
  }
}

function countryName(code: string) {
  return COUNTRY_TERMS.find((c) => c.code === code)?.name ?? whereAlpha2(code)?.country ?? code;
}

/** Where the money lands: stated, the recipient's own country, or the one country using that currency. */
function payoutCountry(input: PriceCheckInput): string | null {
  if (input.destinationCountry) return input.destinationCountry;
  if (input.context?.direction === "receive") return input.context.country;
  const users = COUNTRY_TERMS.filter((c) => c.defaultCurrency === input.destinationCurrency);
  return users.length === 1 ? users[0]!.code : null;
}

export function registrableDomain(urlOrHost: string): string {
  let host = urlOrHost;
  try {
    if (urlOrHost.includes("://")) host = new URL(urlOrHost).hostname;
  } catch {
    return "";
  }
  host = host.toLowerCase().replace(/\.$/, "");
  return host.startsWith("www.") ? host.slice(4) : host;
}

function sameSite(url: string, domain: string | null) {
  if (!domain) return false;
  const host = registrableDomain(url);
  return host === domain || host.endsWith(`.${domain}`);
}

const PROFILE_WHO: Record<CustomerContext["profile"], string> = {
  personal: "An individual (not a business or freelancer)",
  freelancer: "An individual freelancer",
  sole_proprietor: "A sole proprietor",
  business: "A registered company",
};
const PURPOSE_WHAT: Record<CustomerContext["purpose"], string> = {
  personal: "personal money such as family support",
  services: "payments from foreign clients for services",
  goods: "payments for exported goods",
  salary: "a salary from a foreign employer",
};
const PROFILE_SENDER: Record<CustomerContext["profile"], string> = {
  personal: "an individual", freelancer: "a freelancer", sole_proprietor: "a sole proprietor", business: "a company",
};

function brand(row: PriceRow) {
  return row.providerName.split(" · ")[0]!.trim();
}

function claimKey(kind: string, slug: string, statement: string) {
  return `${kind}:${slug}:${createHash("sha256").update(statement).digest("hex").slice(0, 16)}`;
}

/**
 * One statement per provider row — the thing that would make the row wrong
 * if it were false. Recipient-side products (and rows the rules excluded for
 * a recipient) are checked against the account holder's profile; everything
 * else against the corridor itself. Market estimates come from Wise's own
 * collection of each provider's site, so they are not re-checked here.
 */
export function priceCheckClaims(input: PriceCheckInput, rows: PriceRow[]): WebCheckClaim[] {
  const country = payoutCountry(input);
  const src = input.sourceCurrency;
  const dst = input.destinationCurrency;
  const claims = new Map<string, WebCheckClaim>();
  for (const row of rows) {
    if (row.basis === "market_estimate") continue;
    const name = brand(row);
    const context = input.context;
    const profile = Boolean(context && context.direction === "receive" && (row.side === "recipient" || row.profileAssessment?.status === "not_supported"));
    let statement: string;
    if (profile && context) {
      statement = `${PROFILE_WHO[context.profile]} in ${countryName(context.country)} can receive ${PURPOSE_WHAT[context.purpose]} from abroad through ${name}.`;
    } else {
      const sender = row.providerSlug === "revolut" ? "someone with a Revolut personal account in the United Kingdom"
        : context?.direction === "send" ? `${PROFILE_SENDER[context.profile]} based in ${countryName(context.country)}`
        : "a customer";
      const into = country ? `a bank account in ${countryName(country)}` : "the recipient's bank account";
      statement = `${name} lets ${sender} pay in ${currencyName(src)} (${src}) and have ${currencyName(dst)} (${dst}) paid into ${into}.`;
    }
    const kind = profile ? "profile" : "corridor";
    const key = claimKey(kind, row.providerSlug, statement);
    const site = KNOWN_PROVIDER_SITES[row.providerSlug];
    claims.set(key, { key, kind, providerSlug: row.providerSlug, providerName: name, domain: site ? registrableDomain(site) : null, statement });
  }
  return [...claims.values()];
}

/**
 * Attaches each row's check. A contradiction quoted from the provider's own
 * site moves the row out of the price list with that quote as the reason.
 * Anything else is shown, never acted on: a confirmation that disagrees with
 * an exclusion, or a third-party contradiction, flags the row for review.
 */
export function applyWebChecks(rows: PriceRow[], claims: WebCheckClaim[], results: WebCheckResult[], pending: ReadonlySet<string>): WebCheckSummary {
  const byKey = new Map(results.map((r) => [r.key, r]));
  const summary: WebCheckSummary = { configured: true, paused: false, checked: 0, pending: 0, contradicted: 0 };
  for (const claim of claims) {
    const row = rows.find((r) => r.providerSlug === claim.providerSlug);
    if (!row) continue;
    const result = byKey.get(claim.key);
    const excluded = row.profileAssessment?.status === "not_supported";
    const entry: RowWebCheck = {
      statement: claim.statement,
      state: result ? result.verdict : pending.has(claim.key) ? "pending" : "not_checked",
      quote: result?.quote ?? null,
      sourceUrl: result?.sourceUrl ?? null,
      sourceTitle: result?.sourceTitle ?? null,
      official: result?.official ?? false,
      checkedAt: result?.checkedAt ?? null,
      note: result?.note ?? null,
      conflict: false,
    };
    (row.webChecks ??= []).push(entry);
    if (entry.state === "pending") summary.pending++;
    if (!result) continue;
    summary.checked++;
    if (result.verdict === "contradicted") summary.contradicted++;
    if (result.verdict === "supported" && excluded) entry.conflict = true;
    if (result.verdict !== "contradicted" || excluded) continue;
    if (!result.official || !result.quote || !result.sourceUrl) {
      entry.conflict = true;
      continue;
    }
    const before = row.profileAssessment ?? unconfirmedAssessment();
    row.profileAssessment = {
      ...before,
      status: "not_supported",
      priceApplicable: false,
      reasons: [`${claim.providerName}'s own site says: “${result.quote}”`, ...(row.profileAssessment ? before.reasons : [])],
      sources: [...before.sources, { label: `${claim.providerName} (web check source)`, url: result.sourceUrl }],
      reviewedAt: before.reviewedAt ?? result.checkedAt.slice(0, 10),
    };
    row.partial = true;
  }
  return summary;
}

// ─── Verification ────────────────────────────────────────────────────────────

const QUOTE_MARKS: Record<string, string> = { "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-" };

/** Case, quote style, dash style and whitespace are presentation, not content. */
export function normalizeText(text: string) {
  return text.normalize("NFKC").replace(/[‘’“”–—]/g, (c) => QUOTE_MARKS[c] ?? c).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Exact (normalized) containment of one contiguous sentence. Edited quotes never pass. */
export function quoteOnPage(quote: string, pageText: string) {
  const q = normalizeText(quote).replace(/^["' ]+|["' ]+$/g, "");
  if (q.length < 25 || q.includes("...") || quote.includes("…")) return false;
  return normalizeText(pageText).includes(q);
}

const STOP = new Set(
  "a an the and or of to in on for with by from at as is are be can its it this that these those via our your their not no yes do does using use allows allow lets let have has into through paid pay such someone customer bank account money".split(" "),
);

function contentWords(text: string) {
  return new Set(
    (normalizeText(text).match(/[a-z0-9]+/g) ?? [])
      .filter((w) => w.length > 2 && !STOP.has(w))
      // Plurals carry the same fact: "rupees", "accounts".
      .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)),
  );
}

/**
 * A real sentence from the page, pasted under an unrelated statement, is not
 * evidence for it: the quote itself must share one of the statement's content
 * words, and the quote plus the page title at least two. The title places a
 * terse sentence ("… | Revolut India").
 */
export function quoteAddresses(statement: string, quote: string, providerName: string, pageTitle = "") {
  const brandWords = contentWords(providerName);
  const wanted = [...contentWords(statement)].filter((w) => !brandWords.has(w));
  const inQuote = contentWords(quote);
  const inTitle = contentWords(pageTitle);
  const quoteHits = wanted.filter((w) => inQuote.has(w)).length;
  const hits = wanted.filter((w) => inQuote.has(w) || inTitle.has(w)).length;
  return quoteHits >= Math.min(1, wanted.length) && hits >= Math.min(2, wanted.length);
}

// ─── Fetching ────────────────────────────────────────────────────────────────

export class SkippedSource extends Error {}

export interface FetchedSource {
  url: string;
  title: string;
  text: string;
}

const NOT_EVIDENCE = ["reddit.com", "quora.com", "facebook.com", "x.com", "twitter.com", "linkedin.com", "youtube.com", "instagram.com", "medium.com", "tiktok.com"];
const GROUNDING_REDIRECT_HOST = "vertexaisearch.cloud.google.com";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…" };

export function htmlToText(html: string) {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?(p|div|li|ul|ol|h[1-6]|br|tr|td|th|section|article|header|footer|dt|dd)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : " ";
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

const robotsCache = new Map<string, { at: number; rules: Array<{ allow: boolean; pattern: RegExp; length: number }> }>();

function robotsRules(body: string) {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const field = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (current && (field === "allow" || field === "disallow") && value) current.rules.push({ allow: field === "allow", path: value });
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && "railorbot".includes(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  return chosen.flatMap((g) => g.rules).map((r) => ({
    allow: r.allow,
    length: r.path.length,
    pattern: new RegExp(`^${r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$")}`),
  }));
}

/** Longest matching rule wins; Allow wins a tie. No robots.txt means allowed. */
export async function robotsAllow(url: string) {
  const parsed = new URL(url);
  let entry = robotsCache.get(parsed.origin);
  if (!entry || Date.now() - entry.at > 3_600_000) {
    let rules: ReturnType<typeof robotsRules> = [];
    try {
      const res = await guardedGet(`${parsed.origin}/robots.txt`, { maxBytes: 500_000, timeoutMs: 5_000, maxRedirects: 2, accept: "text/plain" });
      rules = robotsRules(res.body.toString("utf8"));
    } catch {
      rules = [];
    }
    entry = { at: Date.now(), rules };
    robotsCache.set(parsed.origin, entry);
  }
  const path = `${parsed.pathname}${parsed.search}`;
  const hits = entry.rules.filter((r) => r.pattern.test(path)).sort((a, b) => b.length - a.length || Number(b.allow) - Number(a.allow));
  return hits.length === 0 || hits[0]!.allow;
}

/** Google's grounding links redirect to the cited page; resolve that one hop before robots and fetching. */
async function resolveCitation(uri: string) {
  const parsed = new URL(uri);
  if (parsed.protocol !== "https:") throw new SkippedSource("not an HTTPS link");
  if (parsed.hostname !== GROUNDING_REDIRECT_HOST) return uri;
  const res = await fetch(uri, { redirect: "manual", signal: AbortSignal.timeout(8_000) });
  await res.body?.cancel().catch(() => undefined);
  const location = res.headers.get("location");
  if (!location) throw new SkippedSource("citation link did not resolve");
  return new URL(location, uri).toString();
}

export async function fetchSource(uri: string): Promise<FetchedSource> {
  const url = await resolveCitation(uri);
  const domain = registrableDomain(url);
  if (NOT_EVIDENCE.some((d) => domain === d || domain.endsWith(`.${d}`))) throw new SkippedSource("social or user-generated page");
  if (!(await robotsAllow(url))) throw new SkippedSource("disallowed by robots.txt");
  const page = await guardedGet(url, { maxBytes: 3_000_000, timeoutMs: 12_000, maxRedirects: 4, accept: "text/html,application/xhtml+xml" });
  if (!page.contentType.includes("html")) throw new SkippedSource(`not an HTML page (${page.contentType || "no type"})`);
  const html = page.body.toString("utf8");
  const text = htmlToText(html);
  if (text.length < 200) throw new SkippedSource("no readable text (rendered by JavaScript)");
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  return { url: page.url, title: htmlToText(title).slice(0, 200), text: text.slice(0, 16_000) };
}

// ─── Model ───────────────────────────────────────────────────────────────────

export interface WebCheckJudgement {
  verdict: WebCheckVerdict;
  sourceId?: number;
  quote?: string;
  reason?: string;
}

export interface WebCheckModel {
  readonly name: string;
  search(prompt: string): Promise<{ queries: string[]; citations: Array<{ uri: string; title: string }> }>;
  judge(prompt: string): Promise<WebCheckJudgement>;
}

const DEFAULT_MODEL = "gemini-flash-latest";

function genaiClient(): GoogleGenAI | null {
  // Vertex AI (Google Cloud) with application default credentials, or a Gemini API key.
  if (process.env.GOOGLE_GENAI_USE_VERTEXAI?.trim().toLowerCase() === "true") {
    return new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT, location: process.env.GOOGLE_CLOUD_LOCATION || "global" });
  }
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  return apiKey ? new GoogleGenAI({ apiKey }) : null;
}

export function webCheckConfigured() {
  if (process.env.RAILOR_WEB_CHECK?.trim().toLowerCase() === "off") return false;
  return process.env.GOOGLE_GENAI_USE_VERTEXAI?.trim().toLowerCase() === "true" || Boolean((process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim());
}

/** Gemini with Google Search grounding; null when no key or Vertex project is configured. */
export function geminiWebCheckModel(): WebCheckModel | null {
  if (!webCheckConfigured()) return null;
  const ai = genaiClient();
  if (!ai) return null;
  const model = process.env.RAILOR_WEB_CHECK_MODEL?.trim() || process.env.RAILOR_DISCOVERY_MODEL?.trim() || DEFAULT_MODEL;
  return {
    name: model,
    async search(prompt) {
      const res = await ai.models.generateContent({ model, contents: prompt, config: { temperature: 0, tools: [{ googleSearch: {} }], abortSignal: AbortSignal.timeout(60_000) } });
      const meta = res.candidates?.[0]?.groundingMetadata;
      const citations = (meta?.groundingChunks ?? []).flatMap((c) => (c.web?.uri ? [{ uri: c.web.uri, title: c.web.title ?? c.web.domain ?? "" }] : []));
      return { queries: meta?.webSearchQueries ?? [], citations };
    },
    async judge(prompt) {
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0,
          abortSignal: AbortSignal.timeout(60_000),
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              verdict: { type: Type.STRING, enum: ["supported", "contradicted", "unclear"] },
              sourceId: { type: Type.INTEGER },
              quote: { type: Type.STRING },
              reason: { type: Type.STRING },
            },
            required: ["verdict", "reason"],
          },
          thinkingConfig: { thinkingBudget: 1024 },
        },
      });
      const parsed = JSON.parse(res.text ?? "{}") as WebCheckJudgement;
      if (!["supported", "contradicted", "unclear"].includes(parsed.verdict)) throw new Error("The model returned no verdict.");
      return parsed;
    },
  };
}

export interface WebCheckDeps {
  model?: WebCheckModel | null;
  fetchSource?: (uri: string) => Promise<FetchedSource>;
  now?: () => Date;
  maxPages?: number;
}

function searchPrompt(claim: WebCheckClaim) {
  const site = claim.domain ? ` (${claim.domain})` : "";
  return [
    "Search the web now and cite your sources. Is this statement true today?",
    `"${claim.statement}"`,
    `Look first for ${claim.providerName}'s own official pages${site}: help centre, supported countries and currencies, eligibility, pricing and terms. Then reputable independent sources.`,
  ].join("\n");
}

function judgePrompt(claim: WebCheckClaim, sources: FetchedSource[]) {
  const blocks = sources.map((s, i) => `[${i + 1}] ${s.url}\n${s.title}\n${s.text}`).join("\n\n");
  return `You check ONE statement against the SOURCES below — nothing else. Never use outside knowledge.
STATEMENT: "${claim.statement}"
- "supported": a source explicitly says this is possible for ${claim.providerName}.
- "contradicted": a source explicitly says it is not possible, not offered, or restricted in a way that makes the statement false.
- "unclear": anything else, including sources that do not mention it.
For supported or contradicted, give sourceId (the [n]) and quote: ONE contiguous sentence copied character for character from that source's text that shows it. No ellipses, no joining sentences.
Prefer ${claim.providerName}'s own site${claim.domain ? ` (${claim.domain})` : ""} over third-party pages. reason: one short sentence.

SOURCES

${blocks}`;
}

/** Runs one check end to end. Throws only when the model itself fails. */
export async function runWebCheck(claim: WebCheckClaim, deps: WebCheckDeps = {}): Promise<WebCheckResult> {
  const model = deps.model === undefined ? geminiWebCheckModel() : deps.model;
  if (!model) throw new Error("Web check needs GEMINI_API_KEY, or GOOGLE_GENAI_USE_VERTEXAI=true with a Google Cloud project.");
  const now = deps.now ?? (() => new Date());
  const base = { key: claim.key, providerSlug: claim.providerSlug, kind: claim.kind, statement: claim.statement, model: model.name };
  const unclear = (note: string, extra: Partial<WebCheckResult> = {}): WebCheckResult => ({
    ...base, verdict: "unclear", quote: null, sourceUrl: null, sourceTitle: null, official: false, searchQueries: [], pages: [], note, checkedAt: now().toISOString(), ...extra,
  });

  const grounded = await model.search(searchPrompt(claim));
  if (!grounded.citations.length) return unclear("Gemini answered without searching the web, so nothing from that answer is used.", { searchQueries: grounded.queries });

  const load = deps.fetchSource ?? fetchSource;
  const settled = await Promise.allSettled(grounded.citations.slice(0, 8).map((c) => load(c.uri)));
  const seen = new Set<string>();
  const fetched: FetchedSource[] = [];
  for (const s of settled) {
    if (s.status !== "fulfilled" || seen.has(s.value.url)) continue;
    seen.add(s.value.url);
    fetched.push(s.value);
  }
  // The provider's own pages first, so they survive the page cap.
  fetched.sort((a, b) => Number(sameSite(b.url, claim.domain)) - Number(sameSite(a.url, claim.domain)));
  const sources = fetched.slice(0, deps.maxPages ?? 5);
  const pages = sources.map((s) => ({ url: s.url, title: s.title }));
  if (!sources.length) return unclear("None of the cited pages could be fetched and read.", { searchQueries: grounded.queries });

  const judgement = await model.judge(judgePrompt(claim, sources));
  if (judgement.verdict === "unclear") return unclear(judgement.reason?.slice(0, 300) || "The sources don't settle it.", { searchQueries: grounded.queries, pages });
  const source = judgement.sourceId ? sources[judgement.sourceId - 1] : undefined;
  if (!source || !judgement.quote) return unclear("The verdict cited no fetched page.", { searchQueries: grounded.queries, pages });
  if (!quoteOnPage(judgement.quote, source.text)) return unclear("The quoted sentence was not found on the cited page.", { searchQueries: grounded.queries, pages });
  if (!quoteAddresses(claim.statement, judgement.quote, claim.providerName, source.title)) return unclear("The quoted sentence does not address this statement.", { searchQueries: grounded.queries, pages });
  return {
    ...base,
    verdict: judgement.verdict,
    quote: judgement.quote.trim(),
    sourceUrl: source.url,
    sourceTitle: source.title || registrableDomain(source.url),
    official: sameSite(source.url, claim.domain),
    searchQueries: grounded.queries,
    pages,
    note: judgement.reason?.slice(0, 300) ?? null,
    checkedAt: now().toISOString(),
  };
}
