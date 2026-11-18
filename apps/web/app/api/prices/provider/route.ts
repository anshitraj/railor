import { after, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { priceWebChecks, registrableDomain, waitForWebChecks } from "@railor/core";
import { getSession } from "../../../../lib/auth";
import { parsePriceQuery, runPriceCheck } from "../../../../lib/pricing";
import { readXoomCalculator, savePublicQuoteObservation } from "../../../../lib/public-quote-observations";
import { consumeLimit } from "../../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in to get a provider quote." }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const input = parsePriceQuery(params);
  const slug = params.get("provider");
  if (!input?.context || input.context.paymentMethod === "card" || !slug || !/^[a-z0-9-]{1,80}$/.test(slug)) {
    return NextResponse.json({ error: "Choose a provider, route and amount." }, { status: 400 });
  }
  if (!await consumeLimit("provider-quote", session.user.id, 6, 60_000)) {
    return NextResponse.json({ error: "Too many quote requests. Try again in a minute." }, { status: 429 });
  }

  try {
    const result = await runPriceCheck(session.organization?.id ?? null, input);
    const provider = (result.marketCoverage?.allProviders ?? result.marketCoverage?.providers)?.find(row => row.providerSlug === slug);
    const row = result.rows.find(item => item.providerSlug === slug && item.recipientAmount !== null
      && item.basis !== "market_estimate" && item.profileAssessment?.status !== "not_supported");
    const quote = row ?? (slug === "xoom" ? await readXoomCalculator(result.input) : null);
    if (!quote) {
      const message = provider?.pricingStatus?.reason ?? "No verified quote was returned for this route. Check the provider’s account or calculator.";
      if (!provider?.websiteUrl) return NextResponse.json({ message });

      // Research slow-changing route evidence separately. Web search never creates a numeric quote.
      const routeInput = result.input;
      const recipient = routeInput.destinationCountry ? " in " + routeInput.destinationCountry : "";
      const statement = provider.providerName + " publicly offers a " + routeInput.sourceCurrency + " to " + routeInput.destinationCurrency
        + " transfer to a bank account" + recipient + " for the selected " + input.context.profile + " customer profile.";
      const key = createHash("sha256").update("provider-quote-route:" + slug + ":" + statement).digest("hex");
      const checks = await priceWebChecks([{ key, kind: "corridor", providerSlug: slug, providerName: provider.providerName,
        domain: registrableDomain(provider.websiteUrl), statement }]).catch(() => null);
      if (checks?.pending.size) after(() => waitForWebChecks());
      const official = checks?.results.find(check => check.official && check.sourceUrl && check.quote);
      return NextResponse.json({ message, ...(official ? { source: { url: official.sourceUrl, title: official.sourceTitle ?? "Official source" } } : {}) });
    }
    if (quote.basis === "live_public") await savePublicQuoteObservation(result.input, quote);
    return NextResponse.json({ quote });
  } catch {
    return NextResponse.json({ error: "The provider quote check couldn’t finish. Try again shortly." }, { status: 502 });
  }
}
