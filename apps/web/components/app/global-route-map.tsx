"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, Chip, SectionLabel } from "@railor/ui";
// Deliberately the `geo` subpath, not the `@railor/core` barrel: the barrel
// reaches analytics → @railor/database → pg, which cannot be bundled for the
// browser. geo.ts is dependency-free by design. The route type is imported
// type-only so it is erased before bundling.
import { MAP_HEIGHT, MAP_WIDTH, arcPath, projectCountry } from "@railor/core/geo";
import type { GlobalRoute } from "@railor/core/route-map";

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

/** Longitude lines every 30°, latitude every 20° — orientation without a fake coastline. */
const GRATICULE_LNG = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
const GRATICULE_LAT = [60, 40, 20, 0, -20, -40];

const routeKey = (r: GlobalRoute) => `${r.entityCountry}->${r.destinationCountry}`;

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
  const [selected, setSelected] = useState<string | null>(null);

  const byCode = useMemo(() => new Map(countries.map((c) => [c.code, c])), [countries]);
  const label = (code: string) => byCode.get(code)?.name ?? code;

  const visible = useMemo(
    () =>
      routes.filter((r) => {
        if (pricedOnly && !r.cheapest) return false;
        if (focus && r.entityCountry !== focus && r.destinationCountry !== focus) return false;
        return true;
      }),
    [routes, focus, pricedOnly],
  );

  /** Every country the visible routes touch, with its role and traffic, for the nodes. */
  const nodes = useMemo(() => {
    const acc = new Map<string, { code: string; out: number; in: number }>();
    for (const r of visible) {
      const from = acc.get(r.entityCountry) ?? { code: r.entityCountry, out: 0, in: 0 };
      from.out += 1;
      acc.set(r.entityCountry, from);
      const to = acc.get(r.destinationCountry) ?? { code: r.destinationCountry, out: 0, in: 0 };
      to.in += 1;
      acc.set(r.destinationCountry, to);
    }
    return [...acc.values()]
      .map((n) => ({ ...n, point: projectCountry(n.code) }))
      .filter((n): n is typeof n & { point: { x: number; y: number } } => n.point !== null);
  }, [visible]);

  /**
   * Routes whose endpoints have no centroid yet. Provider research adds
   * countries to the catalog faster than geo.ts gains coordinates, so this is
   * a normal state — but a silently-dropped arc would make the map quietly
   * under-report coverage, so the count is surfaced instead of swallowed.
   */
  const undrawable = useMemo(
    () =>
      visible.filter(
        (r) => !projectCountry(r.entityCountry) || !projectCountry(r.destinationCountry),
      ).length,
    [visible],
  );

  const maxSupported = Math.max(1, ...visible.map((r) => r.supported));
  const selectedRoute = visible.find((r) => routeKey(r) === selected) ?? null;

  const cheapestVisible = useMemo(() => {
    const priced = visible.filter((r) => r.cheapest);
    if (!priced.length) return null;
    return priced.reduce((min, r) => (r.cheapest!.feeBps < min.cheapest!.feeBps ? r : min));
  }, [visible]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[24px] font-semibold tracking-tight">Global route map</h1>
          <p className="text-[14px] text-[var(--color-muted)]">
            {routes.length} corridors with real coverage, derived from {providersChecked} mapped
            providers. Click a country to isolate its routes.
          </p>
        </div>
      </div>

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <SectionLabel className="w-[70px] shrink-0">Rank by</SectionLabel>
          {presets.map((p) => (
            <Link key={p.value} href={`/app/map?preset=${p.value}`} scroll={false}>
              <Chip active={preset === p.value} className="text-[13px]">
                {p.label}
              </Chip>
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SectionLabel className="w-[70px] shrink-0">Show</SectionLabel>
          <Chip
            active={pricedOnly}
            onClick={() => setPricedOnly(!pricedOnly)}
            className="text-[13px]"
            title="Only routes where at least one provider publishes a fee Railor can compare"
          >
            Comparable pricing only
          </Chip>
          {focus ? (
            <Chip active onClick={() => setFocus(null)} className="text-[13px]">
              {byCode.get(focus)?.flag} {label(focus)} — clear
            </Chip>
          ) : null}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            className="h-auto w-full min-w-[720px] bg-[var(--color-sand)]"
            role="img"
            aria-label={`World map of ${visible.length} payment corridors between ${nodes.length} countries`}
          >
            <g aria-hidden stroke="var(--color-line)" strokeWidth={0.5} opacity={0.7}>
              {GRATICULE_LNG.map((lng) => {
                const x = ((lng + 180) / 360) * MAP_WIDTH;
                return <line key={`lng${lng}`} x1={x} y1={0} x2={x} y2={MAP_HEIGHT} />;
              })}
              {GRATICULE_LAT.map((lat) => {
                const y = ((83 - lat) / (83 + 56)) * MAP_HEIGHT;
                return <line key={`lat${lat}`} x1={0} y1={y} x2={MAP_WIDTH} y2={y} />;
              })}
            </g>

            {/* Arcs first so country nodes always sit on top of them. */}
            <g fill="none">
              {visible.map((r) => {
                if (r.entityCountry === r.destinationCountry) return null;
                const from = projectCountry(r.entityCountry);
                const to = projectCountry(r.destinationCountry);
                if (!from || !to) return null;
                const key = routeKey(r);
                const isSelected = selected === key;
                const weight = 0.6 + (r.supported / maxSupported) * 2.2;
                return (
                  <path
                    key={key}
                    d={arcPath(from, to)}
                    stroke={
                      isSelected
                        ? "var(--color-orange)"
                        : r.cheapest
                          ? "var(--color-purple)"
                          : "var(--color-line-strong)"
                    }
                    strokeWidth={isSelected ? weight + 1.4 : weight}
                    strokeLinecap="round"
                    opacity={selected && !isSelected ? 0.18 : 0.55}
                    className="cursor-pointer"
                    onClick={() => setSelected(isSelected ? null : key)}
                  >
                    <title>
                      {`${label(r.entityCountry)} → ${label(r.destinationCountry)}: ${r.supported} supported`}
                    </title>
                  </path>
                );
              })}
            </g>

            <g>
              {nodes.map((n) => {
                const total = n.out + n.in;
                const radius = 3.5 + Math.min(total / 6, 6);
                const isFocus = focus === n.code;
                return (
                  <g
                    key={n.code}
                    className="cursor-pointer"
                    onClick={() => {
                      setFocus(isFocus ? null : n.code);
                      setSelected(null);
                    }}
                  >
                    <circle
                      cx={n.point.x}
                      cy={n.point.y}
                      r={radius}
                      fill={isFocus ? "var(--color-orange)" : "var(--color-purple)"}
                      stroke="white"
                      strokeWidth={1.5}
                      opacity={0.92}
                    />
                    <text
                      x={n.point.x}
                      y={n.point.y - radius - 4}
                      textAnchor="middle"
                      className="pointer-events-none select-none"
                      fontSize={11}
                      fontWeight={600}
                      fill="var(--color-ink)"
                    >
                      {n.code}
                    </text>
                    <title>
                      {`${label(n.code)} — ${n.out} outbound, ${n.in} inbound`}
                    </title>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-[var(--color-line)] px-4 py-2.5 text-[11.5px] text-[var(--color-muted)]">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-5 rounded-full bg-[var(--color-purple)]" /> Comparable pricing
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-5 rounded-full bg-[var(--color-line-strong)]" /> No published fee
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-5 rounded-full bg-[var(--color-orange)]" /> Selected
          </span>
          <span>Line weight = providers that can serve the route.</span>
          {undrawable > 0 ? (
            <span className="text-[var(--color-warn)]">
              {undrawable} route{undrawable === 1 ? "" : "s"} not drawn — no map coordinates for that
              country yet.
            </span>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="flex flex-col gap-2 p-5">
          <SectionLabel>Cheapest route {focus ? `touching ${label(focus)}` : "on the map"}</SectionLabel>
          {cheapestVisible?.cheapest ? (
            <>
              <p className="text-[15px] font-medium">
                {byCode.get(cheapestVisible.entityCountry)?.flag}{" "}
                {label(cheapestVisible.entityCountry)} →{" "}
                {byCode.get(cheapestVisible.destinationCountry)?.flag}{" "}
                {label(cheapestVisible.destinationCountry)}
              </p>
              <p className="text-[13.5px] text-[var(--color-muted)]">
                <span className="font-medium text-[var(--color-ink)]">
                  {cheapestVisible.cheapest.provider.name}
                </span>{" "}
                at{" "}
                <span className="tabular font-medium text-[var(--color-ink)]">
                  {cheapestVisible.cheapest.feeBps} bps
                </span>
                {cheapestVisible.cheapest.feeSummary
                  ? ` — ${cheapestVisible.cheapest.feeSummary}`
                  : ""}
              </p>
              <p className="text-[11.5px] text-[var(--color-faint)]">
                Lowest published fee among providers that can actually serve the route. Providers
                with no fee on record are never counted as cheaper.
              </p>
            </>
          ) : (
            <p className="text-[13.5px] text-[var(--color-muted)]">
              No route in this view has a provider publishing a comparable fee.
            </p>
          )}
          {cheapestOverall?.cheapest && focus ? (
            <p className="border-t border-[var(--color-line)] pt-2 text-[12px] text-[var(--color-faint)]">
              Cheapest anywhere on the map: {label(cheapestOverall.entityCountry)} →{" "}
              {label(cheapestOverall.destinationCountry)} at {cheapestOverall.cheapest.feeBps} bps.
            </p>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-2 p-5">
          <SectionLabel>{selectedRoute ? "Selected route" : "Route detail"}</SectionLabel>
          {selectedRoute ? (
            <>
              <p className="text-[15px] font-medium">
                {label(selectedRoute.entityCountry)} → {label(selectedRoute.destinationCountry)}
              </p>
              <dl className="grid grid-cols-2 gap-2 text-[13px]">
                <div>
                  <dt className="text-[var(--color-faint)]">Supported</dt>
                  <dd className="tabular">{selectedRoute.supported}</dd>
                </div>
                <div>
                  <dt className="text-[var(--color-faint)]">Needs requirements</dt>
                  <dd className="tabular">{selectedRoute.conditional}</dd>
                </div>
                <div>
                  <dt className="text-[var(--color-faint)]">Best ({preset})</dt>
                  <dd>{selectedRoute.best?.name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--color-faint)]">Cheapest</dt>
                  <dd>
                    {selectedRoute.cheapest
                      ? `${selectedRoute.cheapest.provider.name} · ${selectedRoute.cheapest.feeBps} bps`
                      : "—"}
                  </dd>
                </div>
              </dl>
              {!selectedRoute.cheapest && selectedRoute.cheapestUnknownReason ? (
                <p className="text-[12px] text-[var(--color-warn)]">
                  {selectedRoute.cheapestUnknownReason}
                </p>
              ) : null}
              <Link
                href={`/app/corridors?entity=${selectedRoute.entityCountry}&to=${selectedRoute.destinationCountry}`}
                className="mt-1 text-[13px] font-medium text-[var(--color-purple)]"
              >
                Open in corridor explorer →
              </Link>
            </>
          ) : (
            <p className="text-[13.5px] text-[var(--color-muted)]">
              Click any arc on the map to see who serves that corridor, what it costs, and what it
              would take to qualify.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
