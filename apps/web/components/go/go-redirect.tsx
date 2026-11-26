"use client";

import { useEffect } from "react";
import { ProviderLogo } from "../app/provider-logo";
import styles from "./go-redirect.module.css";

/** How long the page shows before sending the visitor on. Long enough to read, short enough not to get in the way. */
const DELAY_MS = 1600;

/**
 * "Taking you to {provider}...": Railor on the left, a row of dots travelling
 * across, the provider on the right, then the provider's own page. Without
 * JavaScript a meta refresh does the same, and a plain link is always shown.
 */
export function GoRedirect({ slug, name, href }: { slug: string; name: string; href: string }) {
  useEffect(() => {
    const timer = window.setTimeout(() => window.location.replace(href), DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [href]);

  return (
    <main className={styles.page} aria-live="polite">
      <noscript><meta httpEquiv="refresh" content={`2;url=${href}`} /></noscript>
      <h1 className={styles.title}>Taking you to <strong>{name}</strong>…</h1>
      <div className={styles.row} aria-hidden="true">
        <span className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the brand mark is a small static file */}
          <img src="/brand/railor-r.png" alt="" width={34} height={43} />
          <span>Railor<i>.</i></span>
        </span>
        <span className={styles.dots}><i /><i /><i /><i /><i /><i /></span>
        <span className={styles.provider}><ProviderLogo slug={slug} name={name} size={64} loading="eager" /></span>
      </div>
      <p className={styles.note}>Railor doesn’t hold your money. You finish the transfer on {name}’s own site, and its final price can differ from the one you saw.</p>
      <a className={styles.link} href={href} rel="noopener noreferrer">Not redirected? Continue to {name}</a>
    </main>
  );
}
