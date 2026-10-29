"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { Card, Chip, Flag, SectionLabel } from "@railor/ui";
// Keep the client bundle away from the @railor/core server barrel.
import { MAP_HEIGHT, MAP_WIDTH, projectCountry } from "@railor/core/geo";
import type { GlobalRoute } from "@railor/core/route-map";
import { WORLD_LAND_PATHS } from "./world-land-paths";
import styles from "./global-route-map.module.css";

export interface MapCountry {
  code: string;
  name: string;
  flag: string;
}

export interface GlobalRouteMapProps {
  routes: GlobalRoute[];
  countries: MapCountry[];
  preset: string;
  presets: Array<{ value: string; label: string }>;
  providersChecked: number;
  cheapestOverall: GlobalRoute | null;
}

const OVERVIEW_LIMIT = 18;
const FOCUSED_LIMIT = 28;
const GRATICULE_LNG = [-120, -60, 0, 60, 120];
const GRATICULE_LAT = [60, 30, 0, -30];
const routeKey = (route: GlobalRoute) => `${route.entityCountry}->${route.destinationCountry}`;

function featuredRoutes(routes: GlobalRoute[], limit: number): GlobalRoute[] {
  if (routes.length <= limit) return routes;
  const remaining = [...routes].sort((a, b) => b.supported - a.supported);
  const countries = new Set<string>();
  const featured: GlobalRoute[] = [];

  // Spread the overview across the world before filling it with the strongest corridors.
  while (featured.length < limit && remaining.length) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const route = remaining[i]!;
      const newPlaces = Number(!countries.has(route.entityCountry)) + Number(!countries.has(route.destinationCountry));
      const score = newPlaces * 1000 + route.supported;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    const route = remaining.splice(bestIndex, 1)[0]!;
    featured.push(route);
    countries.add(route.entityCountry);
    countries.add(route.destinationCountry);
  }
  return featured;
}

function routePaths(from: { x: number; y: number }, to: { x: number; y: number }): string[] {
  let targetX = to.x;
  if (targetX - from.x > MAP_WIDTH / 2) targetX -= MAP_WIDTH;
  if (from.x - targetX > MAP_WIDTH / 2) targetX += MAP_WIDTH;
  const midX = (from.x + targetX) / 2;
  const lift = Math.min(62, Math.abs(targetX - from.x) * 0.16 + 8);
  const midY = (from.y + to.y) / 2 - lift;
  const path = (offset: number) =>
    `M ${from.x + offset} ${from.y} Q ${midX + offset} ${midY} ${targetX + offset} ${to.y}`;
  if (targetX < 0) return [path(0), path(MAP_WIDTH)];
  if (targetX > MAP_WIDTH) return [path(0), path(-MAP_WIDTH)];
  return [path(0)];
}

