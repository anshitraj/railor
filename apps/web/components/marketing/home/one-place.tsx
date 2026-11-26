import fs from "node:fs";
import path from "node:path";
import { remittanceSurvey } from "@railor/core";
import { Check } from "lucide-react";
import { Flag } from "@railor/ui";
import { ProviderLogo } from "../../app/provider-logo";
import { CardRail } from "./card-rail";
import home from "./home.module.css";
import styles from "./one-place.module.css";

const PHONE_ROWS = [["wise", "Wise", "Best"], ["remitly", "Remitly", null], ["revolut", "Revolut", null], ["western-union", "Western Union", null]] as const;

/** Countries in the World Bank fee survey that Railor prices, with a flag we can draw. */
function surveyCountries() {
  const flags = path.join(process.cwd(), "public", "flags");
  return remittanceSurvey({ sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000 }).destinationOptions
    .filter((country) => fs.existsSync(path.join(flags, `${country.code}.svg`)));
}

/**
 * "Everything in one place": four cards you swipe through, each a picture of one
 * thing Railor does. GetOn's feature rail, with a ribbon of real destination
 * flags rolling under the globe.
 */
export function OnePlaceSection() {
  const countries = surveyCountries();
  const half = Math.ceil(countries.length / 2);
  const rows = [countries.slice(0, half), countries.slice(half)];
  const labels = ["Compare", "Countries", "Get paid", "Rate updates", "API and MCP"];

  return (
    <section className={home.section} aria-labelledby="one-place-title">
      <div className={home.container}>
        <div className={styles.intro}>
          <h2 id="one-place-title">Everything about sending money abroad.<br />In one place.</h2>
          <p>Compare, choose, get told when the rate is right, or build it into your own product.</p>
        </div>
      </div>
      <CardRail labels={labels}>
        <article className={styles.card} aria-labelledby="op-compare">
          <p className={styles.eyebrow}>Compare</p>
          <h3 id="op-compare">Every provider.<br />One list.</h3>
          <p className={styles.lead}>Banks, apps and payment platforms side by side, ranked by what actually arrives.</p>
          <div className={`${styles.stage} ${styles.compareStage}`}>
            <span className={styles.ring} aria-hidden />
            <span className={`${styles.orbit} ${styles.orbitA}`}><Flag code="US" size={50} round /></span>
            <span className={`${styles.orbit} ${styles.orbitB}`}><Flag code="IN" size={56} round /></span>
            <span className={`${styles.orbit} ${styles.orbitC}`}><Flag code="GB" size={44} round /></span>
            <span className={`${styles.orbit} ${styles.orbitD}`}><Flag code="AE" size={46} round /></span>
            <div className={styles.phone} aria-hidden>
              <div className={styles.screen}>
                <div className={styles.status}><span>9:41</span><span className={styles.island} /><span className={styles.signal}><i /><i /><i /><i /></span></div>
                <div className={styles.appTop}><span className={styles.avatar}>R</span><span className={styles.bell} /></div>
                <p className={styles.phoneLabel}>You send</p>
                <p className={styles.phoneAmount}>1,000<small>.00 USD</small></p>
                <div className={styles.actions}>
                  <span><b data-dark>⇄</b>Compare</span>
                  <span><b>➤</b>Send</span>
                  <span><b>◔</b>Alert</span>
                </div>
                <ul className={styles.stack}>
                  {PHONE_ROWS.map(([slug, name, tag]) => (
                    <li key={slug}>
                      <ProviderLogo slug={slug} name={name} size={22} />
                      <span>{name}</span>
                      {tag ? <em>{tag}</em> : <i />}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </article>

        <article className={styles.card} aria-labelledby="op-countries">
          <p className={styles.eyebrow}>Countries</p>
          <h3 id="op-countries">Compare prices to {countries.length} countries.</h3>
          <p className={styles.lead}>See the exchange rate, the fee and what your recipient gets, before you choose.</p>
          <div className={`${styles.stage} ${styles.globeStage}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a cached dotted globe */}
            <img className={styles.globe} src="/images/globe-dots.svg" alt="" width={640} height={640} loading="lazy" decoding="async" />
            <div className={styles.ribbons} aria-label={`${countries.length} countries in the World Bank fee survey`}>
              {rows.map((row, r) => (
                <div key={r} className={styles.ribbon} data-reverse={r === 1 || undefined}>
                  <ul aria-hidden={r === 1 || undefined}>
                    {[...row, ...row].map((country, i) => (
                      <li key={`${country.code}-${i}`} aria-hidden={i >= row.length || undefined}><Flag code={country.code} size={18} round />{country.name}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className={`${styles.card} ${styles.photoCard}`} aria-labelledby="op-paid">
          {/* eslint-disable-next-line @next/next/no-img-element -- a stock photo (Pexels licence, see public/images/audiences/SOURCES.md) */}
          <img className={styles.photo} src="/images/audiences/freelancer.jpg" alt="" loading="lazy" decoding="async" />
          <div className={styles.photoText}>
            <p className={styles.eyebrow}>Get paid</p>
            <h3 id="op-paid">Paid from abroad? Keep more of it.</h3>
            <p className={styles.lead}>Upload an invoice, compare ways to receive it, and check the money that lands.</p>
          </div>
          <span className={styles.photoChip}><Check size={15} strokeWidth={3} aria-hidden />Invoice matched to the credit</span>
        </article>

        <article className={styles.card} aria-labelledby="op-rate">
          <p className={styles.eyebrow}>Rate updates</p>
          <h3 id="op-rate">Know when it’s worth sending.</h3>
          <p className={styles.lead}>Daily, weekly or smart updates by email, with a 30-day chart and the best price that day.</p>
          <div className={styles.stage}>
            <div className={styles.mail} aria-hidden>
              <div className={styles.mailHead}><span className={styles.mailDot} />Smart update<em>USD → INR</em></div>
              <svg viewBox="0 0 300 110" className={styles.chart}>
                <path d="M0 82 C 24 78, 38 88, 60 74 S 98 60, 120 66 S 158 40, 182 46 S 222 22, 246 30 S 282 14, 300 10" fill="none" stroke="var(--color-orange)" strokeWidth="3" strokeLinecap="round" />
                <path d="M0 82 C 24 78, 38 88, 60 74 S 98 60, 120 66 S 158 40, 182 46 S 222 22, 246 30 S 282 14, 300 10 L300 110 L0 110 Z" fill="rgb(233 86 42 / .1)" />
                <circle cx="300" cy="10" r="6" fill="var(--color-orange)" className={styles.pulse} />
              </svg>
              <div className={styles.mailRow}><span>Best price today</span><b /></div>
              <div className={styles.mailRow}><span>Change since last update</span><b data-short /></div>
            </div>
          </div>
        </article>

        <article className={styles.card} aria-labelledby="op-api">
          <p className={styles.eyebrow}>API and MCP</p>
          <h3 id="op-api">The same prices, in your own product.</h3>
          <p className={styles.lead}>One request for every provider’s price, or connect Railor to Claude and ChatGPT.</p>
          <div className={styles.stage}>
            <pre className={styles.code} aria-label="Example request"><code>
              <span className={styles.c1}>GET</span> /v1/prices{"\n"}
              {"  "}?from=<span className={styles.c2}>USD</span>&amp;to=<span className={styles.c2}>INR</span>&amp;amount=<span className={styles.c2}>1000</span>{"\n\n"}
              <span className={styles.c3}>{"{"}</span>{"\n"}
              {"  "}<span className={styles.c4}>&quot;rows&quot;</span>: [{"\n"}
              {"    "}{"{ "}<span className={styles.c4}>&quot;providerName&quot;</span>, <span className={styles.c4}>&quot;recipientAmount&quot;</span>,{"\n"}
              {"      "}<span className={styles.c4}>&quot;rate&quot;</span>, <span className={styles.c4}>&quot;feeAmount&quot;</span>, <span className={styles.c4}>&quot;source&quot;</span> {"}"}{"\n"}
              {"  "}]{"\n"}
              <span className={styles.c3}>{"}"}</span>
            </code></pre>
          </div>
        </article>
      </CardRail>
    </section>
  );
}
