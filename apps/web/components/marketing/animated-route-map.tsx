"use client";

import { motion } from "motion/react";
import { Check, Radio } from "lucide-react";
import { CurrencyLogo } from "./currency-logo";
import { CountryFlag, type CountryCode } from "./country-flag";

const nodes = [
  { left: "8%", top: "58%", flag: "IN" as CountryCode, label: "India", hint: "Entity" },
  { left: "29%", top: "43%", asset: "USDC" as const, label: "USDC", hint: "Asset" },
  { left: "51%", top: "58%", icon: "B", label: "Base", hint: "Network" },
  { left: "73%", top: "42%", flag: "AE" as CountryCode, label: "UAE", hint: "Destination" },
  { left: "92%", top: "58%", icon: "د.إ", label: "AED", hint: "Bank rail" },
];

export function AnimatedRouteMap() {
  return (
    <div
      className="relative min-h-[500px] overflow-hidden rounded-[28px] border border-[var(--color-line)] bg-[var(--color-sand)]"
      role="img"
      aria-label="Animated route from an Indian business through USDC on Base to an AED bank account in the UAE"
    >
      <div className="absolute inset-0 rail-map-grid opacity-65" aria-hidden />

      <div className="relative flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-paper)]/85 px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-muted)]">Live route simulation</p>
          <p className="mt-1 text-[13px] font-semibold text-[var(--color-ink)]">India → USDC → UAE → AED</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-orange-deep)]">
          <Radio size={13} /> Checking 15 providers
        </span>
      </div>

      <div className="absolute inset-x-5 bottom-[122px] top-[78px]" aria-hidden>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
          <path
            d="M8 58 C16 58 21 43 29 43 S42 58 51 58 S64 42 73 42 S84 58 92 58"
            fill="none"
            stroke="var(--color-line-strong)"
            strokeWidth="1.1"
            vectorEffect="non-scaling-stroke"
          />
          <motion.path
            d="M8 58 C16 58 21 43 29 43 S42 58 51 58 S64 42 73 42 S84 58 92 58"
            fill="none"
            stroke="var(--color-orange)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeDasharray="18 82"
            vectorEffect="non-scaling-stroke"
            animate={{ strokeDashoffset: [100, 0] }}
            transition={{ duration: 4.8, repeat: Infinity, ease: "linear" }}
          />
          <path
            d="M29 43 C34 68 38 76 47 82"
            fill="none"
            stroke="var(--color-line-strong)"
            strokeWidth="1"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <motion.span
          className="absolute z-20 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--color-orange)] shadow-[0_0_0_4px_rgba(233,86,42,.14)]"
          animate={{
            left: ["8%", "29%", "51%", "73%", "92%"],
            top: ["58%", "43%", "58%", "42%", "58%"],
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", times: [0, 0.23, 0.5, 0.76, 1] }}
        />

        {nodes.map((node, index) => (
          <motion.div
            key={node.label}
            className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: node.left, top: node.top }}
            animate={{ y: [0, index % 2 === 0 ? -3 : 3, 0] }}
            transition={{ duration: 4 + index * 0.25, repeat: Infinity, ease: "easeInOut" }}
          >
            <span className="grid size-12 place-items-center rounded-2xl border border-[var(--color-line-strong)] bg-[var(--color-paper)] text-[22px] font-bold shadow-[0_10px_25px_-18px_rgba(28,27,25,.45)]">
              {node.asset ? <CurrencyLogo symbol={node.asset} size={28} /> : node.flag ? <CountryFlag code={node.flag} size={22} /> : node.icon}
            </span>
            <span className="mt-2 whitespace-nowrap text-[12px] font-bold text-[var(--color-ink)]">{node.label}</span>
            <span className="whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.11em] text-[var(--color-faint)]">{node.hint}</span>
          </motion.div>
        ))}

        <div className="absolute left-[47%] top-[82%] flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 shadow-[var(--shadow-soft)]">
          <CurrencyLogo symbol="USDT" size={20} />
          <span className="text-[10px] font-bold text-[var(--color-ink-soft)]">USDT route also indexed</span>
        </div>
      </div>

      <div className="absolute inset-x-5 bottom-5 grid grid-cols-3 gap-2">
        {[
          ["Eligibility", "Supported"],
          ["Confidence", "0.96 high"],
          ["Evidence", "4 sources"],
        ].map(([label, value], index) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 + index * 0.12 }}
            className="rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-3"
          >
            <p className="text-[9px] font-bold uppercase tracking-[0.11em] text-[var(--color-faint)]">{label}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-[var(--color-ink)]">
              {index === 0 ? <Check size={13} className="text-[var(--color-ok)]" /> : null}
              {value}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
