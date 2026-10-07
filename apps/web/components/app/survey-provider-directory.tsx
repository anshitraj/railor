"use client";

import { useState } from "react";
import { ProviderLogo } from "./provider-logo";
import type { remittanceProviderDirectory } from "@railor/core";

export function SurveyProviderDirectory({ providers }: { providers: ReturnType<typeof remittanceProviderDirectory> }) {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [limit, setLimit] = useState(24);
  const countries = [...new Set(providers.flatMap(provider => provider.receivingCountries))].sort((a, b) => a.localeCompare(b));
  const visible = providers.filter(provider => (!country || provider.receivingCountries.includes(country)) && `${provider.name} ${provider.type} ${provider.sourceCurrencies.join(" ")} ${provider.receivingCountries.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="mt-6 space-y-4">
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,240px)]">
      <label className="block text-[13px] font-semibold">Search surveyed providers or currencies
        <input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(24); }} placeholder="For example: Remitly, USD…" className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3 text-[14px] font-normal" />
      </label>
      <label className="block text-[13px] font-semibold">Receiving country
        <select value={country} onChange={event => { setCountry(event.target.value); setLimit(24); }} className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3 text-[14px] font-normal">
          <option value="">All {countries.length} surveyed countries</option>
          {countries.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
    </div>
    <p role="status" className="text-[12px] text-[var(--color-muted)]">{visible.length} of {providers.length} surveyed provider entries{country ? ` with a fee sample for ${country}` : ""}</p>
    <ul className="grid gap-3 md:grid-cols-2">{visible.slice(0, limit).map(provider => {
      const example = country ? provider.countryExamples.find(sample => sample.destinationCountryName === country) : provider.examples[0];
      const examples = country ? (example ? [example] : []) : provider.examples;
      return <li key={provider.slug} className="min-w-0 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center gap-3"><ProviderLogo slug={provider.slug} name={provider.name} size={32} /><div className="min-w-0"><h2 className="break-words text-[14px] font-semibold">{provider.name}</h2><p className="text-[11px] text-[var(--color-muted)]">{provider.type} · {provider.sampleCount} price samples</p></div></div>
      <p className="mt-3 text-[12px] text-[var(--color-muted)]">Surveyed from {provider.sourceCurrencies.join(", ")}</p>
      {example ? <p className="mt-2 text-[12px]">Example: {example.amount.toLocaleString("en-US")} {example.sourceCurrency} sent · <strong>{example.fee.toLocaleString("en-US")} {example.sourceCurrency} fee</strong><span className="block text-[10px] text-[var(--color-muted)]">{example.sourceCountryName} → {example.destinationCountryName} · Collected {example.observedAt}</span></p> : null}
      <details className="mt-3 text-[12px]"><summary className="cursor-pointer font-semibold text-[var(--color-orange-deep)]">View historical fee examples</summary>
        <ul className="mt-2 space-y-3">{examples.map((sample, index) => <li key={index} className="border-t border-[var(--color-line)] pt-3">
          <p>{sample.sourceCountryName} → {sample.destinationCountryName}</p>
          <p className="mt-1">Surveyed {sample.amount.toLocaleString("en-US")} {sample.sourceCurrency} · <strong>Fee {sample.fee.toLocaleString("en-US")} {sample.sourceCurrency}</strong></p>
          <p className="mt-1 text-[var(--color-muted)]">FX margin {sample.fxMarginPct === null ? "not disclosed" : `${sample.fxMarginPct}%`} · Total cost {sample.totalCostPct === null ? "not disclosed" : `${sample.totalCostPct}%`}</p>
          <p className="mt-1 text-[11px] text-[var(--color-muted)]">{sample.paymentMethod} → {sample.pickupMethod || "Method not specified"} · Collected {sample.observedAt}</p>
        </li>)}</ul>
        <p className="mt-3 text-[11px] text-[var(--color-muted)]">Receiving countries surveyed: {provider.receivingCountries.join(", ")}. These samples do not establish current business eligibility or destination payout currency.</p>
      </details>
    </li>; })}</ul>
    {!visible.length ? <p className="text-[14px] text-[var(--color-muted)]">No surveyed providers match this search.</p> : null}
    {visible.length > limit ? <button type="button" onClick={() => setLimit(value => value + 48)} className="rounded-full border border-[var(--color-line)] px-4 py-2 text-[13px] font-semibold">Show more ({visible.length - limit} remaining)</button> : null}
  </div>;
}
