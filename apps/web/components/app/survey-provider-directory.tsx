"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ProviderLogo } from "./provider-logo";
import type { remittanceProviderDirectory } from "@railor/core";

/** The survey's provider types, in words people use. */
const TYPE_LABEL: Record<string, string> = {
  "Money Transfer Operator": "Money transfer service",
  Bank: "Bank",
  "Bank / Money Transfer Operator": "Bank and money transfer",
  "Money Transfer Operator / Post Office": "Money transfer and post office",
  "Post Office": "Post office",
  "Mobile Operator": "Mobile money",
};

type Provider = ReturnType<typeof remittanceProviderDirectory>[number];

/**
 * Every provider in the World Bank survey. Most-surveyed first (the ones
 * people are most likely to meet), searchable by name, currency or country.
 */
export function SurveyProviderDirectory({ providers }: { providers: Provider[] }) {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [sort, setSort] = useState<"popular" | "name">("popular");
  const [limit, setLimit] = useState(24);
  const countries = useMemo(() => [...new Set(providers.flatMap((provider) => provider.receivingCountries))].sort((a, b) => a.localeCompare(b)), [providers]);
  const visible = useMemo(() => providers
    .filter((provider) => (!country || provider.receivingCountries.includes(country)) && `${provider.name} ${provider.type} ${provider.sourceCurrencies.join(" ")} ${provider.receivingCountries.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (sort === "popular" ? b.sampleCount - a.sampleCount || a.name.localeCompare(b.name) : a.name.localeCompare(b.name))), [providers, query, country, sort]);
  const reset = () => setLimit(24);

  return (
    <div className="mt-6 space-y-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_180px]">
        <label className="relative block">
          <span className="sr-only">Search providers, currencies or countries</span>
          <Search size={17} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-faint)]" />
          <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); reset(); }} placeholder="Search a provider, currency or country" className="h-12 w-full rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] pl-11 pr-4 text-[16px] outline-none focus:border-[var(--color-ink)]" />
        </label>
        <label className="block">
          <span className="sr-only">Receiving country</span>
          <select value={country} onChange={(event) => { setCountry(event.target.value); reset(); }} className="h-12 w-full rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 text-[15px]">
            <option value="">All {countries.length} countries</option>
            {countries.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Sort providers</span>
          <select value={sort} onChange={(event) => { setSort(event.target.value as "popular" | "name"); reset(); }} className="h-12 w-full rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 text-[15px]">
            <option value="popular">Most surveyed first</option>
            <option value="name">A to Z</option>
          </select>
        </label>
      </div>
      <p role="status" className="text-[13.5px] text-[var(--color-muted)]">{visible.length === providers.length ? `${providers.length} providers` : `${visible.length} of ${providers.length} providers`}{country ? ` with a fee sample for ${country}` : ""}</p>
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {visible.slice(0, limit).map((provider) => {
          const example = country ? provider.countryExamples.find((sample) => sample.destinationCountryName === country) : provider.examples[0];
          const examples = country ? (example ? [example] : []) : provider.examples;
          const type = TYPE_LABEL[provider.type] ?? provider.type;
          return (
            <li key={provider.slug} className="flex min-w-0 flex-col gap-3 rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
              <div className="flex items-center gap-3">
                <ProviderLogo slug={provider.slug} name={provider.name} size={36} />
                <div className="min-w-0">
                  <h3 className="break-words text-[15.5px] font-[650]">{provider.name}</h3>
                  <p className="text-[12.5px] text-[var(--color-muted)]">{type} · sends from {provider.sourceCurrencies.slice(0, 3).join(", ")}{provider.sourceCurrencies.length > 3 ? ` +${provider.sourceCurrencies.length - 3}` : ""}</p>
                </div>
              </div>
              {example ? (
                <div className="rounded-2xl bg-[var(--color-canvas)] px-4 py-3">
                  <p className="text-[12px] font-semibold text-[var(--color-muted)]">Example fee</p>
                  <p className="mt-0.5 text-[15px] font-[650] text-[var(--color-ink)]">{example.fee.toLocaleString("en-US")} {example.sourceCurrency} <span className="text-[13px] font-medium text-[var(--color-muted)]">on {example.amount.toLocaleString("en-US")} {example.sourceCurrency}</span></p>
                  <p className="mt-0.5 text-[12px] text-[var(--color-muted)]">{example.sourceCountryName} → {example.destinationCountryName} · {example.observedAt}</p>
                </div>
              ) : null}
              <details className="text-[13px]">
                <summary className="cursor-pointer font-semibold text-[var(--color-orange-deep)]">More fee samples ({provider.sampleCount})</summary>
                <ul className="mt-2 space-y-3">
                  {examples.map((sample, index) => (
                    <li key={index} className="border-t border-[var(--color-line)] pt-3">
                      <p className="font-medium">{sample.sourceCountryName} → {sample.destinationCountryName}</p>
                      <p className="mt-1">Sent {sample.amount.toLocaleString("en-US")} {sample.sourceCurrency} · fee {sample.fee.toLocaleString("en-US")} {sample.sourceCurrency}</p>
                      <p className="mt-1 text-[var(--color-muted)]">Exchange-rate margin {sample.fxMarginPct === null ? "not disclosed" : `${sample.fxMarginPct}%`} · total cost {sample.totalCostPct === null ? "not disclosed" : `${sample.totalCostPct}%`}</p>
                      <p className="mt-1 text-[12px] text-[var(--color-muted)]">{sample.paymentMethod} → {sample.pickupMethod || "method not stated"} · {sample.observedAt}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[12px] text-[var(--color-muted)]">Surveyed in: {provider.receivingCountries.join(", ")}. Dated samples — not a current quote or an eligibility check.</p>
              </details>
            </li>
          );
        })}
      </ul>
      {!visible.length ? <p className="rounded-2xl border border-dashed border-[var(--color-line-strong)] p-6 text-[14px] text-[var(--color-muted)]">No provider matches “{query}”{country ? ` in ${country}` : ""}. Try a currency code like USD, or clear the country filter.</p> : null}
      {visible.length > limit ? <button type="button" onClick={() => setLimit((value) => value + 48)} className="press mx-auto flex h-11 items-center rounded-full border border-[var(--color-line-strong)] px-5 text-[14px] font-semibold hover:border-[var(--color-ink)]">Show more ({visible.length - limit} more)</button> : null}
    </div>
  );
}
