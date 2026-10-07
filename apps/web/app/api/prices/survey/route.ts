import { NextRequest, NextResponse } from "next/server";
import { remittanceSurvey } from "@railor/core";
import { consumeLimit, requestIdentity } from "../../../../lib/rate-limit";

export async function GET(request: NextRequest) {
  if (!await consumeLimit("price-survey", requestIdentity(request), 120, 60000)) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  const from = request.nextUrl.searchParams.get("from")?.toUpperCase() ?? "";
  const country = request.nextUrl.searchParams.get("country")?.toUpperCase() ?? "";
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{2}$/.test(country)) return NextResponse.json({ error: "Choose a currency and country." }, { status: 400 });
  const survey = remittanceSurvey({ sourceCurrency: from, destinationCurrency: "USD", destinationCountry: country, amount: 1 });
  if (!survey.destinationCountry) return NextResponse.json({ error: "Unknown country." }, { status: 400 });
  return NextResponse.json(survey, { headers: { "Cache-Control": "public, max-age=3600" } });
}
