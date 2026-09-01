/**
 * SEC EDGAR — free, keyless, official U.S. regulatory filings.
 *
 * Where this fits: a filed 10-K/10-Q is a legally-binding disclosure, ranked
 * above a marketing page in the same way `source-quality.ts` ranks
 * `official_regulator` above `official_provider` for country research. For
 * the providers in this dataset that are public companies (Circle, Coinbase,
 * PayPal, Mastercard, Visa...), a filing is the single most authoritative
 * source available for licensing, regulatory posture, and reserve/backing
 * claims — better than the same company's own blog post.
 *
 * This module only fetches and returns real filing text as a `ProviderSource`
 * — it plugs into the exact same extractProviderCapabilities() +
 * persistProviderExtraction() pipeline as Firecrawl-scraped pages. No new
 * extraction or evidence path; SEC EDGAR is just another place real source
 * text can come from.
 *
 * SEC's fair-access policy requires a descriptive User-Agent identifying who
 * is making the request, and asks for no more than ~10 req/sec — both
 * respected here.
 */
const USER_AGENT = "Railor provider research (research@railor.dev)";
const MIN_INTERVAL_MS = 150; // well under SEC's ~10 req/sec guidance

let nextSlotAt = 0;
async function throttle(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlotAt);
  nextSlotAt = slot + MIN_INTERVAL_MS;
  const wait = slot - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function getText(url: string): Promise<string> {
  await throttle();
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "*/*" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`SEC EDGAR ${url} -> HTTP ${response.status}`);
  return response.text();
}

export interface EdgarCompany {
  cik: string; // 10-digit, zero-padded
  name: string;
}

/**
 * Finds the CIK for a company by name via EDGAR's full-text search index.
 *
 * The older `browse-edgar?action=getcompany` atom endpoint was tried first
 * and rejected: for a multi-match query its `<entry title="...">` comes back
 * as literally `ARRAY(0x...)` — a serialization bug on SEC's own side in
 * that response format — leaving no company name to verify against, only a
 * CIK. Trusting "first CIK returned" for an ambiguous name like "Circle"
 * would have been exactly the kind of guess this pipeline is built to avoid;
 * a Tulsa oil driller was the second hit.
 *
 * The full-text search endpoint instead returns real, human-readable
 * `display_names`, so the match can be verified: only a result whose company
 * name actually starts with the searched name (case-insensitive) is
 * accepted. A relevant filing that merely *mentions* the name doesn't count.
 */
/**
 * SIC codes plausible for a payments/fintech/crypto company. Deliberately
 * narrow and built only from codes actually observed on confirmed-correct
 * matches (6199 came back for both Circle and Coinbase live) plus a small
 * set of standard finance SIC codes. A real match with an SIC outside this
 * list is treated as unverifiable rather than added to the list — the
 * failure mode this guards against is a false ACCEPT (a same-named unrelated
 * company), and a false reject just means "no EDGAR match", which is the
 * correct, honest answer for the many providers here that are private or
 * foreign-listed anyway.
 */
const PLAUSIBLE_SICS = new Set(["6199", "6211", "6221", "6020", "6022", "7372", "7389"]);

/**
 * CIKs manually verified against the real company, not trusted from
 * name+SIC+ticker matching alone. That heuristic looked solid after fixing
 * the Bridge/Wise false positives (Circle, Coinbase, PayPal, Mastercard,
 * Visa, BitGo, Payoneer all matched correctly) but then matched "Eco" to
 * Eco Bright Future, Inc. (an unrelated shell company) and "Sphere" to
 * Sphere 3D Corp. (an unrelated data-storage company) — both real SEC
 * filers, both wrong, both short/generic-enough brand names for a same-named
 * micro-cap to slip past SIC+ticker. Neither produced bad data, because
 * extraction correctly found nothing stablecoin-shaped in an unrelated
 * company's filing — but "the fetch was safe" isn't the same as "the CIK was
 * right", and a wrong company's evidence must never enter this pipeline
 * regardless of whether it happened to extract cleanly this time.
 *
 * A slug only goes in this list once findCompany's live result has actually
 * been read and confirmed to be the real company — the same manual
 * verification step already applied to Mesh/Eco/Anchorage's *domains* in
 * register.ts, just applied here to EDGAR identity instead.
 */
