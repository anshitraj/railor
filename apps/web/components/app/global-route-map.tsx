"use client";

import { useMemo, useOptimistic, useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownWideNarrow, ArrowRight, ArrowUpRight, ChevronDown, Globe2, Search, X } from "lucide-react";
import { Flag } from "@railor/ui";
import { COUNTRY_CENTROIDS } from "@railor/core/geo";
import type { GlobalRoute } from "@railor/core/route-map";
import { ProviderLogo } from "./provider-logo";
import { RouteGlobe, routeKey } from "./route-globe";
import styles from "./global-route-map.module.css";

export interface GlobalRouteMapProps {
  routes: GlobalRoute[];
  countries: Array<{ code: string; name: string }>;
  preset: string;
  presets: Array<{ value: string; label: string }>;
  providersChecked: number;
  cheapestOverall: GlobalRoute | null;
}

const PAGE_SIZE = 12;
const fee = (bps: number) => (bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "%";

export function matchesRouteSearch(query: string, origin: string, destination: string) {
  const [from, to] = query.trim().toLowerCase().split(/\s*(?:→|->)\s*|\s+to\s+/, 2);
  const includes = (text: string, terms: string) => terms.split(/\s+/).every(term => text.includes(term));
  const source = origin.toLowerCase();
  const target = destination.toLowerCase();
  return to === undefined ? includes(source + " " + target, from ?? "") : includes(source, from ?? "") && includes(target, to);
}

function featuredRoutes(routes: GlobalRoute[], limit: number): GlobalRoute[] {
  const remaining = routes.filter(route => route.entityCountry !== route.destinationCountry);
  const featured: GlobalRoute[] = [];
  const places = new Set<string>();

  while (featured.length < limit && remaining.length) {
    let bestIndex = 0;
    let bestScore = -1;
    for (const [index, route] of remaining.entries()) {
      const score = Number(!places.has(route.entityCountry)) + Number(!places.has(route.destinationCountry));
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    }
    const [route] = remaining.splice(bestIndex, 1);
    if (!route) break;
    featured.push(route);
    places.add(route.entityCountry);
    places.add(route.destinationCountry);
  }
  return featured;
}

export function GlobalRouteMap({ routes, countries, preset, presets, providersChecked, cheapestOverall }: GlobalRouteMapProps) {
  const router = useRouter();
  const [pending, transition] = useTransition();
  const [sortValue, setSortValue] = useOptimistic(preset);
  const [focus, setFocus] = useState<string | null>(null);
  const [pricedOnly, setPricedOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [selection, setSelection] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const labels = useMemo(() => new Map(countries.map(country => [country.code, country.name])), [countries]);
  const name = (code: string) => labels.get(code) ?? code;

  const visible = useMemo(() => routes.filter(route =>
    (!pricedOnly || route.cheapest) && (!focus || route.entityCountry === focus || route.destinationCountry === focus)),
  [routes, focus, pricedOnly]);
  const searchResults = useMemo(() => {
    const results = visible.filter(route => matchesRouteSearch(query,
      route.entityCountry + " " + (labels.get(route.entityCountry) ?? ""),
      route.destinationCountry + " " + (labels.get(route.destinationCountry) ?? "")));
    return results.sort((a, b) => {
      if (preset === "cheapest") {
        const priceOrder = (a.cheapest?.feeBps ?? Infinity) - (b.cheapest?.feeBps ?? Infinity);
        if (priceOrder) return priceOrder;
      }
      if (preset !== "balanced") {
        const scoreOrder = (b.rankScore ?? -Infinity) - (a.rankScore ?? -Infinity);
        if (scoreOrder) return scoreOrder;
      }
      return b.supported - a.supported || b.conditional - a.conditional;
    });
  }, [visible, query, labels, preset]);
  const selected = searchResults.find(route => routeKey(route) === selection) ?? null;

  const mapped = useMemo(() => {
    const drawable = searchResults.filter(route => COUNTRY_CENTROIDS[route.entityCountry] && COUNTRY_CENTROIDS[route.destinationCountry]);
    if (showAll) return drawable;
    const overview = featuredRoutes(drawable, focus ? 24 : 15);
    if (selected && !overview.includes(selected) && COUNTRY_CENTROIDS[selected.entityCountry] && COUNTRY_CENTROIDS[selected.destinationCountry]) {
      return [...overview, selected];
    }
    if (!overview.length) return drawable.slice(0, 15);
    return overview;
  }, [searchResults, showAll, focus, selected]);

  const lowestFee = searchResults.reduce<GlobalRoute | null>((best, route) =>
    route.cheapest && (!best?.cheapest || route.cheapest.feeBps < best.cheapest.feeBps) ? route : best,
  null);
  const highlight = lowestFee ?? (!query.trim() && !focus && !pricedOnly ? cheapestOverall : null);

  function toggleFocus(code: string) {
    setFocus(value => value === code ? null : code);
    setSelection(null);
    setLimit(PAGE_SIZE);
  }

  function selectRoute(key: string) {
    setSelection(key);
  }

  return (
    <section className={styles.page} aria-labelledby="route-map-title">
      <header className={styles.heading}>
        <div>
          <h1 id="route-map-title">Route map</h1>
          <p>Explore business payment corridors and the providers that can serve them.</p>
        </div>
        <dl className={styles.totals}>
          <div><dt>Corridors</dt><dd>{routes.length.toLocaleString("en-US")}</dd></div>
          <div><dt>Providers checked</dt><dd>{providersChecked.toLocaleString("en-US")}</dd></div>
        </dl>
      </header>

      <div className={styles.controls}>
        <label className={styles.sort}>
          <ArrowDownWideNarrow size={16} aria-hidden />
          <span>Sort by</span>
          <span className={styles.select}>
            <select
              value={sortValue}
              disabled={pending}
              onChange={event => {
                const nextPreset = event.target.value;
                transition(() => {
                  setSortValue(nextPreset);
                  router.replace("/app/map?" + new URLSearchParams({ preset: nextPreset }), { scroll: false });
                });
              }}
            >
              {presets.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <ChevronDown size={14} aria-hidden />
          </span>
        </label>
        <label className={styles.feeFilter}>
          <input type="checkbox" checked={pricedOnly} onChange={event => { setPricedOnly(event.target.checked); setLimit(PAGE_SIZE); }} />
          <span>Published fees only</span>
        </label>
        {focus ? <button type="button" className={styles.filter} onClick={() => toggleFocus(focus)}>
          <Flag code={focus} size={15} /> {name(focus)} <X size={14} aria-label="Remove country filter" />
        </button> : null}
      </div>

      <div className={styles.workspace} aria-busy={pending}>
        <div className={styles.visual}>
          <div className={styles.visualHeader}>
            <div>
              <h2><Globe2 size={16} aria-hidden /> {focus ? name(focus) + " corridors" : "Global corridors"}</h2>
              <p>{mapped.length.toLocaleString("en-US")} of {searchResults.length.toLocaleString("en-US")} shown on the globe</p>
            </div>
            <button className={styles.mapButton} type="button" aria-pressed={showAll} onClick={() => setShowAll(value => !value)}>
              {showAll ? "Show overview" : "Show all routes"}
            </button>
          </div>
          <RouteGlobe routes={mapped} selected={selected} focus={focus} onRoute={selectRoute} onCountry={toggleFocus} />
          <div className={styles.legend}>
            <span><i /> Has a published fee</span>
            <span><i /> Coverage only</span>
            <span className={styles.dragHint}>Drag to rotate</span>
          </div>
        </div>

        <aside className={styles.sidebar} aria-label="Route explorer">
          <div className={styles.finder}>
            <h2>Find a route</h2>
            <div className={styles.search}>
              <Search size={16} aria-hidden />
              <input aria-label="Search routes by country" placeholder="Search countries" value={query} onChange={event => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} />
              {query ? <button type="button" aria-label="Clear route search" onClick={() => { setQuery(""); setLimit(PAGE_SIZE); }}><X size={15} /></button> : null}
            </div>
            <p className={styles.resultCount} role="status">{searchResults.length.toLocaleString("en-US")} {searchResults.length === 1 ? "match" : "matches"}</p>
          </div>
          <div className={styles.results} tabIndex={searchResults.length > 4 ? 0 : undefined} aria-label="Matching routes">
            {searchResults.length ? <>
              <ul>
                {searchResults.slice(0, limit).map(route => {
                  const key = routeKey(route);
                  const active = selected && routeKey(selected) === key;
                  return <li key={key}>
                    <button className={styles.route} type="button" aria-pressed={Boolean(active)} onClick={() => selectRoute(key)}>
                      <span className={styles.flags}><Flag code={route.entityCountry} size={20} round /><Flag code={route.destinationCountry} size={20} round /></span>
                      <span className={styles.routeText}><strong>{name(route.entityCountry)} <ArrowRight size={12} aria-hidden /> {name(route.destinationCountry)}</strong><small>{route.supported ? route.supported + (route.supported === 1 ? " provider" : " providers") : "Eligibility checks required"}</small></span>
                      <span className={styles.routeFee}>{route.cheapest ? fee(route.cheapest.feeBps) : <ArrowRight size={15} aria-hidden />}</span>
                    </button>
                  </li>;
                })}
              </ul>
              {searchResults.length > limit ? <button type="button" className={styles.more} onClick={() => setLimit(value => value + PAGE_SIZE)}>Show more routes <ChevronDown size={14} /></button> : null}
            </> : <p className={styles.empty}>No routes match your filters.</p>}
          </div>

          {selected ? (
            <section aria-label="Selected route" className={styles.details} key={routeKey(selected) + preset}>
              <div className={styles.selectedHeading}>
                <h2>{name(selected.entityCountry)} <ArrowRight size={15} aria-hidden /> {name(selected.destinationCountry)}</h2>
                <button type="button" aria-label="Clear selected route" onClick={() => setSelection(null)}><X size={17} /></button>
              </div>
              <p className={styles.routeStats}>
                {selected.supported} supported{selected.conditional ? " · " + selected.conditional + " need additional checks" : ""}
              </p>
              <ul className={styles.providers} aria-label="Ranked providers" tabIndex={selected.providers.length > 3 ? 0 : undefined}>
                {selected.providers.map((provider, index) => (
                  <li className={styles.provider} key={provider.slug} style={{ "--enter-delay": Math.min(index, 5) * 48 + "ms" } as CSSProperties}>
                    <ProviderLogo slug={provider.slug} name={provider.name} size={28} loading="eager" />
                    <span><strong>{provider.name}</strong><small>{provider.status === "supported" ? "Documented coverage" : "Additional checks"}</small></span>
                    {provider.feeBps !== null ? <span className={styles.providerFee}>{fee(provider.feeBps)}<small>Published fee</small></span> : null}
                  </li>
                ))}
              </ul>
              <Link href={"/app/corridors?" + new URLSearchParams({ route: JSON.stringify({ entityCountry: selected.entityCountry, destinationCountry: selected.destinationCountry, customerType: "business" }), preset })} className={styles.detailLink}>
                View all providers and terms <ArrowUpRight size={16} aria-hidden />
              </Link>
            </section>
          ) : (
            <div className={styles.details}>
              {highlight?.cheapest ? <button type="button" className={styles.highlight} onClick={() => selectRoute(routeKey(highlight))}>
                <span><small>Lowest published provider fee</small><strong>{name(highlight.entityCountry)} → {name(highlight.destinationCountry)}</strong></span>
                <span>{fee(highlight.cheapest.feeBps)} <ArrowUpRight size={14} aria-hidden /></span>
              </button> : <p className={styles.empty}>Select a route to see providers and fee information.</p>}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
