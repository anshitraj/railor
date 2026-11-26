"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BookOpen, CreditCard, Globe, Landmark, Star, TrendingUp, type LucideIcon } from "lucide-react";
import { Flag } from "@railor/ui";
import { GUIDES, GUIDE_TOPICS, guideHref, guidesInTopic, type GuideTopic } from "../../../lib/guides/catalog";
import { convertHref, type Destination } from "../../../lib/guides/destinations";
import styles from "../nav.module.css";

type PaneId = "countries" | GuideTopic;

const TOPIC_ICON: Record<GuideTopic, LucideIcon> = { start: Star, ways: CreditCard, bank: Landmark, rates: TrendingUp, india: Globe };

/** How many countries the menu lists before sending people to the full list. */
const MENU_COUNTRIES = 20;

/**
 * The Guides menu: a topic list on the left and what is in it on the right.
 * "Popular countries" lists where people send money; every country opens
 * Convert currencies with that country already chosen.
 */
export function GuidesMenu({ countries, signedIn, onPick }: { countries: readonly Destination[]; signedIn: boolean; onPick: () => void }) {
  const [pane, setPane] = useState<PaneId>(countries.length ? "countries" : "start");
  const rail: Array<{ id: PaneId; label: string; icon: LucideIcon }> = [
    ...(countries.length ? [{ id: "countries" as const, label: "Popular countries", icon: Globe }] : []),
    ...GUIDE_TOPICS.map((topic) => ({ id: topic.id, label: topic.label, icon: TOPIC_ICON[topic.id] })),
  ];

  return (
    <div className={styles.megaGrid}>
      <Link href="/guides" className={styles.feature} onClick={onPick}>
        <span className={styles.featureIcon}><BookOpen size={16} aria-hidden /></span>
        <strong>Guides</strong>
        <small>How to send money abroad, what it really costs and what you need from the person receiving it.</small>
        <span className={styles.featureCta}>All guides <ArrowRight size={13} aria-hidden /></span>
      </Link>

      <ul className={styles.megaRail} aria-label="Guide topics">
        {rail.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              data-active={pane === item.id || undefined}
              aria-pressed={pane === item.id}
              onMouseEnter={() => setPane(item.id)}
              onFocus={() => setPane(item.id)}
              onClick={() => setPane(item.id)}
            >
              <item.icon size={17} aria-hidden />{item.label}
            </button>
          </li>
        ))}
      </ul>

      <div className={styles.megaPane}>
        {pane === "countries" ? (
          <>
            <ul className={styles.megaCountries}>
              {countries.slice(0, MENU_COUNTRIES).map((country) => (
                <li key={country.code}>
                  <Link href={convertHref(country, { signedIn })} onClick={onPick}>
                    <Flag code={country.code} size={16} />Send money to {country.name}
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/guides/countries" className={styles.megaMore} onClick={onPick}>View all countries <ArrowRight size={14} aria-hidden /></Link>
          </>
        ) : (
          <>
            <ul className={styles.megaGuides}>
              {guidesInTopic(pane).map((guide) => (
                <li key={guide.slug}>
                  <Link href={guideHref(guide.slug)} onClick={onPick}>
                    <strong>{guide.title}</strong>
                    <small>{guide.summary}</small>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/guides" className={styles.megaMore} onClick={onPick}>All guides <ArrowRight size={14} aria-hidden /></Link>
          </>
        )}
      </div>
    </div>
  );
}

/** The same links for the phone menu, as two plain lists. */
export function GuidesMobileGroups({ countries, signedIn, onPick }: { countries: readonly Destination[]; signedIn: boolean; onPick: () => void }) {
  return (
    <>
      {countries.length ? (
        <div className={styles.sheetGroup}>
          <p>Send money to</p>
          <ul>
            {countries.slice(0, 8).map((country) => (
              <li key={country.code}><Link href={convertHref(country, { signedIn })} onClick={onPick}><Flag code={country.code} size={14} />{country.name}</Link></li>
            ))}
            <li><Link href="/guides/countries" onClick={onPick}><ArrowRight size={16} aria-hidden />All countries</Link></li>
          </ul>
        </div>
      ) : null}
      <div className={styles.sheetGroup}>
        <p>Guides</p>
        <ul className={styles.sheetList}>
          {GUIDES.map((guide) => (
            <li key={guide.slug}><Link href={guideHref(guide.slug)} onClick={onPick}><BookOpen size={16} aria-hidden />{guide.title.split(":")[0]}</Link></li>
          ))}
        </ul>
      </div>
    </>
  );
}
