import { whereAlpha2, whereAlpha3 } from "iso-3166-1";
import data from "./data/world-bank-remittances.json";
import type { PriceCheckInput } from "../pricing.js";

export interface RemittanceSample {
  provider: string;
  sourceCountry: string;
  sourceCountryName: string;
  destinationCountry: string;
  destinationCountryName: string;
  sourceCurrency: string;
  amount: number;
  fee: number;
  fxMarginPct: number | null;
  totalCostPct: number | null;
  transparent: boolean;
  paymentMethod: string;
  pickupMethod: string;
  delivery: string;
  observedAt: string;
}
export interface SurveyProvider { slug: string; name: string; type: string }
export interface RemittanceSurvey {
  period: string;
  sourceUrl: string;
  attribution: string;
  providersTracked: number;
  sampleCount: number;
  destinationCountry: string | null;
  destinationName: string | null;
  destinationOptions: Array<{ code: string; name: string }>;
  providers: SurveyProvider[];
  samples: RemittanceSample[];
}

const samples: RemittanceSample[] = data.samples;
const bySlug = new Map(data.providers.map(provider => [provider.slug, provider]));
const destinations = new Map(samples.map(sample => [sample.destinationCountry, sample.destinationCountryName]));
const destinationOptions = [...destinations].flatMap(([iso3, name]) => {
  // The survey records Kosovo as KSV; XK is the commonly used user-assigned code.
  const code = iso3 === "KSV" ? "XK" : whereAlpha3(iso3)?.alpha2;
  return code ? [{ code, name }] : [];
}).sort((a, b) => a.name.localeCompare(b.name));

/** Sourced discovery entries. They do not establish API access or current business eligibility. */
export function remittanceProviderCatalog(): SurveyProvider[] {
  return data.providers.map(provider => ({ ...provider }));
}

/** A bounded review card for every surveyed provider, with original fee samples. */
export function remittanceProviderDirectory() {
  const recordsByProvider = new Map<string, RemittanceSample[]>();
  for (const sample of samples) {
    const records = recordsByProvider.get(sample.provider) ?? [];
    records.push(sample);
    recordsByProvider.set(sample.provider, records);
  }
  return remittanceProviderCatalog().map(provider => {
    const records = recordsByProvider.get(provider.slug) ?? [];
    const countryExamples = new Map<string, RemittanceSample>();
    for (const sample of records) if (!countryExamples.has(sample.destinationCountryName)) countryExamples.set(sample.destinationCountryName, sample);
    return {
      ...provider, sampleCount: records.length,
      sourceCurrencies: [...new Set(records.map(sample => sample.sourceCurrency))].sort(),
      receivingCountries: [...new Set(records.map(sample => sample.destinationCountryName))].sort(),
      examples: records.slice(0, 2).map(sample => ({ ...sample })),
      countryExamples: [...countryExamples.values()].map(sample => ({ ...sample })),
    };
  });
}

/** Select actual country observations; never infer a destination currency from an FX rate. */
export function remittanceSurvey(input: PriceCheckInput): RemittanceSurvey {
  const country = input.destinationCountry ?? (input.context?.direction === "receive" ? input.context.country : null);
  const iso3 = country?.toUpperCase() === "XK" ? "KSV" : country ? whereAlpha2(country.toUpperCase())?.alpha3 : null;
  const selected = iso3 ? samples.filter(sample => sample.sourceCurrency === input.sourceCurrency.toUpperCase() && sample.destinationCountry === iso3) : [];
  const seen = new Set<string>();
  const unique = selected.filter(sample => {
    const key = JSON.stringify(sample);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    period: data.period, sourceUrl: data.sourceUrl, attribution: data.attribution,
    providersTracked: data.providerEntryCount, sampleCount: samples.length,
    destinationCountry: iso3 ? country!.toUpperCase() : null,
    destinationName: iso3 ? destinations.get(iso3) ?? null : null,
    destinationOptions,
    providers: [...new Set(unique.map(sample => sample.provider))].map(slug => ({ ...bySlug.get(slug)! })).sort((a, b) => a.name.localeCompare(b.name)),
    samples: unique.map(sample => ({ ...sample })),
  };
}
