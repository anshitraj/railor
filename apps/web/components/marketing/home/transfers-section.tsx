"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, CreditCard, Globe2, Landmark, Sparkles, Wallet } from "lucide-react";
import { MAP_HEIGHT, MAP_WIDTH, arcPath, projectCountry } from "@railor/core/geo";
import { Flag } from "@railor/ui";
import { WORLD_DOTS_PATH } from "../world-dots";
import { ProviderLogo } from "../../app/provider-logo";
import { RailorMark } from "../../brand";
import styles from "./transfers.module.css";

interface CorridorOption {
  id: string;
  fromCountry: string;
  toCountry: string;
  fromCurrency: string;
  toCurrency: string;
  fromLabel: string;
  toLabel: string;
  providers: string;
  speed: string;
  typicalCost: string;
  localRail: string;
}

const CORRIDORS: CorridorOption[] = [
  {
    id: "US-IN",
    fromCountry: "US",
    toCountry: "IN",
    fromCurrency: "USD",
    toCurrency: "INR",
    fromLabel: "United States",
    toLabel: "India",
    providers: "20+ providers",
    speed: "Minutes to 1 day",
    typicalCost: "From 0.62% vs mid-market",
    localRail: "ACH · IMPS / NEFT",
  },
  {
    id: "GB-IN",
    fromCountry: "GB",
    toCountry: "IN",
    fromCurrency: "GBP",
    toCurrency: "INR",
    fromLabel: "United Kingdom",
    toLabel: "India",
    providers: "18+ providers",
    speed: "Minutes to 1 day",
    typicalCost: "From 0.58% vs mid-market",
    localRail: "Faster Payments · UPI / IMPS",
  },
  {
    id: "AE-IN",
    fromCountry: "AE",
    toCountry: "IN",
    fromCurrency: "AED",
    toCurrency: "INR",
    fromLabel: "UAE",
    toLabel: "India",
    providers: "14+ providers",
    speed: "Same day",
    typicalCost: "From 0.54% vs mid-market",
    localRail: "UAE Bank · IMPS / NEFT",
  },
  {
    id: "DE-IN",
    fromCountry: "DE",
    toCountry: "IN",
    fromCurrency: "EUR",
    toCurrency: "INR",
    fromLabel: "Europe",
    toLabel: "India",
    providers: "16+ providers",
    speed: "Same day to 1 day",
    typicalCost: "From 0.65% vs mid-market",
    localRail: "SEPA Instant · IMPS",
  },
  {
    id: "US-MX",
    fromCountry: "US",
    toCountry: "MX",
    fromCurrency: "USD",
    toCurrency: "MXN",
    fromLabel: "United States",
    toLabel: "Mexico",
    providers: "15+ providers",
    speed: "Instant to minutes",
    typicalCost: "From 0.48% vs mid-market",
    localRail: "ACH · SPEI",
  },
  {
    id: "GB-NG",
    fromCountry: "GB",
    toCountry: "NG",
    fromCurrency: "GBP",
    toCurrency: "NGN",
    fromLabel: "United Kingdom",
    toLabel: "Nigeria",
    providers: "12+ providers",
    speed: "Minutes",
    typicalCost: "From 0.74% vs mid-market",
    localRail: "Faster Payments · NIP",
  },
  {
    id: "US-PH",
    fromCountry: "US",
    toCountry: "PH",
    fromCurrency: "USD",
    toCurrency: "PHP",
    fromLabel: "United States",
    toLabel: "Philippines",
    providers: "16+ providers",
    speed: "Minutes to hours",
    typicalCost: "From 0.69% vs mid-market",
    localRail: "ACH · InstaPay / GCash",
  },
];

const QUICK_AMOUNTS = [500, 1000, 5000] as const;

const HUB_PROVIDERS = [
  ["wise", "Wise"],
  ["remitly", "Remitly"],
  ["revolut", "Revolut"],
  ["western-union", "Western Union"],
  ["skydo", "Skydo"],
  ["airwallex", "Airwallex"],
] as const;

const ORBIT_FLAGS = ["US", "IN", "GB", "DE", "AE", "MX"] as const;

const RAIL_PREVIEW = [
  { name: "Pay via Bank transfer", provider: "Wise", slug: "wise", tag: "0.62% cost", tone: "best" as const },
  { name: "Pay via Revolut balance", provider: "Revolut", slug: "revolut", tag: "Live FX", tone: "neutral" as const },
  { name: "USDC on-chain rail", provider: "Stablecoin", slug: null, tag: "24/7 settle", tone: "crypto" as const },
];

