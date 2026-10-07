"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { RemittanceSurvey } from "@railor/core";
import { ProviderLogo } from "./provider-logo";

const money = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Public survey evidence, kept apart from live amounts and the price ranking. */
export function RemittanceSurveyPanel({ survey, sourceCurrency }: { survey: RemittanceSurvey; sourceCurrency: string }) {
  const [current, setCurrent] = useState(survey);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(8);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    controller.current?.abort(); setCurrent(survey); setLimit(8); setError(""); setLoading(false);
    return () => controller.current?.abort();
    // A quote refresh must not reset the country the visitor is exploring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceCurrency, survey.destinationCountry]);
  async function selectCountry(country: string) {
    controller.current?.abort();
    const ctl = new AbortController(); controller.current = ctl;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/prices/survey?${new URLSearchParams({ from: sourceCurrency, country })}`, { signal: ctl.signal });
      if (!response.ok) throw new Error("Could not load the survey. Please try again.");
      const next = await response.json() as RemittanceSurvey;
      setCurrent(next); setLimit(8);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      if (controller.current === ctl) setLoading(false);
    }
  }
  const providers = current.providers.filter(provider => `${provider.name} ${provider.type}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="rounded-2xl border border-white/10 p-3" aria-label="Historical remittance fee samples" aria-busy={loading}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-[13px] font-semibold text-white">Historical fee samples</h3>
      <span className="rounded-md bg-amber-300/15 px-2 py-1 text-[10px] font-bold text-amber-200">Survey · {current.period}</span>
    </div>
    <p className="mt-2 text-[11px] leading-relaxed text-white/55">{current.providersTracked} surveyed provider entries · {current.sampleCount.toLocaleString("en-US")} fee samples. Consumer remittances at the original amounts below; these are not current {sourceCurrency} quotes or prices for your business.</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <label className="text-[11px] text-white/60">Receiving country
        <select aria-label="Receiving country" value={current.destinationCountry ?? ""} onChange={e => void selectCountry(e.target.value)} disabled={loading} className="mt-1 block w-full min-w-0 rounded-lg border border-white/15 bg-[#262522] px-2 py-2 text-[12px] text-white">
          <option value="" disabled>Select a country</option>
          {current.destinationOptions.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}
        </select>
      </label>
      <label className="text-[11px] text-white/60">Find a sampled provider
        <input type="search" value={query} onChange={e => { setQuery(e.target.value); setLimit(8); }} placeholder="Search providers…" className="mt-1 block w-full min-w-0 rounded-lg border border-white/15 bg-white/[0.04] px-2 py-2 text-[12px] text-white placeholder:text-white/35" />
      </label>
    </div>
    {error ? <p role="alert" className="mt-2 text-[12px] text-amber-200">{error}</p> : null}
    <p role="status" className="mt-3 text-[11px] text-white/55">{loading ? "Loading survey…" : current.destinationName ? `${providers.length} providers sampled from ${sourceCurrency} into ${current.destinationName}. Destination payout currency is not specified in this dataset.` : "Select a receiving country to see its surveyed fees."}</p>
    <ul className="mt-3 space-y-2">
      {providers.slice(0, limit).map(provider => {
        const samples = current.samples.filter(sample => sample.provider === provider.slug);
        const example = samples[0]!;
        return <li key={provider.slug} className="rounded-xl border border-white/10 p-3">
          <div className="flex items-center gap-2"><ProviderLogo slug={provider.slug} name={provider.name} size={28} /><div className="min-w-0"><p className="break-words text-[12px] font-semibold text-white">{provider.name}</p><p className="text-[10px] text-white/45">{provider.type} · {samples.length} samples</p></div></div>
          <div className="mt-3 flex flex-wrap justify-between gap-2 text-[12px]"><span className="text-white/65">Surveyed {money(example.amount)} {example.sourceCurrency}</span><span className="font-semibold text-white">Fee {money(example.fee)} {example.sourceCurrency}</span></div>
          <p className="mt-1 text-[11px] text-white/65">FX margin {example.fxMarginPct === null ? "not disclosed" : `${money(example.fxMarginPct)}%`} · Total cost {example.totalCostPct === null ? "not disclosed" : `${money(example.totalCostPct)}%`}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-white/45">From {example.sourceCountryName} · {example.paymentMethod} → {example.pickupMethod || "Method not specified"} · Collected {example.observedAt}</p>
          {samples.length > 1 ? <details className="mt-2">
            <summary className="cursor-pointer text-[11px] font-semibold text-[#ffad8c]">View {samples.length - 1} more surveyed fee samples</summary>
            <ul className="mt-2 space-y-3">{samples.slice(1).map((sample, index) => <li key={index} className="border-t border-white/10 pt-2">
              <div className="flex flex-wrap justify-between gap-2 text-[12px]"><span className="text-white/65">Surveyed {money(sample.amount)} {sample.sourceCurrency}</span><span className="font-semibold text-white">Fee {money(sample.fee)} {sample.sourceCurrency}</span></div>
              <p className="mt-1 text-[11px] text-white/65">FX margin {sample.fxMarginPct === null ? "not disclosed" : `${money(sample.fxMarginPct)}%`} · Total cost {sample.totalCostPct === null ? "not disclosed" : `${money(sample.totalCostPct)}%`}</p>
              <p className="mt-1 text-[10px] leading-relaxed text-white/45">From {sample.sourceCountryName} · {sample.paymentMethod} → {sample.pickupMethod || "Method not specified"}<br />{sample.delivery} · Collected {sample.observedAt}</p>
            </li>)}</ul>
          </details> : null}
        </li>;
      })}
    </ul>
    {!loading && current.destinationName && !providers.length ? <p className="mt-3 text-[12px] text-white/50">No matching {sourceCurrency} samples in this quarter. Try another provider search or receiving country.</p> : null}
    {providers.length > limit ? <button type="button" onClick={() => setLimit(value => value + 12)} className="mt-3 rounded-full border border-white/15 px-3 py-2 text-[11px] font-semibold text-white">Show more providers ({providers.length - limit} remaining)</button> : null}
    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-white/10 pt-3 text-[10px] text-white/45">
      <a href={current.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline">{current.attribution} · CC BY 4.0</a>
      <Link href="/providers" className="font-semibold text-[#ffad8c]">Browse all {current.providersTracked} surveyed providers ↗</Link>
    </div>
  </section>;
}
