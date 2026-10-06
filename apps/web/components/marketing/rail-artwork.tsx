"use client";

import { useId, useRef, useEffect, useState } from "react";
import { motion, useInView } from "motion/react";

const RAILS = [
  { label: "USDC", y: 30, delay: 0 },
  { label: "EUR", y: 70, delay: 0.35 },
  { label: "GBP", y: 110, delay: 0.7 },
  { label: "NGN", y: 150, delay: 1.05 },
];

const EXITS = [
  { label: "AED", y: 50, live: true },
  { label: "USD", y: 90, live: true },
  { label: "INR", y: 130, live: false },
];

/**
 * The brand object: several corridors entering one routing node, one route
 * illuminated, ineligible routes desaturated. Motion here describes the
 * product's behaviour rather than decorating it.
 */
export function RailArtwork() {
  const artworkRef = useRef<SVGSVGElement>(null);
  const inView = useInView(artworkRef, { amount: .1 });
  const [reduced, setReduced] = useState(true);
  const identifier = useId().replaceAll(":", "");
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  const animate = inView && !reduced;
  return (
    <svg
      ref={artworkRef}
      viewBox="0 0 520 200"
      className="h-auto w-full max-w-[560px]"
      role="img"
      aria-label="Corridors converging on the Railor routing node, with one eligible route illuminated"
    >
      <defs>
        <linearGradient id={`${identifier}-in`} x1="0" x2="1">
          <stop offset="0%" stopColor="var(--color-violet)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="var(--color-purple)" stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id={`${identifier}-out`} x1="0" x2="1">
          <stop offset="0%" stopColor="var(--color-purple)" stopOpacity="0.75" />
          <stop offset="100%" stopColor="var(--color-violet)" stopOpacity="0.12" />
        </linearGradient>
        <filter id={`${identifier}-glow`}>
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {RAILS.map((rail) => (
        <g key={rail.label}>
          <path
            d={`M20 ${rail.y} H180 Q240 ${rail.y} 250 100`}
            fill="none"
            stroke={`url(#${identifier}-in)`}
            strokeWidth="1.5"
          />
          {animate && <motion.circle
            r="3"
            fill="var(--color-purple)"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: 2.8, delay: rail.delay, repeat: Infinity, ease: "linear" }}
          >
            <animateMotion
              dur="2.8s"
              begin={`${rail.delay}s`}
              repeatCount="indefinite"
              path={`M20 ${rail.y} H180 Q240 ${rail.y} 250 100`}
            />
          </motion.circle>}
          <text x="6" y={rail.y + 4} className="fill-[var(--color-muted)] text-[9px]">
            {rail.label}
          </text>
        </g>
      ))}

      {EXITS.map((exit, i) => (
        <g key={exit.label} opacity={exit.live ? 1 : 0.32}>
          <path
            d={`M270 100 Q290 ${exit.y} 350 ${exit.y} H500`}
            fill="none"
            stroke={exit.live ? `url(#${identifier}-out)` : "var(--color-line-strong)"}
            strokeWidth={exit.live ? 1.8 : 1.2}
            strokeDasharray={exit.live ? undefined : "4 4"}
          />
          {exit.live && animate ? (
            <motion.circle r="3" fill="var(--color-lime)">
              <animateMotion
                dur="2.4s"
                begin={`${0.4 + i * 0.5}s`}
                repeatCount="indefinite"
                path={`M270 100 Q290 ${exit.y} 350 ${exit.y} H500`}
              />
            </motion.circle>
          ) : null}
          <text x="504" y={exit.y + 4} className="fill-[var(--color-muted)] text-[9px]">
            {exit.label}
          </text>
        </g>
      ))}

      <motion.g
        animate={animate ? { scale: [1, 1.025, 1] } : { scale: 1 }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "260px 100px" }}
      >
        <rect
          x="228"
          y="68"
          width="64"
          height="64"
          rx="20"
          fill="var(--color-brand)"
          filter={`url(#${identifier}-glow)`}
          opacity="0.92"
        />
        <image href="/brand/railor-r.png" x="242" y="77" width="36" height="46" />
      </motion.g>
    </svg>
  );
}
