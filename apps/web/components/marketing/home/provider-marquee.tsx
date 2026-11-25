"use client";

import { useId, useState } from "react";
import { Pause, Play } from "lucide-react";
import { marqueeProviders } from "../../../lib/provider-wordmarks";
import { ProviderWordmark } from "../../app/provider-wordmark";
import styles from "./home.module.css";

export function ProviderMarquee() {
  const [paused, setPaused] = useState(false);
  const trackId = useId();
  return (
    <div className={styles.logos}>
      <div className={styles.logosIntro}>
        <p>Compare prices from providers like</p>
        <button type="button" className={styles.logoControl} aria-controls={trackId} aria-label={paused ? "Resume provider logos" : "Pause provider logos"} onClick={() => setPaused(value => !value)}>
          {paused ? <Play size={15} aria-hidden /> : <Pause size={15} aria-hidden />}
        </button>
      </div>
      <div className={styles.logoViewport}>
        <div id={trackId} className={styles.logoTrack} data-paused={paused || undefined}>
          {[false, true].map((duplicate) => (
            <ul key={duplicate ? "copy" : "providers"} className={styles.logoRow} aria-label={duplicate ? undefined : "Example providers"} aria-hidden={duplicate || undefined}>
              {marqueeProviders.map(({ slug, name }) => (
                <li key={slug}><ProviderWordmark slug={slug} name={name} size="strip" decorative={duplicate} /></li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}