export function GlobalRouteMap({
  routes,
  countries,
  preset,
  presets,
  providersChecked,
  cheapestOverall,
}: GlobalRouteMapProps) {
  const [focus, setFocus] = useState<string | null>(null);
  const [pricedOnly, setPricedOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const byCode = useMemo(() => new Map(countries.map((country) => [country.code, country])), [countries]);
  const label = (code: string) => byCode.get(code)?.name ?? code;

  const visible = useMemo(
    () => routes.filter((route) =>
      (!pricedOnly || Boolean(route.cheapest)) &&
      (!focus || route.entityCountry === focus || route.destinationCountry === focus)),
    [routes, focus, pricedOnly],
  );
  const selectedRoute = visible.find((route) => routeKey(route) === selected) ?? null;
  const mapped = useMemo(() => {
    const drawable = visible.filter((route) =>
      route.entityCountry !== route.destinationCountry &&
      projectCountry(route.entityCountry) &&
      projectCountry(route.destinationCountry));
    if (showAll) return drawable;
    const overview = featuredRoutes(drawable, focus ? FOCUSED_LIMIT : OVERVIEW_LIMIT);
    const picked = drawable.find((route) => routeKey(route) === selected);
    return picked && !overview.includes(picked) ? [...overview, picked] : overview;
  }, [visible, focus, showAll, selected]);

  const nodes = useMemo(() => {
    const acc = new Map<string, { code: string; count: number }>();
    for (const route of mapped) {
      for (const code of [route.entityCountry, route.destinationCountry]) {
        acc.set(code, { code, count: (acc.get(code)?.count ?? 0) + 1 });
      }
    }
    return [...acc.values()]
      .map((node) => ({ ...node, point: projectCountry(node.code) }))
      .filter((node): node is typeof node & { point: { x: number; y: number } } => node.point !== null);
  }, [mapped]);

  const labeled = useMemo(() => {
    const chosen: typeof nodes = [];
    const priority = [...nodes].sort((a, b) =>
      Number(b.code === focus) - Number(a.code === focus) ||
      Number(b.code === selectedRoute?.entityCountry || b.code === selectedRoute?.destinationCountry) -
        Number(a.code === selectedRoute?.entityCountry || a.code === selectedRoute?.destinationCountry) ||
      b.count - a.count);
    for (const node of priority) {
      if (chosen.length >= 9) break;
      if (chosen.every((other) => Math.hypot(node.point.x - other.point.x, node.point.y - other.point.y) > 54)) {
        chosen.push(node);
      }
    }
    return new Set(chosen.map((node) => node.code));
  }, [nodes, focus, selectedRoute]);

  const searchResults = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return [...visible]
      .filter((route) => {
        const searchable = `${route.entityCountry} ${label(route.entityCountry)} ${route.destinationCountry} ${label(route.destinationCountry)}`.toLowerCase();
        return terms.every((term) => searchable.includes(term));
      })
      .sort((a, b) => b.supported - a.supported);
  }, [visible, query, byCode]);

  const cheapestVisible = useMemo(() => {
    const priced = visible.filter((route) => route.cheapest);
    return priced.length
      ? priced.reduce((min, route) => route.cheapest!.feeBps < min.cheapest!.feeBps ? route : min)
      : null;
  }, [visible]);
  const undrawable = visible.filter((route) =>
    !projectCountry(route.entityCountry) || !projectCountry(route.destinationCountry)).length;

  const selectRoute = (route: GlobalRoute) => {
    setSelected(routeKey(route));
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="workspace-heading flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="product-eyebrow">Coverage atlas</span>
          <h1 className="font-semibold tracking-tight">Global route map</h1>
          <p className="text-[14px] text-[var(--color-muted)]">
            Explore {routes.length} supported corridors across {providersChecked} mapped providers.
          </p>
        </div>
      </div>

      <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <SectionLabel className="mr-1 shrink-0">Rank by</SectionLabel>
          {presets.map((option) => (
            <Link key={option.value} href={`/app/map?preset=${option.value}`} scroll={false}>
              <Chip active={preset === option.value} className="text-[13px]">{option.label}</Chip>
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden h-5 w-px bg-[var(--color-line)] lg:block" aria-hidden />
          <Chip
            active={pricedOnly}
            onClick={() => { setPricedOnly(!pricedOnly); setSelected(null); }}
            className="text-[13px]"
            title="Only routes where at least one provider publishes a fee Railor can compare"
          >
            Comparable pricing only
          </Chip>
          {focus ? (
            <Chip active onClick={() => { setFocus(null); setSelected(null); }} className="text-[13px]">
              <Flag code={focus} size={13} /> {label(focus)} <X size={12} aria-hidden />
            </Chip>
          ) : null}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line)] px-5 py-4">
          <div>
            <p className="font-display text-[17px] font-semibold tracking-tight text-[var(--color-ink)]">Routes across the world</p>
            <p className="mt-0.5 text-[12px] text-[var(--color-muted)]">
              {showAll ? "All drawable corridors" : focus ? `Routes touching ${label(focus)}` : "A geographic overview of the strongest corridors"}
              <span className="mx-2 text-[var(--color-faint)]">·</span>
              {mapped.length} of {visible.length} shown
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="rounded-full border border-[var(--color-line-strong)] px-3.5 py-2 text-[12px] font-medium text-[var(--color-ink-soft)] transition hover:border-[var(--color-orange)] hover:text-[var(--color-orange-deep)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-orange)]"
          >
            {showAll ? "Show overview" : "Show all routes"}
          </button>
        </div>

        <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className={styles.atlasScroll}>
            <svg
              viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
              className={styles.atlas}
              role="group"
              aria-label={`Interactive world map showing ${mapped.length} of ${visible.length} payment corridors. Select a country marker to filter routes.`}
            >
              <g className={styles.graticule} aria-hidden="true">
                {GRATICULE_LNG.map((lng) => <line key={lng} x1={((lng + 180) / 360) * MAP_WIDTH} y1={0} x2={((lng + 180) / 360) * MAP_WIDTH} y2={MAP_HEIGHT} />)}
                {GRATICULE_LAT.map((lat) => <line key={lat} x1={0} y1={((83 - lat) / 139) * MAP_HEIGHT} x2={MAP_WIDTH} y2={((83 - lat) / 139) * MAP_HEIGHT} />)}
              </g>
              <g className={styles.land} aria-hidden="true">
                {WORLD_LAND_PATHS.map((path, index) => <path key={index} d={path} />)}
              </g>
              <g fill="none">
                {mapped.map((route) => {
                  const from = projectCountry(route.entityCountry);
                  const to = projectCountry(route.destinationCountry);
                  if (!from || !to) return null;
                  const key = routeKey(route);
                  const active = key === selected;
                  return routePaths(from, to).map((path, index) => (
                    <g key={`${key}-${index}`}>
                      <path d={path} className={active ? styles.routeActive : route.cheapest ? styles.routePriced : styles.routeMuted} style={{ opacity: selected && !active ? 0.16 : undefined }} />
                      <path
                        d={path}
                        className={styles.routeHit}
                        role={index === 0 ? "button" : undefined}
                        tabIndex={index === 0 ? 0 : -1}
                        aria-hidden={index > 0}
                        aria-label={index === 0 ? `${label(route.entityCountry)} to ${label(route.destinationCountry)}, ${route.supported} supporting providers` : undefined}
                        onClick={() => setSelected(active ? null : key)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelected(active ? null : key);
                          }
                        }}
                      />
                    </g>
                  ));
                })}
              </g>
              <g>
                {nodes.map((node) => {
                  const active = node.code === focus;
                  const endpoint = node.code === selectedRoute?.entityCountry || node.code === selectedRoute?.destinationCountry;
                  return (
                    <g
                      key={node.code}
                      role="button"
                      tabIndex={0}
                      aria-label={`Filter routes touching ${label(node.code)}`}
                      className={styles.markerButton}
                      onClick={() => { setFocus(active ? null : node.code); setSelected(null); }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setFocus(active ? null : node.code);
                          setSelected(null);
                        }
                      }}
                    >
                      <circle cx={node.point.x} cy={node.point.y} r={13} className={styles.markerHit} />
                      {active || endpoint ? <circle cx={node.point.x} cy={node.point.y} r={10} className={styles.markerHalo} /> : null}
                      <circle cx={node.point.x} cy={node.point.y} r={active || endpoint ? 5.5 : 3.5} className={styles.marker} />
                      {labeled.has(node.code) ? (
                        <text x={node.point.x + 9} y={node.point.y - 8} className={styles.markerLabel}>{node.code}</text>
                      ) : null}
                    </g>
                  );
                })}
              </g>
            </svg>
            <span className={styles.mapStamp}>RAILOR <span aria-hidden>·</span> COVERAGE ATLAS</span>
          </div>

          <aside className="flex min-h-0 flex-col border-t border-[var(--color-line)] bg-[var(--color-paper)] lg:border-l lg:border-t-0" aria-label="Find a route">
            <div className="border-b border-[var(--color-line)] p-4">
              <SectionLabel>Find a corridor</SectionLabel>
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-[var(--color-line-strong)] bg-white px-3 focus-within:border-[var(--color-orange)]">
                <Search size={15} className="shrink-0 text-[var(--color-muted)]" aria-hidden />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Country or code"
                  aria-label="Search corridors by country"
                  className="h-10 w-full min-w-0 bg-transparent text-[13px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-faint)]"
                />
                {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear corridor search"><X size={14} /></button> : null}
              </div>
              <p className="mt-2 text-[11px] text-[var(--color-muted)]">{searchResults.length} matching routes · select one to locate it</p>
            </div>
            <div className="max-h-[330px] flex-1 overflow-y-auto p-2 lg:max-h-none">
              {searchResults.length ? searchResults.slice(0, 8).map((route) => (
                <button
                  type="button"
                  key={routeKey(route)}
                  onClick={() => selectRoute(route)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white focus-visible:outline-2 focus-visible:outline-[var(--color-orange)] ${selected === routeKey(route) ? "bg-white shadow-sm" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-semibold text-[var(--color-ink)]">{label(route.entityCountry)} <span className="text-[var(--color-orange-deep)]">→</span> {label(route.destinationCountry)}</span>
                    <span className="mt-0.5 block text-[11px] text-[var(--color-muted)]">{route.supported} supporting provider{route.supported === 1 ? "" : "s"}</span>
                  </span>
                  <span className={`size-2 shrink-0 rounded-full ${route.cheapest ? "bg-[var(--color-orange)]" : "bg-[var(--color-line-strong)]"}`} aria-label={route.cheapest ? "Comparable fee available" : "No published comparable fee"} />
                </button>
              )) : <p className="px-3 py-6 text-center text-[12px] text-[var(--color-muted)]">No corridors match this search.</p>}
              {searchResults.length > 8 ? <p className="px-3 py-2 text-[11px] text-[var(--color-muted)]">Refine your search to find more routes.</p> : null}
            </div>
          </aside>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-[var(--color-line)] px-5 py-3 text-[11px] text-[var(--color-muted)]">
          <span className="flex items-center gap-2"><span className="h-0.5 w-5 rounded-full bg-[var(--color-orange)]" /> Comparable fee</span>
          <span className="flex items-center gap-2"><span className="h-0.5 w-5 rounded-full bg-[#8aa5a8]" /> No published fee</span>
          <span>Choose a marker to focus a country, or search every route.</span>
          {undrawable > 0 ? <span className="text-[var(--color-warn)]">{undrawable} route{undrawable === 1 ? "" : "s"} lack map coordinates.</span> : null}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 [&>*]:min-w-0 lg:grid-cols-2">
        <Card className="flex flex-col gap-2 p-5">
          <SectionLabel>Cheapest route {focus ? `touching ${label(focus)}` : "in this view"}</SectionLabel>
          {cheapestVisible?.cheapest ? (
            <>
              <p className="text-[15px] font-medium">
                <Flag code={cheapestVisible.entityCountry} size={15} className="mr-1 -translate-y-px" />
                {label(cheapestVisible.entityCountry)} →{" "}
                <Flag code={cheapestVisible.destinationCountry} size={15} className="mr-1 -translate-y-px" />
                {label(cheapestVisible.destinationCountry)}
              </p>
              <p className="text-[13.5px] text-[var(--color-muted)]">
                <span className="font-medium text-[var(--color-ink)]">{cheapestVisible.cheapest.provider.name}</span>{" "}
                at <span className="tabular font-medium text-[var(--color-ink)]">{cheapestVisible.cheapest.feeBps} bps</span>
                {cheapestVisible.cheapest.feeSummary ? ` — ${cheapestVisible.cheapest.feeSummary}` : ""}
              </p>
              <p className="text-[11.5px] text-[var(--color-faint)]">
                Lowest published fee among providers that can serve the route. Unpublished fees are excluded.
              </p>
            </>
          ) : <p className="text-[13.5px] text-[var(--color-muted)]">No route in this view has a comparable published fee.</p>}
          {cheapestOverall?.cheapest && focus ? (
            <p className="border-t border-[var(--color-line)] pt-2 text-[12px] text-[var(--color-faint)]">
              Cheapest anywhere: {label(cheapestOverall.entityCountry)} → {label(cheapestOverall.destinationCountry)} at {cheapestOverall.cheapest.feeBps} bps.
            </p>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-2 p-5">
          <SectionLabel>{selectedRoute ? "Selected corridor" : "Corridor detail"}</SectionLabel>
          {selectedRoute ? (
            <>
              <p className="text-[15px] font-medium">{label(selectedRoute.entityCountry)} → {label(selectedRoute.destinationCountry)}</p>
              <dl className="grid grid-cols-2 gap-2 text-[13px]">
                <div><dt className="text-[var(--color-faint)]">Supported</dt><dd className="tabular">{selectedRoute.supported}</dd></div>
                <div><dt className="text-[var(--color-faint)]">Needs requirements</dt><dd className="tabular">{selectedRoute.conditional}</dd></div>
                <div><dt className="text-[var(--color-faint)]">Best ({preset})</dt><dd>{selectedRoute.best?.name ?? "—"}</dd></div>
                <div><dt className="text-[var(--color-faint)]">Cheapest</dt><dd>{selectedRoute.cheapest ? `${selectedRoute.cheapest.provider.name} · ${selectedRoute.cheapest.feeBps} bps` : "—"}</dd></div>
              </dl>
              {!selectedRoute.cheapest && selectedRoute.cheapestUnknownReason ? <p className="text-[12px] text-[var(--color-warn)]">{selectedRoute.cheapestUnknownReason}</p> : null}
              <Link href={`/app/corridors?entity=${selectedRoute.entityCountry}&to=${selectedRoute.destinationCountry}`} className="mt-1 text-[13px] font-medium text-[var(--color-purple)]">Open in corridor explorer →</Link>
            </>
          ) : <p className="text-[13.5px] text-[var(--color-muted)]">Select a line or find a corridor to inspect provider coverage and pricing.</p>}
        </Card>
      </div>
    </div>
  );
}
