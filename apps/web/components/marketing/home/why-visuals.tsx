"use client";

import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Bell, Check, FileText, Mail, X } from "lucide-react";
import { ProviderLogo } from "../../app/provider-logo";
import { RailorMark } from "../../brand";
import styles from "./why-rows.module.css";

/**
 * The moving pictures beside each "Why Railor" row. Each one plays when it is
 * mostly on screen, holds so it can be read, rewinds and plays again for as
 * long as it stays in view; off screen it rests as a finished still. Figures
 * are examples, labelled as such. With reduced motion nothing is hidden or
 * animated: the finished picture is simply there.
 */

const SeenContext = createContext(false);
const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** How long a picture holds once played, and how long its rewind takes. */
const HOLD_MS = 5200;
const REWIND_MS = 750;

/** The tinted panel a picture sits on. It arms its children, then plays them on a loop while it is on screen. */
export function Scene({ tint, label, tone, children }: { tint: string; label?: string; tone?: "dark"; children: ReactNode }) {
  const node = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const element = node.current;
    if (!element || typeof IntersectionObserver === "undefined" || prefersReducedMotion()) return;
    setArmed(true);
    let timer = 0;
    let visible = false;
    const play = () => {
      setSeen(true);
      timer = window.setTimeout(rewind, HOLD_MS);
    };
    const rewind = () => {
      if (!visible) return;
      setSeen(false);
      timer = window.setTimeout(play, REWIND_MS);
    };
    const watcher = new IntersectionObserver(([entry]) => {
      const now = Boolean(entry?.isIntersecting);
      if (now === visible) return;
      visible = now;
      window.clearTimeout(timer);
      if (visible) play();
      // Leaving the screen: stop the loop on the finished picture.
      else setSeen(true);
    }, { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });
    watcher.observe(element);
    return () => {
      watcher.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <SeenContext.Provider value={seen}>
      <div ref={node} className={styles.visual} style={{ "--tint": tint } as CSSProperties} data-tone={tone} data-armed={armed || undefined} data-in={seen || undefined}>
        {label ? <span className={styles.tag}>{label}</span> : null}
        <div className={styles.stack} aria-hidden>{children}</div>
      </div>
    </SeenContext.Provider>
  );
}

