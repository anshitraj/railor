"use client";

import { useEffect, useRef, useState } from "react";
import { MAP_HEIGHT, MAP_WIDTH, arcPath, projectCountry } from "@railor/core/geo";
import { Flag } from "@railor/ui";
import styles from "./home.module.css";

export interface MapRoute { from: string; to: string }

/**
 * The live layer over the dot map: corridors draw as the map enters view,
 * then a dot travels along each one to show which way
 * the money moves. Countries are labelled with their flags so nothing on the
 * map needs a legend.
 */
export function RouteArcs({ routes }: { routes: MapRoute[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [inView, setInView] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const element = ref.current;
    if (!element) return;
    if (!("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      const onScreen = Boolean(entry && entry.intersectionRatio >= 0.3);
      setVisible(onScreen);
      if (onScreen) setInView(true);
    }, { threshold: 0.3 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Pulses start only once every corridor has finished drawing, and SMIL timing is
  // relative to page load, so each one is started explicitly when it appears.
  useEffect(() => {
    if (!inView || reduced) return;
    const timer = window.setTimeout(() => setPulsing(true), 1200 + routes.length * 120);
    return () => window.clearTimeout(timer);
  }, [inView, reduced, routes.length]);
  useEffect(() => {
    if (!pulsing) return;
    svg.current?.querySelectorAll<SVGAnimationElement>("animateMotion, animate").forEach((animation) => {
      try { animation.beginElement(); } catch { /* SMIL unsupported: the static arcs still read. */ }
    });
  }, [pulsing]);
  useEffect(() => {
    if (!pulsing) return;
    if (visible) svg.current?.unpauseAnimations?.();
    else svg.current?.pauseAnimations?.();
  }, [pulsing, visible]);

  const arcs = routes.flatMap((route, index) => {
    const from = projectCountry(route.from);
    const to = projectCountry(route.to);
    if (!from || !to) return [];
    // Bow every arc upward (north) so corridors read as flight paths, not as lines through land.
    const bow = from.x < to.x ? -0.22 : 0.22;
    return [{ id: `${route.from}-${route.to}`, d: arcPath(from, to, bow), index }];
  });
  const countries = [...new Set(routes.flatMap((route) => [route.from, route.to]))].flatMap((code) => {
    const point = projectCountry(code);
    return point ? [{ code, point, destination: routes.some((route) => route.to === code) }] : [];
  });

  return (
    <div ref={ref} style={{ position: "absolute", inset: 0 }}>
      <svg ref={svg} viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} preserveAspectRatio="xMidYMid meet" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }} aria-hidden>
        <defs>
          <linearGradient id="route-stroke" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#ffad8c" stopOpacity=".35" />
            <stop offset="1" stopColor="#ff7a4d" />
          </linearGradient>
        </defs>
        {arcs.map((arc) => (
          <g key={arc.id}>
            <path id={`arc-${arc.id}`} className={styles.mapArc} d={arc.d} pathLength={1} fill="none" stroke="url(#route-stroke)" strokeWidth={1.6} strokeLinecap="round"
              strokeDasharray={1} strokeDashoffset={inView || reduced ? 0 : 1}
              style={{ "--route-delay": `${arc.index * 0.12}s`, "--route-start": `${8 + (arc.index % 5) * 9}%` } as React.CSSProperties} />
            {pulsing ? (
              <circle r={3.2} fill="#fff" opacity={0}>
                <animateMotion dur={`${3.2 + (arc.index % 3) * 0.6}s`} begin="indefinite" repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
                  <mpath href={`#arc-${arc.id}`} />
                </animateMotion>
                <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.1;.85;1" dur={`${3.2 + (arc.index % 3) * 0.6}s`} begin="indefinite" repeatCount="indefinite" />
              </circle>
            ) : null}
          </g>
        ))}
        {countries.map((country) => (
          <circle key={country.code} cx={country.point.x} cy={country.point.y} r={country.destination ? 5 : 3.5} fill={country.destination ? "#ff7a4d" : "#fff"} stroke="#151310" strokeWidth={1.5} />
        ))}
      </svg>
      {countries.map((country, index) => (
        <span
          key={country.code}
          className="sticker-flag"
          style={{
            position: "absolute",
            left: `${(country.point.x / MAP_WIDTH) * 100}%`,
            top: `${(country.point.y / MAP_HEIGHT) * 100}%`,
            translate: "-50% calc(-100% - 10px)",
            padding: 2,
            "--tilt": `${index % 2 ? 6 : -6}deg`,
            "--delay": `${0.4 + index * 0.06}s`,
            animationPlayState: inView || reduced ? "running" : "paused",
          } as React.CSSProperties}
          title={country.code}
        >
          <Flag code={country.code} size={22} round />
        </span>
      ))}
    </div>
  );
}
