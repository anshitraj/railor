import Link from "next/link";
import { ArrowRight, BadgeCheck, CircleDollarSign, FileSearch, Globe2, Route, Scale } from "lucide-react";
import styles from "./docs-visuals.module.css";

/** Every figure in these visuals is an illustration of the shape of an answer, never live data. */
function Illustration() {
  return <span className={styles.tag}>Illustration</span>;
}

/** Question → checks → answer, drawn instead of described. */
export function AnswerFlow() {
  return (
    <figure className={styles.flow} aria-label="How Railor answers: your question, the providers it checks, and a verdict for each with its evidence">
      <div className={styles.step} style={{ "--i": 0 } as React.CSSProperties}>
        <span className={styles.stepIcon}><Route size={16} aria-hidden /></span>
        <p className={styles.stepLabel}>You ask</p>
        <div className={styles.chips}><span>USD → INR</span><span>$1,700</span><span>Freelancer</span></div>
      </div>
      <span className={styles.wire} aria-hidden><i /></span>
      <div className={styles.step} style={{ "--i": 1 } as React.CSSProperties}>
        <span className={styles.stepIcon}><FileSearch size={16} aria-hidden /></span>
        <p className={styles.stepLabel}>Railor checks</p>
        <ul className={styles.checks}>
          {["Coverage", "Eligibility", "Fees & FX", "Evidence age"].map((item, index) => <li key={item} style={{ "--d": `${0.5 + index * 0.18}s` } as React.CSSProperties}><BadgeCheck size={13} aria-hidden />{item}</li>)}
        </ul>
      </div>
      <span className={styles.wire} aria-hidden><i style={{ animationDelay: ".9s" }} /></span>
      <div className={styles.step} style={{ "--i": 2 } as React.CSSProperties}>
        <span className={styles.stepIcon}><Scale size={16} aria-hidden /></span>
        <p className={styles.stepLabel}>You get</p>
        <div className={styles.verdictBar} aria-hidden><span data-tone="good" style={{ flexGrow: 2 }} /><span data-tone="warn" style={{ flexGrow: 3 }} /><span data-tone="muted" style={{ flexGrow: 10 }} /></div>
        <p className={styles.verdictText}><b>2</b> supported · <b>3</b> need checks · <b>10</b> not available — each with reasons and sources</p>
      </div>
      <figcaption className={styles.caption}>The same answer the app shows, as JSON. <Illustration /></figcaption>
    </figure>
  );
}

const RATES = [
  { name: "Provider A", amount: "158,912", note: "Best complete price", best: true },
  { name: "Provider B", amount: "158,377", note: "Published estimate" },
  { name: "Provider C", amount: "157,640", note: "Account quote" },
  { name: "Provider D", amount: "155,210", note: "Partial · fee unknown", partial: true },
];

/** Three things Railor does, each with a small picture of its answer. */
export function CapabilityCards() {
  return (
    <div className={styles.cards}>
      <Link href="/docs/pricing" className={styles.card}>
        <div className={styles.cardHead}><span className={styles.cardIcon}><CircleDollarSign size={16} aria-hidden /></span><Illustration /></div>
        <ol className={styles.rates}>
          {RATES.map((rate, index) => (
            <li key={rate.name} data-best={rate.best || undefined} data-partial={rate.partial || undefined} style={{ "--d": `${index * 0.07}s` } as React.CSSProperties}>
              <span className={styles.mono}>{rate.name.slice(-1)}</span>
              <span className={styles.rateName}>{rate.name}<small>{rate.note}</small></span>
              <strong>₹{rate.amount}</strong>
            </li>
          ))}
        </ol>
        <h3>Compare what arrives <ArrowRight size={14} aria-hidden /></h3>
        <p>Every option for one amount, ranked by what reaches the bank. Partial prices are never ranked.</p>
      </Link>

      <Link href="/docs/pricing#calculations" className={styles.card}>
        <div className={styles.cardHead}><span className={styles.cardIcon}><Scale size={16} aria-hidden /></span><Illustration /></div>
        <BenchmarkSpark />
        <h3>See the real cost <ArrowRight size={14} aria-hidden /></h3>
        <p>Each price is measured against the mid-market rate, in rupees and basis points.</p>
      </Link>

      <Link href="/docs/api" className={styles.card}>
        <div className={styles.cardHead}><span className={styles.cardIcon}><Globe2 size={16} aria-hidden /></span><Illustration /></div>
        <div className={styles.eligibility}>
          {[["Supported", 2, "good"], ["Needs checks", 3, "warn"], ["Not available", 10, "muted"]].map(([label, count, tone], index) => (
            <div key={label as string} style={{ "--d": `${index * 0.1}s` } as React.CSSProperties}>
              <span>{label}</span>
              <i data-tone={tone} style={{ "--w": `${((count as number) / 15) * 100}%` } as React.CSSProperties} />
              <b>{count}</b>
            </div>
          ))}
        </div>
        <h3>Know who can serve you <ArrowRight size={14} aria-hidden /></h3>
        <p>A verdict per provider for your country and customer type, with the evidence and its age.</p>
      </Link>
    </div>
  );
}

