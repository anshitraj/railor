import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Flag, currencyFlagCode } from "@railor/ui";
import { loadPricePage } from "../../../lib/pricing";
import { SENDER_COUNTRY, compareAmount, compareAmounts, comparisonColumns, currencyText } from "../../../lib/guides/comparison";
import { convertHref } from "../../../lib/guides/destinations";
import { ProviderWordmark } from "../../app/provider-wordmark";
import styles from "./guides.module.css";

/** The corridors the table can be switched between: a sender currency, a receiving currency and the receiving country. */
export const GLANCE_ROUTES = [
  { from: "USD", to: "INR", country: "IN" },
  { from: "USD", to: "EUR", country: "DE" },
  { from: "GBP", to: "INR", country: "IN" },
  { from: "EUR", to: "USD", country: "US" },
  { from: "INR", to: "USD", country: "US" },
  { from: "CAD", to: "INR", country: "IN" },
  { from: "AUD", to: "INR", country: "IN" },
  { from: "AED", to: "INR", country: "IN" },
] as const;

const routeKey = (route: { from: string; to: string }) => `${route.from}-${route.to}`;

export function GlanceSkeleton() {
  return <div className={styles.compare} aria-busy="true" aria-label="Checking providers"><div className={styles.skeleton} style={{ height: 420 }} /></div>;
}

/**
 * "The best money transfer services at a glance", from Railor's own price check
 * rather than from opinion: the providers that can serve a corridor, ranked by
 * what arrives, with the markup, the fee, the delivery time and where each
 * price comes from. Pick the corridor and the amount; nothing is typed in.
 */
export async function ProviderGlance({ routeParam, amountParam, signedIn }: { routeParam: string | undefined; amountParam: string | undefined; signedIn: boolean }) {
  const route = GLANCE_ROUTES.find((item) => routeKey(item) === routeParam) ?? GLANCE_ROUTES[0];
  const amount = compareAmount(route.from, amountParam);
  const page = await loadPricePage(
    { from: route.from, to: route.to, amount: String(amount), destinationCountry: route.country, direction: "send", ...(SENDER_COUNTRY[route.from] ? { country: SENDER_COUNTRY[route.from] } : {}), profile: "personal", purpose: "personal", market: "1" },
    null, null, "personal",
  );
  const generatedAt = page.result?.generatedAt ?? new Date().toISOString();
  const { columns, reference } = comparisonColumns(page.result, Date.parse(generatedAt) || Date.now(), route.from, route.to, amount, 10);
  const stamp = new Date(generatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  const compare = convertHref({ code: route.country, currency: route.to }, { signedIn, from: route.from, amount });
  const flag = (code: string) => currencyFlagCode(code);

  return (
    <section className={styles.glance} id="at-a-glance" aria-labelledby="glance-title">
      <h2 id="glance-title">{columns.length ? `${columns.length} best money transfer services at a glance` : "Money transfer services at a glance"}</h2>
      <p className={styles.glanceLead}>Ranked by what the recipient receives for {currencyText(amount, route.from).replace(/\.00$/, "")} sent from {route.from} to {route.to}. Switch the route or the amount; the table is built from live prices, with the source and time of each.</p>
      <nav className={styles.amounts} aria-label="Route">
        {GLANCE_ROUTES.map((item) => (
          <Link key={routeKey(item)} href={`?route=${routeKey(item)}#at-a-glance`} scroll={false} aria-current={routeKey(item) === routeKey(route) ? "true" : undefined}>
            {flag(item.from) ? <Flag code={flag(item.from)!} size={16} round /> : null}{item.from} → {item.to}
          </Link>
        ))}
      </nav>
      <nav className={styles.amounts} aria-label="Amount to send">
        <span className={styles.amountLabel}>Amount</span>
        {compareAmounts(route.from).map((option) => (
          <Link key={option} href={`?route=${routeKey(route)}&amount=${option}#at-a-glance`} scroll={false} aria-current={option === amount ? "true" : undefined}>{currencyText(option, route.from).replace(/\.00$/, "")}</Link>
        ))}
      </nav>

      {columns.length === 0 ? (
        <p className={styles.liveNote}>{page.error ?? "Railor couldn’t load prices for this route just now."} <Link href={compare}>Open the full comparison</Link>.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.glanceTable}>
            <caption className="sr-only">Providers for {route.from} to {route.to}, ranked by what arrives</caption>
            <thead>
              <tr><th scope="col">Rank</th><th scope="col">Company</th><th scope="col">How you pay</th><th scope="col">Recipient gets</th><th scope="col">Markup</th><th scope="col">Fees</th><th scope="col">Delivery</th><th scope="col"><span className="sr-only">Website</span></th></tr>
            </thead>
            <tbody>
              {columns.map((column, index) => (
                <tr key={column.slug}>
                  <td data-label="Rank"><strong>{index + 1}</strong></td>
                  <th scope="row" data-label="Company"><span className={styles.glanceCompany}><ProviderWordmark slug={column.slug} name={column.name} src={column.logoUrl} size="regular" /></span>{column.estimate ? <small>Dated estimate</small> : <small>{column.source}</small>}</th>
                  <td data-label="How you pay">{column.payment ?? "Check provider"}</td>
                  <td data-label="Recipient gets"><strong>{column.receives}</strong></td>
                  <td data-label="Markup">{column.markup ?? "Not stated"}</td>
                  <td data-label="Fees">{column.fee}</td>
                  <td data-label="Delivery">{column.delivery ?? "Check provider"}</td>
                  <td>{column.href ? <a className={styles.visit} href={column.href} target="_blank" rel="nofollow noopener noreferrer">Visit</a> : <Link className={styles.visit} href={compare}>Compare</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={styles.liveNote}>{columns.length ? `Checked ${stamp} UTC. ` : ""}{reference ? `Mid-market rate: 1 ${route.from} = ${reference.toLocaleString("en-US", { maximumSignificantDigits: 6 })} ${route.to}. ` : ""}Markup is how far what arrives sits below the mid-market amount, fee and exchange rate together; a negative figure means the price beats it. Offers apply to new customers only. Always confirm the final amount with the provider before you send.</p>
      <Link href={compare} className={styles.moreLink}>Compare with your own amount<ArrowRight size={16} aria-hidden /></Link>
    </section>
  );
}