export const VERIFIED_PUBLIC_COMPANIES: Record<string, string> = {
  circle: "0001876042",
  coinbase: "0001679788",
  bitgo: "0001740604",
  payoneer: "0001845815",
};

export async function findCompany(name: string): Promise<EdgarCompany | null> {
  const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(JSON.stringify(name))}&forms=10-K,10-Q`;
  const json = JSON.parse(await getText(url)) as {
    hits?: { hits?: Array<{ _source?: { display_names?: string[]; sics?: string[] } }> };
  };
  const target = name.trim().toLowerCase();

  for (const hit of json.hits?.hits ?? []) {
    const sics = hit._source?.sics ?? [];
    if (!sics.some((s) => PLAUSIBLE_SICS.has(s))) continue;

    for (const raw of hit._source?.display_names ?? []) {
      // "Circle Internet Group, Inc.  (CRCL)  (CIK 0001876042)" -> name + ticker + cik.
      // A ticker is required, not optional: "Wise" alone (no exchange listing)
      // matched "WISE SALES, INC." and "Wise Metals Group LLC" — both real SEC
      // filers, neither the actual company, neither exchange-listed. Every
      // provider that has correctly matched so far (Circle/CRCL, Coinbase/COIN,
      // PayPal/PYPL) carries a ticker; requiring one filters out same-named
      // filers that only exist in EDGAR because of registered debt or a legacy
      // shell, not because they're a business anyone would recognize.
      const cikMatch = raw.match(/\(CIK (\d+)\)/);
      const tickerMatch = raw.match(/\(([A-Z]{1,5})\) {2}\(CIK/);
      if (!cikMatch || !tickerMatch) continue;
      const companyName = raw.split(/ {2}\(/)[0]!.trim();
      if (companyName.toLowerCase().startsWith(target)) {
        return { cik: cikMatch[1]!.padStart(10, "0"), name: companyName };
      }
    }
  }
  return null;
}

export interface EdgarFiling {
  accessionNumber: string;
  form: string;
  filingDate: string;
  primaryDocument: string;
}

/** Recent filings for a CIK, newest first, from the standard `submissions` JSON endpoint. */
export async function recentFilings(cik: string, forms: string[] = ["10-K", "10-Q"]): Promise<EdgarFiling[]> {
  const json = JSON.parse(await getText(`https://data.sec.gov/submissions/CIK${cik}.json`)) as {
    filings: {
      recent: {
        accessionNumber: string[];
        form: string[];
        filingDate: string[];
        primaryDocument: string[];
      };
    };
  };
  const r = json.filings.recent;
  const out: EdgarFiling[] = [];
  for (let i = 0; i < r.form.length; i++) {
    if (forms.includes(r.form[i]!)) {
      out.push({
        accessionNumber: r.accessionNumber[i]!,
        form: r.form[i]!,
        filingDate: r.filingDate[i]!,
        primaryDocument: r.primaryDocument[i]!,
      });
    }
  }
  return out;
}

/** The real, browsable URL for a filing document — this IS the citable evidence URL, not a proxy. */
export function filingUrl(cik: string, filing: EdgarFiling): string {
  const accession = filing.accessionNumber.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession}/${filing.primaryDocument}`;
}

/** Strips HTML to plain text — filings are usually iXBRL/HTML, and only the text matters for extraction. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface EdgarSource {
  url: string;
  title: string;
  content: string;
}

/**
 * Fetches a company's most recent 10-K/10-Q as plain text, ready to feed into
 * extractProviderCapabilities(). Returns null rather than throwing when the
 * company isn't found or has no matching filings — most providers in this
 * dataset are private and simply have nothing here, which is a normal,
 * expected outcome, not a failure.
 */
export async function fetchLatestFiling(companyName: string, knownCik?: string): Promise<EdgarSource | null> {
  // A caller holding a manually-verified CIK (VERIFIED_PUBLIC_COMPANIES)
  // passes it directly so this never falls back through the heuristic
  // matcher for a company whose identity is already confirmed.
  const company = knownCik ? { cik: knownCik, name: companyName } : await findCompany(companyName);
  if (!company) return null;

  const filings = await recentFilings(company.cik);
  const latest = filings[0];
  if (!latest) return null;

  const url = filingUrl(company.cik, latest);
  const html = await getText(url);
  return {
    url,
    title: `${company.name} — ${latest.form} (${latest.filingDate})`,
    content: htmlToText(html),
  };
}
