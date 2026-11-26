import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Flag, currencyFlagCode } from "@railor/ui";
import { loadPricePage } from "../../../lib/pricing";
import { SENDER_COUNTRY, compareAmount, compareAmounts, comparisonColumns, currencyText, type ComparisonColumn } from "../../../lib/guides/comparison";
import { convertHref } from "../../../lib/guides/destinations";
import { ProviderLogo } from "../../app/provider-logo";
import { ProviderWordmark } from "../../app/provider-wordmark";
import styles from "./guides.module.css";

type Route = { from: string; to: string; country: string };

export function ComparisonSkeleton() {
  return <div className={styles.compare} aria-busy="true" aria-label="Checking providers"><div className={styles.skeleton} style={{ height: 260 }} /></div>;
}

const ROWS: Array<{ label: string; value: (column: ComparisonColumn) => string }> = [
  { label: "They get (after fees)", value: (column) => column.receives },
  { label: "Transfer fees", value: (column) => column.fee },
  { label: "FX rate", value: (column) => column.rate ?? "Not stated" },
  { label: "Markup", value: (column) => column.markup ?? "Not stated" },
  { label: "Delivery time", value: (column) => column.delivery ?? "Check provider" },
  { label: "How you pay", value: (column) => column.payment ?? "Check provider" },
];

/**
 * Live provider comparison for a guide's routes, laid out as cards: the route,
 * today's mid-market rate, the amount, the top three, and a table that opens to
 * show what arrives, the fee, the rate, the markup and the delivery time.
 */
export async function RouteComparison({ routes, signedIn, amountParam }: { routes: readonly Route[]; signedIn: boolean; amountParam: string | undefined }) {
  const first = routes[0]!;
  const amount = compareAmount(first.from, amountParam);
  const cards = await Promise.all(routes.map(async (route) => {
    // Amounts are given in the first route's currency; another sender currency uses its own default scale.
    const routeAmount = route.from === first.from ? amount : compareAmount(route.from, undefined);
    const page = await loadPricePage(
      { from: route.from, to: route.to, amount: String(routeAmount), destinationCountry: route.country, direction: "send", ...(SENDER_COUNTRY[route.from] ? { country: SENDER_COUNTRY[route.from] } : {}), profile: "personal", purpose: "personal", market: "1" },
      null, null, "personal",
    );
    const generatedAt = page.result?.generatedAt ?? new Date().toISOString();
    return { route, amount: routeAmount, data: comparisonColumns(page.result, Date.parse(generatedAt) || Date.now(), route.from, route.to, routeAmount), generatedAt };
  }));
  const stamp = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

  return (
    <section className={styles.compare} id="compare-providers" aria-labelledby="compare-title">
      <div className={styles.compareHead}>
        <h2 id="compare-title">Compare providers</h2>
        {cards.some((card) => card.data.columns.length) ? <span className={styles.liveStamp}>Checked {stamp(cards[0]!.generatedAt)} UTC</span> : null}
      </div>
      <nav className={styles.amounts} aria-label="Amount to send">
        <span className={styles.amountLabel}>Amount</span>
        {compareAmounts(first.from).map((option) => (
          <Link key={option} href={`?amount=${option}#compare-providers`} scroll={false} aria-current={option === amount ? "true" : undefined}>{currencyText(option, first.from).replace(/\.00$/, "")}</Link>
        ))}
      </nav>

      {cards.map(({ route, amount: routeAmount, data }, index) => {
        const fromFlag = currencyFlagCode(route.from);
        const toFlag = currencyFlagCode(route.to);
        const compare = convertHref({ code: route.country, currency: route.to }, { signedIn, from: route.from, amount: routeAmount });
        if (!data.columns.length) {
          return <p key={`${route.from}-${route.to}`} className={styles.liveNote}>Live prices for {route.from} to {route.to} aren’t available just now. <Link href={compare}>Open the full comparison</Link>.</p>;
        }
        return (
          <details key={`${route.from}-${route.to}`} className={styles.route} open={index === 0}>
            <summary>
              <span className={styles.pair}>{fromFlag ? <Flag code={fromFlag} size={20} round /> : null}{route.from}</span>
              <span className={styles.pair}>{toFlag ? <Flag code={toFlag} size={20} round /> : null}{route.to}</span>
              {data.reference ? <span className={styles.routeMeta}><small>Mid market rate</small><strong>1 {route.from} = {data.reference.toLocaleString("en-US", { maximumSignificantDigits: 6 })} {route.to}</strong></span> : null}
              <span className={styles.routeMeta}><small>Transfer amount</small><strong>{currencyText(routeAmount, route.from)}</strong></span>
              <ol className={styles.top} aria-label="Top providers">
                {data.columns.slice(0, 3).map((column, rank) => (
                  <li key={column.slug}><i>{rank + 1}</i><ProviderLogo slug={column.slug} name={column.name} src={column.logoUrl} size={44} /><small>{column.name}</small></li>
                ))}
              </ol>
              <ChevronDown className={styles.chevron} size={18} aria-hidden />
            </summary>
            <div className={styles.tableWrap}>
              <table className={styles.compareTable} style={{ ["--columns" as string]: data.columns.length }}>
                <caption className="sr-only">{route.from} to {route.to}, {currencyText(routeAmount, route.from)}</caption>
                <thead>
                  <tr>
                    <td />
                    {data.columns.map((column) => <th key={column.slug} scope="col"><ProviderWordmark slug={column.slug} name={column.name} src={column.logoUrl} size="compact" /></th>)}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      {data.columns.map((column) => <td key={column.slug}>{row.value(column)}</td>)}
                    </tr>
                  ))}
                  <tr>
                    <th scope="row">Price source</th>
                    {data.columns.map((column) => <td key={column.slug}><span className={styles.sourceTag} data-estimate={column.estimate || undefined}>{column.source}</span></td>)}
                  </tr>
                  <tr>
                    <td />
                    {data.columns.map((column) => (
                      <td key={column.slug}>
                        {column.href
                          ? <a className={styles.visit} href={column.href} target="_blank" rel="nofollow noopener noreferrer">Visit</a>
                          : <Link className={styles.visit} href={compare}>Compare</Link>}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        );
      })}

      <p className={styles.liveNote}>Prices come from each provider’s own calculator or published fees and change through the day. Offers apply to new customers only. Markup is how far what arrives sits below the mid-market amount, fee and exchange rate together; a negative figure means the price beats it. Always confirm the final amount with the provider before you send.</p>
      <Link href={convertHref({ code: first.country, currency: first.to }, { signedIn, from: first.from, amount })} className={styles.moreLink}>Compare with your own amount<ArrowRight size={16} aria-hidden /></Link>
    </section>
  );
}