/**
 * 2-row interactive transfer bento combining GetOn's `#transfers` corridor map
 * with OpenDue's layered floating rail-card stage (the live calculator now floats
 * as translucent frosted glass right in the cinema hero above):
 * - Row 1 left: wide interactive dotted world corridor map with animated arcs,
 *   clickable destination pins, and instant route switcher.
 * - Row 1 right: OpenDue-inspired soft-tinted stage of 3 depth-layered rail cards
 *   synced live to the selected corridor, paired with route specs and CTA.
 * - Row 2: 3 equal rounded-[32px] capability cards (clean vertical stack on mobile).
 */
export function TransfersSection({
  providerCount,
  currencyCount,
}: {
  providerCount: number;
  currencyCount: number;
}) {
  const [selectedId, setSelectedId] = useState<string>(CORRIDORS[0]!.id);
  const [amount, setAmount] = useState<number>(1000);
  const [interactive, setInteractive] = useState(false);

  const active = CORRIDORS.find((c) => c.id === selectedId) ?? CORRIDORS[0]!;
  const fromPt = projectCountry(active.fromCountry);
  const toPt = projectCountry(active.toCountry);
  const activeArc = fromPt && toPt ? arcPath(fromPt, toPt, fromPt.x < toPt.x ? -0.22 : 0.22) : "";

  const backgroundArcs = CORRIDORS.map((corridor) => {
    const a = projectCountry(corridor.fromCountry);
    const b = projectCountry(corridor.toCountry);
    if (!a || !b) return null;
    return {
      id: corridor.id,
      d: arcPath(a, b, a.x < b.x ? -0.22 : 0.22),
      active: corridor.id === active.id,
    };
  }).filter(Boolean) as Array<{ id: string; d: string; active: boolean }>;

  const mapPins = CORRIDORS.map((corridor) => {
    const pt = projectCountry(corridor.toCountry);
    const originPt = projectCountry(corridor.fromCountry);
    return { corridor, pt, originPt };
  });

  const symbol = active.fromCurrency === "GBP" ? "£" : active.fromCurrency === "EUR" ? "€" : active.fromCurrency === "AED" ? "AED " : "$";
  const compareHref = `/prices?from=${active.fromCurrency}&to=${active.toCurrency}&amount=${amount}&market=1`;

  return (
    <section id="transfers" className={styles.section} aria-labelledby="transfers-title">
      <div className={styles.container}>
        <div className={styles.head} data-home-reveal>
          <p className={styles.eyebrow}>Live transfers &amp; routes</p>
          <h2 id="transfers-title" className={styles.title}>
            Money that moves like you do.
          </h2>
          <p className={styles.lead}>
            Explore live global corridors, see every bank rail, transfer app and stablecoin route side by side, and jump straight into verified pricing.
          </p>
        </div>

        {/* Row 1: Wide Interactive Corridor World Map + OpenDue-style Layered Rail Card Stage */}
        <div className={styles.topBento}>
          <div className={styles.mapCard} data-home-reveal>
            <div className={styles.mapTopBar}>
              <div className={styles.stepPill}>
                <span className={styles.stepDot} aria-hidden />
                {interactive ? (
                  <span>
                    <strong>
                      {active.fromCurrency} → {active.toCurrency}
                    </strong>{" "}
                    · Tap any route pin to explore
                  </span>
                ) : (
                  <span>
                    <strong>{providerCount > 0 ? `${providerCount}+ providers` : "400+ providers"}</strong> tracked across live corridors
                  </span>
                )}
              </div>

              <div className={styles.amountPills} role="group" aria-label="Sample transfer amount">
                {QUICK_AMOUNTS.map((val) => (
                  <button
                    key={val}
                    type="button"
                    aria-pressed={amount === val}
                    onClick={() => {
                      setAmount(val);
                      setInteractive(true);
                    }}
                  >
                    {symbol}
                    {val.toLocaleString("en-US")}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.mapCanvas}>
              <svg
                viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                preserveAspectRatio="xMidYMid meet"
                className={styles.mapSvg}
                aria-hidden="true"
              >
                <path
                  d={WORLD_DOTS_PATH}
                  stroke="currentColor"
                  strokeWidth={3.1}
                  strokeLinecap="round"
                  fill="none"
                  className={styles.mapDots}
                />

                {backgroundArcs.map((arc) => (
                  <path
                    key={arc.id}
                    d={arc.d}
                    fill="none"
                    className={arc.active ? styles.arcGhostActive : styles.arcGhost}
                  />
                ))}

                {activeArc ? (
                  <g key={active.id}>
                    <path d={activeArc} fill="none" pathLength={100} className={styles.arcDash} />
                    <path d={activeArc} fill="none" pathLength={100} className={styles.arcFlow} />
                  </g>
                ) : null}

                {fromPt ? (
                  <g transform={`translate(${fromPt.x} ${fromPt.y})`}>
                    <circle r={11} className={styles.pinRingOrigin} />
                    <circle r={4.5} className={styles.pinCoreOrigin} />
                  </g>
                ) : null}

                {toPt ? (
                  <g transform={`translate(${toPt.x} ${toPt.y})`}>
                    <circle r={14} className={styles.pinRingDest} />
                    <circle r={5.5} className={styles.pinCoreDest} />
                  </g>
                ) : null}
              </svg>

              {fromPt ? (
                <div
                  className={styles.originChip}
                  style={{
                    left: `${(fromPt.x / MAP_WIDTH) * 100}%`,
                    top: `${(fromPt.y / MAP_HEIGHT) * 100}%`,
                  }}
                >
                  <Flag code={active.fromCountry} size={18} round />
                  <span>
                    You send {symbol}
                    {amount.toLocaleString("en-US")}
                  </span>
                </div>
              ) : null}

              {mapPins
                .filter((item, idx, arr) => arr.findIndex((x) => x.corridor.toCountry === item.corridor.toCountry) === idx)
                .map(({ corridor, pt }) => {
                  if (!pt) return null;
                  const isActiveDest = active.toCountry === corridor.toCountry;
                  return (
                    <button
                      key={corridor.toCountry}
                      type="button"
                      className={styles.destPin}
                      data-active={isActiveDest || undefined}
                      style={{
                        left: `${(pt.x / MAP_WIDTH) * 100}%`,
                        top: `${(pt.y / MAP_HEIGHT) * 100}%`,
                      }}
                      onClick={() => {
                        setSelectedId(corridor.id);
                        setInteractive(true);
                      }}
                      aria-label={`Preview route to ${corridor.toLabel} (${corridor.toCurrency})`}
                    >
                      <Flag code={corridor.toCountry} size={18} round />
                      <span>{corridor.toLabel}</span>
                    </button>
                  );
                })}

              {/* Floating live corridor summary toast on desktop map canvas (GetOn style) */}
              <div className={styles.mapFloatToast} key={active.id} aria-hidden="true">
                <span className={styles.pairFlags}>
                  <Flag code={active.fromCountry} size={20} round />
                  <Flag code={active.toCountry} size={20} round />
                </span>
                <div>
                  <strong>
                    {active.fromCurrency} → {active.toCurrency} · {active.providers}
                  </strong>
                  <small>
                    {active.typicalCost} · {active.speed}
                  </small>
                </div>
              </div>
            </div>

            {/* Quick Corridor Switcher Pills */}
            <div className={styles.corridorPills} role="tablist" aria-label="Popular transfer corridors">
              {CORRIDORS.map((corridor) => (
                <button
                  key={corridor.id}
                  type="button"
                  role="tab"
                  aria-selected={corridor.id === active.id}
                  className={styles.corridorPill}
                  onClick={() => {
                    setSelectedId(corridor.id);
                    setInteractive(true);
                  }}
                >
                  <span className={styles.pairFlags} aria-hidden>
                    <Flag code={corridor.fromCountry} size={16} round />
                    <Flag code={corridor.toCountry} size={16} round />
                  </span>
                  {corridor.fromCurrency} → {corridor.toCurrency}
                </button>
              ))}
            </div>
          </div>

          {/* Right Card: OpenDue-inspired soft-tinted stage with 3 depth-layered floating payout rail cards */}
          <div className={styles.railStackCard} data-home-reveal>
            <div className={styles.stackStage} aria-hidden="true">
              <div className={styles.stackDeck}>
                <div className={`${styles.stackSheet} ${styles.stackBack}`}>
                  <span className={styles.stackSheetIcon} data-tone="wire">
                    <Globe2 size={15} />
                  </span>
                  <span className={styles.stackSheetName}>SWIFT bank wire</span>
                  <span className={styles.stackSheetTag}>1–3 business days</span>
                </div>

                <div className={`${styles.stackSheet} ${styles.stackMid}`}>
                  <span className={styles.stackSheetIcon} data-tone="crypto">
                    <Sparkles size={15} />
                  </span>
                  <span className={styles.stackSheetName}>USDC / Stablecoin rail</span>
                  <span className={styles.stackSheetTag}>24/7 settle</span>
                </div>

                <div className={`${styles.stackSheet} ${styles.stackFront}`} key={active.id}>
                  <div className={styles.stackFrontTop}>
                    <span className={styles.stackFlags}>
                      <Flag code={active.fromCountry} size={30} round />
                      <Flag code={active.toCountry} size={30} round />
                    </span>
                    <div className={styles.stackPair}>
                      <strong>
                        {active.fromCurrency} → {active.toCurrency}
                      </strong>
                      <small>{active.localRail}</small>
                    </div>
                    <span className={styles.stackLiveChip}>
                      <i />
                      Live
                    </span>
                  </div>

                  <div className={styles.stackFrontStats}>
                    <div>
                      <span>Sample send</span>
                      <strong>
                        {symbol}
                        {amount.toLocaleString("en-US")}
                      </strong>
                    </div>
                    <div>
                      <span>Typical cost</span>
                      <strong>{active.typicalCost.replace(/^From /, "")}</strong>
                    </div>
                  </div>

                  <div className={styles.stackPayMethods}>
                    <span>
                      <Landmark size={11} />
                      Bank
                    </span>
                    <span>
                      <Wallet size={11} />
                      Balance
                    </span>
                    <span>
                      <CreditCard size={11} />
                      Card
                    </span>
                    <span className={styles.stackSpeedTag}>{active.speed}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.stackBody}>
              <div className={styles.routeTitleRow}>
                <h3>
                  {active.fromLabel} → {active.toLabel}
                </h3>
                <span className={styles.routeBadge}>{active.providers}</span>
              </div>
              <p>
                Every bank transfer, digital wallet and stablecoin rail for {active.fromCurrency} → {active.toCurrency} ranked by what actually arrives.
              </p>
              <Link href={compareHref} className={`${styles.tryCta} press`}>
                Compare {active.fromCurrency} → {active.toCurrency}
                <ArrowRight size={16} aria-hidden />
              </Link>
            </div>
          </div>
        </div>

        {/* Row 2: 3 Equal Bento Cards (GetOn #transfers bottom trio, clean vertical stack on mobile) */}
        <div className={styles.bottomBento}>
          <article className={styles.bentoCard} data-home-reveal>
            <div className={styles.bentoHead}>
              <h3>Compare anyone, any way</h3>
              <p>Transfer apps, banks and business payout rails ranked side by side by what arrives.</p>
            </div>
            <div className={styles.hubStage} aria-hidden="true">
              <span className={styles.hubRingOuter} />
              <span className={styles.hubRingInner} />
              <span className={styles.hubCenter}>
                <RailorMark size={30} />
              </span>
              <div className={styles.hubOrbit}>
                {HUB_PROVIDERS.map(([slug, name], idx) => (
                  <span
                    key={slug}
                    className={styles.hubNode}
                    style={{ "--a": `${idx * (360 / HUB_PROVIDERS.length)}deg` } as React.CSSProperties}
                  >
                    <span className={styles.hubNodeInner}>
                      <ProviderLogo slug={slug} name={name} size={26} />
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </article>

          <article className={styles.bentoCard} data-home-reveal>
            <div className={styles.bentoHead}>
              <h3>{currencyCount > 0 ? `${currencyCount} currencies.` : "86 currencies."} Real mid-market.</h3>
              <p>Every quote benchmarked against the real exchange rate so hidden FX markups stand out.</p>
            </div>
            <div className={styles.currencyStage} aria-hidden="true">
              <span className={styles.currencyRing} />
              <span className={styles.currencyCenter}>
                <span>FX</span>
                <small>Mid-market</small>
              </span>
              {ORBIT_FLAGS.map((code, idx) => (
                <span
                  key={code}
                  className={styles.flagOrb}
                  style={
                    {
                      "--a": `${idx * (360 / ORBIT_FLAGS.length) - 30}deg`,
                      "--delay": `${idx * -0.7}s`,
                    } as React.CSSProperties
                  }
                >
                  <Flag code={code} size={38} round />
                </span>
              ))}
            </div>
          </article>

          <article className={styles.bentoCard} data-home-reveal>
            <div className={styles.bentoHead}>
              <h3>Every way to pay, clearly labelled.</h3>
              <p>See bank transfers, balance payouts, card rates and USDC routes in one transparent list.</p>
            </div>
            <div className={styles.railsStage} aria-hidden="true">
              <ul className={styles.railsList}>
                {RAIL_PREVIEW.map((item) => (
                  <li key={item.name} className={styles.railRow} data-tone={item.tone}>
                    <span className={styles.railAvatar}>
                      {item.slug ? (
                        <ProviderLogo slug={item.slug} name={item.provider} size={26} />
                      ) : (
                        <Sparkles size={15} />
                      )}
                    </span>
                    <span className={styles.railCopy}>
                      <strong>{item.provider}</strong>
                      <small>{item.name}</small>
                    </span>
                    <span className={styles.railChip} data-tone={item.tone}>
                      {item.tone === "best" ? <Check size={11} strokeWidth={3} /> : null}
                      {item.tag}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
