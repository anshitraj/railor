import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { loadPricePage } from "../../../lib/pricing";
import { convertHref } from "../../../lib/guides/destinations";
import { listedProviders, rankProviders } from "../../../lib/guides/ranking";
import { ProviderLogo } from "../../app/provider-logo";
import styles from "./guides.module.css";

export const RANK_AMOUNTS = [100, 500, 1_000, 5_000, 10_000] as const;
export const DEFAULT_RANK_AMOUNT = 1_000;

/** The amount a visitor picked, limited to the amounts offered so the page can't be asked for anything else. */
export function rankAmount(value: string | undefined): number {
  const amount = Number(value);
  return (RANK_AMOUNTS as readonly number[]).includes(amount) ? amount : DEFAULT_RANK_AMOUNT;
}

const money = (value: number, currency: string) => `${currency === "INR" ? "₹" : ""}${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** How far the delivered amount sits from the mid-market rate; an offer can land above it. */
const costText = (fraction: number) => `${(Math.abs(fraction) * 100).toFixed(2)}% ${fraction >= 0 ? "below" : "above"} mid-market`;

export function RankingSkeleton() {
  return (
    <div className={styles.live} aria-busy="true" aria-label="Checking providers">
      <div className={styles.rank}>{Array.from({ length: 5 }, (_, index) => <div key={index} className={styles.skeleton} />)}</div>
    </div>
  );
}

/**
 * Today's ranking for USD to INR from Railor's own price check. Signed in, it
 * shows the order and the rupees that arrive. Signed out, it names the
 * providers alphabetically with the amounts blurred and never sent, the same
 * rule every other price on the public site follows.
 */
export async function LiveRanking({ amount, signedIn, next }: { amount: number; signedIn: boolean; next: string }) {
  const page = await loadPricePage(
    { from: "USD", to: "INR", amount: String(amount), destinationCountry: "IN", direction: "send", country: "US", profile: "personal", purpose: "personal", market: "1" },
    null, null, "personal",
  );
  const generatedAt = page.result?.generatedAt ?? new Date().toISOString();
  const ranked = rankProviders(page.result, Date.parse(generatedAt) || Date.now());
  const stamp = new Date(generatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  const compare = convertHref({ code: "IN", currency: "INR" }, { signedIn, amount });

  return (
    <div className={styles.live}>
      <div className={styles.liveHead}>
        <h2>{`Sending ${amount.toLocaleString("en-US")} USD to India`}</h2>
        <span className={styles.liveStamp}>{ranked.length ? `Checked ${stamp} UTC` : ""}</span>
      </div>
      <nav className={styles.amounts} aria-label="Amount to send">
        {RANK_AMOUNTS.map((option) => (
          <Link key={option} href={`?amount=${option}`} scroll={false} aria-current={option === amount ? "true" : undefined}>{option.toLocaleString("en-US")} USD</Link>
        ))}
      </nav>

      {ranked.length === 0 ? (
        <p className={styles.liveNote}>{page.error ?? "Railor couldn’t load these prices just now."} Try again in a moment, or open the full comparison.</p>
      ) : signedIn ? (
        <ol className={styles.rank}>
          {ranked.map((provider, index) => (
            <li key={provider.slug} className={styles.rankRow} data-first={index === 0 ? "" : undefined}>
              <span className={styles.rankNum}>{index + 1}</span>
              <ProviderLogo slug={provider.slug} name={provider.name} src={provider.logoUrl} size={34} />
              <span className={styles.rankName}>
                <strong>{provider.name}</strong>
                <small>
                  <span className={styles.tag} data-kind={provider.offer ? "offer" : undefined}>{provider.label}</span>
                  {provider.delivery ? <span>{provider.delivery}</span> : null}
                  {provider.costPct !== null ? <span>{costText(provider.costPct)}</span> : null}
                </small>
              </span>
              <span className={styles.rankAmount}>{money(provider.amount, "INR")}<small>arrives</small></span>
            </li>
          ))}
        </ol>
      ) : (
        <>
          <ul className={styles.rank}>
            {listedProviders(ranked).map((provider) => (
              <li key={provider.slug} className={styles.rankRow}>
                <span className={styles.rankNum} aria-hidden>·</span>
                <ProviderLogo slug={provider.slug} name={provider.name} src={provider.logoUrl} size={34} />
                <span className={styles.rankName}><strong>{provider.name}</strong></span>
                {/* A placeholder, not a price: the server never sends a visitor an amount. */}
                <span className={`${styles.rankAmount} ${styles.blur}`} aria-hidden>₹00,000.00</span>
              </li>
            ))}
          </ul>
          <div className={styles.liveLock}>
            <p><LockKeyhole size={15} aria-hidden style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} />Railor checked these {ranked.length} for your amount. Sign in free to see the order and the rupees each one delivers.</p>
            <Link href={`/login?intent=start&next=${encodeURIComponent(next)}`} className={`${styles.ctaButton} press`}>Unlock the ranking</Link>
          </div>
        </>
      )}

      {ranked.length ? (
        <>
          <p className={styles.liveNote}>Prices come from each provider’s own calculator or published fees and change through the day. Offers apply to new customers only. Always confirm the final amount with the provider before you send.</p>
          <Link href={compare} className={styles.moreLink}>Compare with your own amount<ArrowRight size={16} aria-hidden /></Link>
        </>
      ) : null}
    </div>
  );
}
