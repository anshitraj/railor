import { CalendarClock, Check, Landmark, Radio, ReceiptText, UserRound } from "lucide-react";
import { LoopOnView } from "./loop-on-view";
import home from "./home.module.css";
import styles from "./trust-basis.module.css";

/**
 * "No mystery prices": the four labels a Railor price can carry, each shown as
 * the small proof behind it (a connected account, a ticking public quote, a fee
 * receipt, a dated estimate). The scenes loop while in view and rest on their
 * finished state for reduced motion. Amounts are examples, not a live quote.
 */

type Basis = { kind: "account" | "public" | "fees" | "estimate"; label: string; title: string; body: string };

const BASES: readonly Basis[] = [
  { kind: "account", label: "Your account", title: "A quote from your own account", body: "When you connect a provider, Railor shows the exact price it gives you." },
  { kind: "public", label: "Public quote", title: "A live public quote", body: "Taken from the provider’s own public pricing a few seconds ago." },
  { kind: "fees", label: "Published fees", title: "The provider’s fee schedule", body: "Their published fees applied at today’s mid-market rate." },
  { kind: "estimate", label: "Estimate", title: "A dated estimate", body: "Consumer prices collected from comparison feeds, with the date shown." },
];

const CHIP_ICON = { account: UserRound, public: Radio, fees: ReceiptText, estimate: CalendarClock } as const;

function AccountDemo() {
  return (
    <div className={styles.demo} aria-hidden>
      <div className={styles.row}>
        <span className={styles.node}><Landmark size={14} /></span>
        <b>Your provider</b>
        <span className={styles.swap}>
          <span className={styles.connecting}>Connecting…</span>
          <span className={styles.connected}><Check size={11} strokeWidth={3} />Connected</span>
        </span>
      </div>
      <div className={styles.figure}>
        <small>You get exactly</small>
        <span className={styles.amountBox}>
          <span className={styles.skeleton} />
          <strong className={styles.accountAmount}>₹92,000</strong>
        </span>
      </div>
    </div>
  );
}

function PublicDemo() {
  return (
    <div className={styles.demo} aria-hidden>
      <div className={styles.row}>
        <span className={styles.live}><i />Live</span>
        <span className={styles.age}>
          <span>just now</span>
          <span>2s ago</span>
          <span>4s ago</span>
        </span>
      </div>
      <div className={styles.figure}>
        <small>From their public pricing</small>
        <strong className={styles.publicAmount}>₹92,023</strong>
      </div>
      <span className={styles.timer}><i /></span>
    </div>
  );
}

function FeesDemo() {
  return (
    <div className={styles.demo} aria-hidden>
      <dl className={styles.receipt}>
        <div className={styles.line1}><dt>You send</dt><dd>$1,000.00</dd></div>
        <div className={styles.line2}><dt>Provider fee</dt><dd>− $4.20</dd></div>
        <div className={styles.line3}><dt>Mid-market rate</dt><dd>× 92.41</dd></div>
        <hr className={styles.rule} />
        <div className={styles.total}><dt>They get</dt><dd>₹92,022</dd></div>
      </dl>
    </div>
  );
}

function EstimateDemo() {
  return (
    <div className={styles.demo} aria-hidden>
      <div className={styles.row}>
        <span className={styles.feed}><CalendarClock size={13} />Comparison feeds</span>
      </div>
      <div className={styles.figure}>
        <small>Typical amount</small>
        <strong className={styles.estimateAmount}>≈ ₹91,800</strong>
      </div>
      <span className={styles.stamp}><b>Collected</b><span>2 days ago</span></span>
    </div>
  );
}

const DEMOS = { account: AccountDemo, public: PublicDemo, fees: FeesDemo, estimate: EstimateDemo } as const;

export function TrustBases() {
  return (
    <LoopOnView className={styles.wrap}>
      <ul className={home.basisGrid} data-rail>
        {BASES.map((basis) => {
          const Demo = DEMOS[basis.kind];
          const Icon = CHIP_ICON[basis.kind];
          return (
            <li key={basis.kind} className={`${home.basis} ${styles.card}`} data-kind={basis.kind}>
              <Demo />
              <span className={styles.chip}><Icon size={13} aria-hidden />{basis.label}</span>
              <div>
                <h3>{basis.title}</h3>
                <p>{basis.body}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className={styles.note}>Amounts are examples.</p>
    </LoopOnView>
  );
}
