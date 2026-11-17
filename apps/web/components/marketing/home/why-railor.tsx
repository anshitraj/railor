import { Bell, Check, Link2, MessageSquareText, RefreshCw, ShieldCheck, X } from "lucide-react";
import { ProviderLogo } from "../../app/provider-logo";
import { LoopOnView } from "./loop-on-view";
import home from "./home.module.css";
import styles from "./why.module.css";

/**
 * Why Railor, as six small working demos rather than six icons. Each tile
 * replays one thing the product really does; loops pause off screen.
 */
export function WhyRailor() {
  return (
    <section className={home.section} aria-labelledby="why-title">
      <div className={home.container}>
        <div className={home.head}>
          <div>
            <p className={home.eyebrow}>Why Railor</p>
            <h2 id="why-title" className={home.title}>Stop checking ten websites.</h2>
          </div>
          <p className={home.lead}>Fees hide in exchange rates, offers expire and rules change. Railor keeps track so you don’t have to.</p>
        </div>

        <ul className={styles.bento}>
          <li className={`${styles.tile} ${styles.wide}`}>
            <LoopOnView className={`${styles.stage} ${styles.loop}`}>
              <div className={styles.converge} aria-hidden>
                {([["wise", "Wise"], ["remitly", "Remitly"], ["xoom", "Xoom"], ["revolut", "Revolut"], ["skydo", "Skydo"], ["payzoll", "PayZoll"]] as const).map(([slug, name], index) => (
                  <span key={slug} className={styles.chip} data-anim style={{ animationDelay: `${index * 0.12}s`, "--from-x": `${(index % 3 - 1) * 90}px`, "--from-y": `${index < 3 ? -46 : 46}px` } as React.CSSProperties}>
                    <ProviderLogo slug={slug} name={name} size={22} />{name}
                  </span>
                ))}
              </div>
            </LoopOnView>
            <div className={styles.copy}>
              <h3>Every provider in one search</h3>
              <p>Apps, banks and payment platforms side by side — no tabs, no spreadsheets.</p>
            </div>
          </li>

          <li className={styles.tile}>
            <LoopOnView className={`${styles.stage} ${styles.loop}`}>
              <div className={styles.filterList} aria-hidden>
                <div className={styles.filterRow}><ProviderLogo slug="wise" name="Wise" size={22} /><span>Wise</span><Check size={15} className={styles.ok} /></div>
                <div className={styles.filterRow} data-anim data-strike><ProviderLogo slug="revolut" name="Revolut" size={22} /><span>Revolut</span><X size={15} className={styles.bad} /></div>
                <div className={styles.filterRow}><ProviderLogo slug="remitly" name="Remitly" size={22} /><span>Remitly</span><Check size={15} className={styles.ok} /></div>
                <span className={`sticker ${styles.stamp}`} data-tone="ink" data-anim style={{ "--tilt": "-8deg" } as React.CSSProperties}>Not for you</span>
              </div>
            </LoopOnView>
            <div className={styles.copy}>
              <h3>Only prices you can use</h3>
              <p>Services that can’t serve your profile are hidden — and Railor tells you why.</p>
            </div>
          </li>

          <li className={styles.tile}>
            <LoopOnView className={`${styles.stage} ${styles.loop}`}>
              <div className={styles.live} aria-hidden>
                <span className={styles.ring} data-anim><RefreshCw size={16} /></span>
                <div>
                  <span className={styles.liveLabel}>Arrives</span>
                  <strong className={styles.liveAmount}><span data-anim className={styles.liveOld}>₹92,341.20</span><span data-anim className={styles.liveNew}>₹92,369.57</span></strong>
                </div>
              </div>
            </LoopOnView>
            <div className={styles.copy}>
              <h3>Live, not last week</h3>
              <p>Prices refresh every 30 seconds while you look, with the time of each check.</p>
            </div>
          </li>

          <li className={styles.tile}>
            <LoopOnView className={`${styles.stage} ${styles.loop}`}>
              <div className={styles.source} aria-hidden>
                <span className={styles.sourcePrice}>Fee $11.26</span>
                <span className={styles.sourceTip} data-anim><Link2 size={13} />wise.com · checked 4s ago</span>
              </div>
            </LoopOnView>
            <div className={styles.copy}>
              <h3>A source on every number</h3>
              <p>Tap any price to see where it came from and when it was collected.</p>
            </div>
          </li>

          <li className={styles.tile}>
            <LoopOnView className={`${styles.stage} ${styles.loop}`}>
              <div className={styles.alert} aria-hidden data-anim>
                <span className={styles.alertIcon}><Bell size={15} /></span>
                <div><strong>Fee change detected</strong><small>A provider on your route updated its pricing page.</small></div>
              </div>
            </LoopOnView>
            <div className={styles.copy}>
              <h3>Alerts when things change</h3>
              <p>Watch a route or provider and hear about new fees, limits or coverage.</p>
            </div>
          </li>

          <li className={`${styles.tile} ${styles.full}`}>
            <LoopOnView className={`${styles.stage} ${styles.loop}`}>
              <div className={styles.chat} aria-hidden>
                <p className={styles.ask} data-anim><MessageSquareText size={14} />Cheapest way to pay a supplier in the UAE?</p>
                <div className={styles.answer} data-anim>
                  <ShieldCheck size={15} />
                  <span>3 providers can serve your company. The lowest known cost arrives in 1 day.</span>
                </div>
              </div>
            </LoopOnView>
            <div className={styles.copy}>
              <h3>Ask in plain English <span className={styles.beta}>Beta</span></h3>
              <p>The Railor agent turns a question into a route check, with the reasons behind every answer.</p>
            </div>
          </li>
        </ul>
      </div>
    </section>
  );
}
