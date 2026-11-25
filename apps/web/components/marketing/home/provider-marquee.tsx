"use client";

import { useId, useState } from "react";
import { Pause, Play } from "lucide-react";
import { ProviderLogo } from "../../app/provider-logo";
import styles from "./home.module.css";

const LOGOS = [
  { slug: "wise", name: "Wise" },
  { slug: "remitly", name: "Remitly" },
  { slug: "xoom", name: "Xoom" },
  { slug: "revolut", name: "Revolut" },
  { slug: "skydo", name: "Skydo" },
  { slug: "payzoll", name: "PayZoll" },
  { slug: "razorpay", name: "Razorpay" },
  { slug: "xflow", name: "Xflow" },
  { slug: "dashx", name: "DashX" },
  { slug: "infinity", name: "Infinity" },
  { slug: "airwallex", name: "Airwallex" },
  { slug: "circle", name: "Circle" },
  { slug: "world-remit", name: "WorldRemit" },
];

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
              {LOGOS.map((logo) => (
                <li key={logo.slug}><ProviderLogo slug={logo.slug} name={logo.name} size={26} loading="eager" />{logo.name}</li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}
