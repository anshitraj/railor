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

export interface RemittanceCostBenchmarks {
  period: string;
  sourceUrl: string;
  attribution: string;
  /** Median total cost (fee plus exchange-rate margin) of a transfer sent through a bank. */
  bankPct: number;
  /** The same for money transfer operators (apps and transfer companies). */
  operatorPct: number;
  /** Median cost of the cheapest service in each corridor and amount the survey priced at least three times. */
  cheapestPct: number;
  corridors: number;
}

let benchmarks: RemittanceCostBenchmarks | null = null;
const medianOf = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/**
 * What sending money abroad usually costs, by who sends it, from the World
 * Bank's survey: banks, transfer operators, and the cheapest option on each
 * route. These are the figures behind "do the maths" on the home page.
 */
export function remittanceCostBenchmarks(): RemittanceCostBenchmarks {
  if (benchmarks) return benchmarks;
  const typeOf = new Map(data.providers.map((provider) => [provider.slug, provider.type]));
  const bank: number[] = [];
  const operator: number[] = [];
  const groups = new Map<string, number[]>();
  for (const sample of samples) {
    if (sample.totalCostPct === null) continue;
    const type = typeOf.get(sample.provider);
    if (type === "Bank") bank.push(sample.totalCostPct);
    if (type === "Money Transfer Operator") operator.push(sample.totalCostPct);
    const key = `${sample.sourceCountry}:${sample.destinationCountry}:${sample.amount}`;
    groups.set(key, [...(groups.get(key) ?? []), sample.totalCostPct]);
  }
  const cheapest = [...groups.values()].filter((costs) => costs.length >= 3).map((costs) => Math.min(...costs));
  const round = (value: number) => Math.round(value * 100) / 100;
  benchmarks = {
    period: data.period,
    sourceUrl: data.sourceUrl,
    attribution: data.attribution,
    bankPct: round(medianOf(bank)),
    operatorPct: round(medianOf(operator)),
    cheapestPct: round(medianOf(cheapest)),
    corridors: cheapest.length,
  };
  return benchmarks;
}
