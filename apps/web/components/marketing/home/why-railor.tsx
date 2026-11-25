import { ArrowDownRight, Bell, Check, ChevronRight, Link2, MessageSquareText, RefreshCw, ShieldCheck, X } from "lucide-react";
import { ProviderLogo } from "../../app/provider-logo";
import { RailorMark } from "../../brand";
import { LoopOnView } from "./loop-on-view";
import home from "./home.module.css";
import styles from "./why.module.css";

/**
 * Each scene demonstrates one product behavior and settles into a readable still.
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
          <li className={`${styles.tile} ${styles.wide}`} data-home-reveal>
            <LoopOnView className={`${styles.stage} ${styles.networkStage}`} once>
              <div className={styles.network} aria-hidden>
                <div className={styles.networkInputs}>
                  <div className={styles.converge}>
                    {([["wise", "Wise"], ["remitly", "Remitly"], ["xoom", "Xoom"], ["revolut", "Revolut"], ["skydo", "Skydo"], ["payzoll", "PayZoll"]] as const).map(([slug, name], index) => (
                      <span key={slug} className={styles.chip} data-home-provider-motion style={{ "--beat": `${index * 65}ms` } as React.CSSProperties}>
                        <ProviderLogo slug={slug} name={name} size={24} loading="eager" />{name}
                      </span>
                    ))}
                  </div>
                </div>
                <div className={styles.connector}><i /><ChevronRight size={16} /><ArrowDownRight size={16} /></div>
                <div className={styles.networkResult} data-home-result-motion>
                  <span className={styles.networkMark}><RailorMark size={29} /></span>
                  <span><strong>One comparison</strong><small>Price · speed · eligibility</small></span>
                  <Check size={17} className={styles.networkCheck} />
                </div>
              </div>
            </LoopOnView>
            <div className={styles.copy}>
              <h3>Every provider in one search</h3>
              <p>Compare apps, banks and payment platforms side by side.</p>
            </div>
          </li>

          <li className={styles.tile} data-home-reveal>
            <LoopOnView className={styles.stage} once>
              <div className={styles.filterList} aria-hidden>
                <div className={styles.filterRow}><ProviderLogo slug="wise" name="Wise" size={22} /><span>Wise</span><Check size={15} className={styles.ok} /></div>
                <div className={styles.filterRow} data-strike><ProviderLogo slug="revolut" name="Revolut" size={22} /><span>Revolut</span><X size={15} className={styles.bad} /></div>
                <div className={styles.filterRow}><ProviderLogo slug="remitly" name="Remitly" size={22} /><span>Remitly</span><Check size={15} className={styles.ok} /></div>
                <span className={styles.stamp}>Ineligible</span>
              </div>
            </LoopOnView>
            <div className={styles.copy}>
              <h3>Only prices you can use</h3>
              <p>Services that can’t serve your profile are hidden — and Railor tells you why.</p>
            </div>
          </li>

          <li className={styles.tile} data-home-reveal>
            <LoopOnView className={styles.stage} once>
              <div className={styles.live} aria-hidden>
                <span className={styles.ring}><RefreshCw size={16} /></span>
                <div>
                  <span className={styles.liveLabel}>Example payout</span>
                  <strong className={styles.liveAmount}><span className={styles.liveOld}>₹92,341.20</span><span className={styles.liveNew}>₹92,369.57</span></strong>
                </div>
              </div>
            </LoopOnView>
            <div className={styles.copy}>
              <h3>See when prices update</h3>
              <p>Watch prices refresh and see when Railor last checked.</p>
            </div>
          </li>

          <li className={styles.tile} data-home-reveal>
            <LoopOnView className={styles.stage} once>
              <div className={styles.source} aria-hidden>
                <span className={styles.sourcePrice}>Example fee $11.26</span>
                <span className={styles.sourceTip}><Link2 size={13} />wise.com</span>
              </div>
            </LoopOnView>
            <div className={styles.copy}>
              <h3>A source on every number</h3>
              <p>Tap any price to see where it came from and when it was collected.</p>
            </div>
          </li>

          <li className={styles.tile} data-home-reveal>
            <LoopOnView className={styles.stage} once>
              <div className={styles.alert} aria-hidden>
                <span className={styles.alertIcon}><Bell size={15} /></span>
                <div><strong>Fee change detected</strong><small>A provider on your route updated its pricing page.</small></div>
              </div>
            </LoopOnView>
            <div className={styles.copy}>
              <h3>Alerts when things change</h3>
              <p>Watch a route or provider and hear about new fees, limits or coverage.</p>
            </div>
          </li>

          <li className={`${styles.tile} ${styles.full}`} data-home-reveal>
            <LoopOnView className={styles.stage} once>
              <div className={styles.chat} aria-hidden>
                <p className={styles.ask}><MessageSquareText size={14} />Cheapest way to pay a supplier in the UAE?</p>
                <div className={styles.answer}>
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
