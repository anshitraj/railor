import { after, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { COUNTRY_TERMS, priceWebChecks, readWebChecks, registrableDomain, waitForWebChecks, type WebCheckClaim } from "@railor/core";
import { getSession } from "../../../../lib/auth";
import { parsePriceQuery, runPriceCheck } from "../../../../lib/pricing";
import { attemptProviderCalculator, savePublicQuoteObservation } from "../../../../lib/public-quote-observations";
import { consumeLimit, requestIdentity } from "../../../../lib/rate-limit";
import { providerIdentity } from "../../../../lib/price-display";
import { priceView } from "../../../../lib/price-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const startedAt = Date.now();
  const session = await getSession();

  const params = new URL(request.url).searchParams;
  const input = parsePriceQuery(params);
  const slug = params.get("provider");
  if (!input?.context || input.context.paymentMethod === "card" || !slug || !/^[a-z0-9-]{1,80}$/.test(slug)) {
    return NextResponse.json({ error: "Choose a provider, route and amount." }, { status: 400 });
  }
  const identity = session?.user.id ?? `guest:${requestIdentity(request)}`;
  if (!await consumeLimit("provider-quote", identity, session ? 6 : 3, 60_000)) {
    return NextResponse.json({ error: "Too many quote requests. Try again in a minute." }, { status: 429 });
  }

  try {
    const result = await runPriceCheck(session?.organization?.id ?? null, input);
    const provider = (result.marketCoverage?.allProviders ?? result.marketCoverage?.providers)?.find(row => row.providerSlug === slug);
    const { quotes, excluded } = priceView(result, Date.now());
    const excludedProvider = excluded.find(item => providerIdentity(item.providerSlug) === slug);
    const available = quotes.filter(item => providerIdentity(item.providerSlug) === slug && item.recipientAmount !== null);
    const row = available.find(item => item.basis !== "market_estimate") ?? available[0];
    const attempt = row || excludedProvider ? null : await attemptProviderCalculator(slug, result.input, result.reference?.rate ?? null);
    const quote = row ?? attempt?.row ?? null;
    if (!quote) {
      const restriction = excludedProvider?.profileAssessment?.reasons[0];
      const message = restriction ?? attempt?.reason ?? provider?.pricingStatus?.reason ?? "The provider didn’t return a public total for this transfer. Check its calculator or your account.";
      if (!session || !provider?.websiteUrl) return NextResponse.json({ message });

      const countryName = (code: string) => COUNTRY_TERMS.find(country => country.code === code)?.name ?? code;
      const { context, sourceCurrency, destinationCurrency, destinationCountry } = result.input;
      const profile = context ?? input.context;
      const direction = profile.direction === "send" ? `from ${countryName(profile.country)}` : `received in ${countryName(profile.country)}`;
      const route = `${sourceCurrency} to ${destinationCurrency} ${direction}${destinationCountry && profile.direction === "send" ? ` to ${countryName(destinationCountry)}` : ""}`;
      const setup = `${route}, ${profile.profile.replaceAll("_", " ")} ${profile.purpose} transfer using ${profile.paymentMethod?.replaceAll("_", " ") ?? "the bank payout product"}`;
      const common = { providerSlug: slug, providerName: provider.providerName, domain: registrableDomain(provider.websiteUrl) };
      const key = createHash("sha256").update(`provider-quote-v2:${slug}:${setup}`).digest("hex");
      const claims: WebCheckClaim[] = [
        { ...common, key: `${key}:route`, kind: "corridor", statement: `${provider.providerName} offers ${setup}.` },
        { ...common, key: `${key}:fees`, kind: "profile", lookup: true, statement: `Find transfer fees and tax that ${provider.providerName} explicitly publishes for ${setup}.` },
      ];
      const checks = await priceWebChecks(claims).catch(() => null);
      let findings = checks?.results ?? [];
      const waiting = checks?.pending ?? new Set<string>();
      if (checks?.pending.size) {
        after(() => waitForWebChecks());
        const deadline = Math.min(startedAt + 45_000, Date.now() + 18_000);
        while (waiting.size && !request.signal.aborted && Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, Math.min(2500, Math.max(0, deadline - Date.now()))));
          const finished = await readWebChecks([...waiting]).catch(() => []);
          findings = [...findings, ...finished];
          for (const check of finished) waiting.delete(check.key);
        }
      }
      const evidence = findings.flatMap(check => check.official && check.sourceUrl && check.quote && check.verdict !== "unclear"
        ? [{ url: check.sourceUrl, title: check.sourceTitle ?? "Official source", text: check.quote }]
        : []);
      return NextResponse.json({ message, evidence, researchPending: waiting.size > 0 });
    }
    if (quote.basis === "live_public") await savePublicQuoteObservation(result.input, quote).catch(() => undefined);
    return NextResponse.json({ quote });
  } catch {
    return NextResponse.json({ error: "The provider quote check couldn’t finish. Try again shortly." }, { status: 502 });
  }
}
