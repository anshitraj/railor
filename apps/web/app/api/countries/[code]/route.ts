import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { countries, ensureMigrated, getDb } from "@railor/database";
import { loadCountryFactSources, loadCountryProfile, loadCountrySources } from "@railor/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ code: string }> };

/**
 * GET /api/countries/:code — reads the country_profiles/country_sources
 * tables only. Never calls Tavily or Gemini; if a country hasn't been
 * researched yet this returns a distinct 404, never a fabricated all-null
 * profile.
 */
export async function GET(_request: Request, { params }: Params) {
  const { code: raw } = await params;
  const code = raw.trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(code)) {
    return NextResponse.json({ error: "invalid_country_code", message: "Country code must be a 2-letter ISO 3166-1 alpha-2 code." }, { status: 400 });
  }

  await ensureMigrated();
  const db = await getDb();

  const [country] = await db.select().from(countries).where(eq(countries.code, code)).limit(1);
  if (!country) {
    return NextResponse.json({ error: "unknown_country", message: `${code} is not a country Railor recognizes.` }, { status: 404 });
  }

  const profile = await loadCountryProfile(code);
  if (!profile) {
    return NextResponse.json(
      {
        error: "not_yet_researched",
        message: `${country.name} (${code}) hasn't been researched yet.`,
        country: { iso2: country.code, name: country.name, region: country.region },
      },
      { status: 404 },
    );
  }

  const [sources, factSources] = await Promise.all([loadCountrySources(code), loadCountryFactSources(code)]);

  return NextResponse.json({
    profile,
    sources,
    factSources,
  });
}