/** Mid-market line with a few providers plotted by cost — the benchmark chart in miniature. */
function BenchmarkSpark() {
  const points = [{ x: 30, bps: 12 }, { x: 90, bps: 27 }, { x: 150, bps: 52 }, { x: 210, bps: 118 }];
  const y = (bps: number) => 18 + bps * 0.62;
  return (
    <svg viewBox="0 0 240 110" className={styles.spark} role="img" aria-label="Illustration: four providers plotted below the mid-market line; the lowest costs 12 basis points, the highest 118">
      <line x1="8" x2="232" y1="18" y2="18" className={styles.midLine} />
      <text x="232" y="12" textAnchor="end" className={styles.axisText}>mid-market</text>
      {points.map((point, index) => (
        <g key={point.x} style={{ "--d": `${0.2 + index * 0.12}s` } as React.CSSProperties} className={styles.sparkPoint}>
          <line x1={point.x} x2={point.x} y1="18" y2={y(point.bps)} className={styles.drop} data-best={index === 0 || undefined} />
          <circle cx={point.x} cy={y(point.bps)} r={index === 0 ? 5 : 4} data-best={index === 0 || undefined} />
          <text x={point.x} y={y(point.bps) + 16} textAnchor="middle" className={styles.axisText}>{point.bps} bps</text>
        </g>
      ))}
    </svg>
  );
}

/** The worked example from the cost formula, as bars: what mid-market would give, what arrives, the gap. */
export function BenchmarkIllustration() {
  return (
    <figure className={styles.bench}>
      <div className={styles.benchRow}><span>Mid-market · 1,000 USD × 100</span><i style={{ "--w": "100%" } as React.CSSProperties} data-tone="ink" /><b>₹100,000</b></div>
      <div className={styles.benchRow}><span>Arrives through the route</span><i style={{ "--w": "99.5%" } as React.CSSProperties} data-tone="orange" /><b>₹99,500</b></div>
      <div className={styles.benchGap}><span>Cost</span><strong>₹500</strong><span className={styles.equals}>=</span><strong>50 bps</strong><small>₹500 ÷ ₹100,000 × 10,000</small></div>
      <figcaption>Worked example with round numbers. <Illustration /></figcaption>
    </figure>
  );
}

const STATUSES = [
  { label: "Account quote", tone: "good", text: "From your connected provider account. The most exact price there is." },
  { label: "Published estimate", tone: "info", text: "The provider’s published fees applied to your amount. Complete, but not locked." },
  { label: "Partial estimate", tone: "warn", text: "A fee is known; another cost isn’t. Shown with what’s missing, never ranked." },
  { label: "Market reference", tone: "muted", text: "A public quote or dated consumer price. Context, not an offer to you." },
];

/** The four data statuses every price carries. */
export function DataStatusLegend() {
  return (
    <div className={styles.statuses}>
      {STATUSES.map((status, index) => (
        <div key={status.label} className={styles.status} style={{ "--d": `${index * 0.06}s` } as React.CSSProperties}>
          <span className={styles.statusLabel}><i data-tone={status.tone} />{status.label}</span>
          <p>{status.text}</p>
        </div>
      ))}
    </div>
  );
}
