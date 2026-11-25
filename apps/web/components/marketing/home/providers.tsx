import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProviderLogo } from "../../app/provider-logo";
import styles from "./home.module.css";

export { FEATURED_PROVIDERS } from "../../../lib/featured-providers";
import { FEATURED_PROVIDERS } from "../../../lib/featured-providers";

export function ProvidersSection({ trackedCount }: { trackedCount: number }) {
  return (
    <section className={`${styles.section} ${styles.sectionAlt} ${styles.providerSection}`} aria-labelledby="providers-title" data-pin-rail>
      {/* On phones this block pins while the cards slide sideways with your scroll. */}
      <div className={`${styles.container} ${styles.providerPin}`}>
        <div className={styles.head}>
          <div>
            <p className={styles.eyebrow}>Providers</p>
            <h2 id="providers-title" className={styles.title}>Know who each provider is for.</h2>
          </div>
          <p className={styles.lead}>Apps, banks, export-payment platforms and stablecoin rails — each described in one line, so you can tell them apart at a glance.</p>
        </div>
        <ul className={styles.providerGrid} data-pin-track>
          {FEATURED_PROVIDERS.map((provider) => (
            <li key={provider.slug} className={styles.provider}>
              <ProviderLogo slug={provider.slug} name={provider.name} size={44} />
              <div>
                <h3>{provider.name}</h3>
                <p>{provider.summary}</p>
                <div className={styles.tags} aria-label={`${provider.name} is for`}>
                  {provider.for.map((audience) => <span key={audience} className={styles.tag} data-kind={audience}>{audience}</span>)}
                </div>
              </div>
            </li>
          ))}
          <li className={styles.providerMore}>
            <Link href="/providers">
              <strong>{trackedCount > 0 ? `${trackedCount.toLocaleString("en-US")}+` : "All"}</strong>
              <span>providers in the directory</span>
              <span className={styles.providerMoreCta}>Browse all<ArrowRight size={15} aria-hidden /></span>
            </Link>
          </li>
        </ul>
        <div className={styles.providerFoot}>
          <p>{trackedCount > 0 ? `${trackedCount.toLocaleString("en-US")} providers in the directory, with dated fee samples and sources.` : "Browse the full directory, with dated fee samples and sources."}</p>
          <Link href="/providers" className={styles.textLink}>Browse all providers<ArrowRight size={16} aria-hidden /></Link>
        </div>
      </div>
    </section>
  );
}
