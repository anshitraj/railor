import Link from "next/link";
import { BandVideo } from "../motion/band-video";
import { ArrowRight } from "lucide-react";
import { Flag } from "@railor/ui";
import { MAP_HEIGHT, MAP_WIDTH } from "@railor/core/geo";
import { WORLD_DOTS_PATH } from "../world-dots";
import { RouteArcs } from "./route-arcs";
import styles from "./home.module.css";

const ROUTES = [
  { from: "US", to: "IN", pair: ["USD", "INR"] },
  { from: "GB", to: "IN", pair: ["GBP", "INR"] },
  { from: "AE", to: "IN", pair: ["AED", "INR"] },
  { from: "DE", to: "IN", pair: ["EUR", "INR"] },
  { from: "CA", to: "IN", pair: ["CAD", "INR"] },
  { from: "SG", to: "IN", pair: ["SGD", "INR"] },
  { from: "AU", to: "IN", pair: ["AUD", "INR"] },
  { from: "US", to: "PH", pair: ["USD", "PHP"] },
  { from: "US", to: "MX", pair: ["USD", "MXN"] },
  { from: "GB", to: "NG", pair: ["GBP", "NGN"] },
] as const;

/** The routes people price most, on a map you can read without a legend; each chip opens that route’s prices. */
export function RouteMapSection() {
  return (
    <section className={styles.mapSection} aria-labelledby="routes-title">
      <BandVideo name="night-corridors" opacity={0.42} />
      <div className={styles.container}>
        <div className={styles.head}>
          <div>
            <p className={styles.eyebrow}>Popular routes</p>
            <h2 id="routes-title" className={styles.title}>Built for the routes people actually use.</h2>
          </div>
          <p className={styles.lead}>From the US, UK, Gulf and Europe to India, the Philippines, Mexico and Nigeria. Pick a route to see today’s prices.</p>
        </div>
        <div className={styles.mapViewport}>
        <div className={styles.mapFrame}>
          <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} preserveAspectRatio="xMidYMid meet" className={styles.mapDots} aria-hidden>
            <path d={WORLD_DOTS_PATH} stroke="currentColor" strokeWidth={3.1} strokeLinecap="round" fill="none" />
          </svg>
          <RouteArcs routes={ROUTES.map(({ from, to }) => ({ from, to }))} />
        </div>
        </div>
        <ul className={styles.routeChips} tabIndex={0} aria-label="Price a popular route">
          {ROUTES.map((route) => (
            <li key={`${route.from}-${route.to}`}>
              <Link href={`/prices?from=${route.pair[0]}&to=${route.pair[1]}&amount=1000&market=1`} className={`${styles.routeChip} press`}>
                <span><Flag code={route.from} size={22} round /><Flag code={route.to} size={22} round /></span>
                {route.pair[0]} → {route.pair[1]}
                <ArrowRight size={14} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