/** A number that counts up to its value once the picture is on screen. */
function CountUp({ to, prefix = "", suffix = "", duration = 900 }: { to: number; prefix?: string; suffix?: string; duration?: number }) {
  const seen = useContext(SeenContext);
  const [value, setValue] = useState(to);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || prefersReducedMotion()) return;
    setValue(0);
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || prefersReducedMotion()) return;
    if (!seen) {
      // Rewinding: drop back to zero once the rows have faded out.
      const reset = window.setTimeout(() => setValue(0), REWIND_MS - 100);
      return () => window.clearTimeout(reset);
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setValue(Math.round(to * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [seen, to, duration]);

  return <>{prefix}{value.toLocaleString("en-US")}{suffix}</>;
}

const at = (index: number) => ({ "--i": index }) as CSSProperties;

const NETWORK = [
  ["wise", "Wise"],
  ["remitly", "Remitly"],
  ["revolut", "Revolut"],
  ["paypal", "PayPal"],
  ["xoom", "Xoom"],
  ["skydo", "Skydo"],
] as const;

/** Where each provider flies in from before it settles into the grid. */
const FROM = [["-46px", "-30px", "-9deg"], ["0px", "-44px", "6deg"], ["46px", "-30px", "9deg"], ["-52px", "26px", "7deg"], ["0px", "40px", "-6deg"], ["52px", "26px", "-8deg"]];

/** 1. Every provider in one list: the services you would otherwise check one by one gather into one Railor comparison. */
export function CompareVisual() {
  return (
    <Scene tint="radial-gradient(ellipse at 72% 85%, #6d362b 0%, #341f1a 48%, #211815 88%)" tone="dark">
      <div className={styles.network}>
        <ul className={styles.converge}>
          {NETWORK.map(([slug, name], index) => (
            <li
              key={slug}
              className={`${styles.pchip} ${styles.item}`}
              style={{ "--i": index, "--fx": FROM[index]![0], "--fy": FROM[index]![1], "--fr": FROM[index]![2] } as CSSProperties}
            >
              <ProviderLogo slug={slug} name={name} size={24} loading="eager" />
              <span>{name}</span>
            </li>
          ))}
        </ul>
        <div className={`${styles.wire} ${styles.item}`} style={at(7)}><i /><i /><i /></div>
        <div className={`${styles.result} ${styles.item}`} style={at(9)}>
          <span className={styles.resultMark}><RailorMark size={28} /></span>
          <span className={styles.resultText}><strong>One comparison</strong><small>Price · speed · eligibility</small></span>
          <span className={styles.resultCheck}><Check size={15} strokeWidth={3} /></span>
        </div>
      </div>
    </Scene>
  );
}

/** 2. The real cost, not just the fee. */
export function CostVisual() {
  return (
    <Scene tint="linear-gradient(160deg, #f6e6dc, #efcdb8)" label="Example figures">
      <div className={styles.card}>
        <div className={styles.cardHead}><strong>Sending 1,000 USD</strong><span>Fair rate 90.00</span></div>
        <div className={`${styles.cost} ${styles.item}`} style={at(1)}>
          <div className={styles.costHead}><strong>No-fee app</strong><small>No fee</small></div>
          <div className={styles.track}><i className={styles.seg} data-kind="rate" style={{ "--w": 1, "--i": 2 } as CSSProperties} /></div>
          <p>You lose <b><CountUp to={2000} suffix=" INR" /></b> <small>2.2%</small></p>
        </div>
        <div className={`${styles.cost} ${styles.item}`} style={at(3)}>
          <div className={styles.costHead}><strong>Low-fee app</strong><small>5 USD fee</small></div>
          <div className={styles.track}>
            <i className={styles.seg} data-kind="fee" style={{ "--w": 0.225, "--i": 4 } as CSSProperties} />
            <i className={styles.seg} data-kind="rate" style={{ "--w": 0.199, "--i": 5 } as CSSProperties} />
          </div>
          <p>You lose <b><CountUp to={848} suffix=" INR" /></b> <small>0.9%</small></p>
        </div>
        <div className={`${styles.legend} ${styles.item}`} style={at(6)}><span data-kind="fee">Fee</span><span data-kind="rate">Exchange-rate markup</span></div>
      </div>
    </Scene>
  );
}

/** 3. Only the prices you can use. */
export function EligibilityVisual() {
  const rows = [
    { name: "Transfer app", ok: true, note: "Can serve you" },
    { name: "Money app", ok: true, note: "Can serve you" },
    { name: "Export platform", ok: false, note: "Business accounts only" },
    { name: "Your bank", ok: true, note: "Can serve you" },
  ];
  return (
    <Scene tint="linear-gradient(160deg, #e9ebe3, #d3dac8)" label="Example figures">
      <div className={styles.card}>
        <div className={styles.chips}>
          <span data-on>Personal</span><span>Freelancer</span><span>Business</span>
        </div>
        <ul className={styles.list}>
          {rows.map((row, index) => (
            <li key={row.name} className={`${styles.row} ${styles.item}`} style={at(index + 1)} data-out={!row.ok || undefined}>
              <span className={styles.avatar} data-tone={index}>{row.name.slice(0, 1)}</span>
              <span className={styles.rowText}>
                <strong>{row.name}</strong>
                <small>{row.note}</small>
              </span>
              {row.ok
                ? <span className={styles.mark} data-ok><Check size={15} strokeWidth={3} /></span>
                : <><span className={styles.strike} /><span className={styles.stamp}><X size={12} strokeWidth={3} />Hidden for you</span></>}
            </li>
          ))}
        </ul>
      </div>
    </Scene>
  );
}

/** 4. Know when it is worth sending. */
export function AlertVisual() {
  return (
    <Scene tint="linear-gradient(160deg, #dcecff, #bcd6f3)" label="Example figures">
      <div className={styles.card}>
        <div className={styles.cardHead}><strong>USD to INR</strong><span>Target 93.00</span></div>
        <svg className={`${styles.chart} ${styles.item}`} style={at(1)} viewBox="0 0 300 120">
          <line className={styles.target} x1="0" y1="34" x2="300" y2="34" />
          <path className={styles.line} pathLength="1" d="M4 92 C28 88 40 96 62 84 S98 70 120 76 S160 58 184 52 S226 36 252 30 S282 22 296 20" />
          <circle className={styles.hit} cx="252" cy="30" r="5" />
          <circle className={styles.pulse} cx="252" cy="30" r="5" />
        </svg>
        <div className={`${styles.notice} ${styles.item}`} style={at(6)}>
          <span className={styles.bell}><Bell size={16} /></span>
          <span><strong>Your target rate was reached</strong><small><Mail size={12} />Email sent just now</small></span>
        </div>
      </div>
    </Scene>
  );
}

/** 5. Get paid, then check the money arrived. */
export function MatchVisual() {
  return (
    <Scene tint="linear-gradient(160deg, #ece7f6, #d7cdea)" label="Example figures">
      <div className={styles.card}>
        <div className={styles.cardHead}><strong><FileText size={14} aria-hidden />Invoice 1042</strong><span>1,000 USD</span></div>
        <ul className={styles.ledger}>
          <li className={styles.item} style={at(1)}><span>Expected when you chose the route</span><b>₹<CountUp to={89152} /></b></li>
          <li className={styles.item} data-tone="up" style={at(2)}><span>Exchange rate moved</span><b>+₹<CountUp to={310} /></b></li>
          <li className={styles.item} data-tone="down" style={at(3)}><span>Provider fee</span><b>−₹<CountUp to={150} /></b></li>
          <li className={`${styles.total} ${styles.item}`} style={at(4)}><span>Arrived</span><b>₹<CountUp to={89312} /></b></li>
        </ul>
        <div className={`${styles.verdict} ${styles.item}`} style={at(5)}><span className={styles.mark} data-ok><Check size={15} strokeWidth={3} /></span>Every rupee explained. Nothing unexplained.</div>
      </div>
    </Scene>
  );
}
