"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Banknote, Briefcase, Building2, Globe2, Layers, Map as MapIcon, ReceiptText, Smartphone, type LucideIcon } from "lucide-react";
import { ProviderLogo } from "../app/provider-logo";
import styles from "./nav.module.css";

/**
 * The Companies and For business menus: a feature card, a rail of kinds of
 * provider, and the providers of the kind under the pointer, each opening its
 * live price (or its profile, where Railor has one).
 */

type Company = { slug: string; name: string };
type Rail = { id: string; label: string; icon: LucideIcon; companies: Company[]; href: (slug: string) => string; more: { label: string; href: string } };

/** Providers with a full public profile; the rest open their price in the comparison. */
const PROFILES = new Set(["wise", "moneygram", "airwallex", "payoneer", "skydo", "xflow", "payglocal"]);
const sendPrice = (slug: string) => `/prices?from=USD&to=INR&amount=1000&provider=${slug}`;
const receivePrice = (slug: string) => `/prices?from=USD&to=INR&amount=1000&profile=business&country=IN&direction=receive&purpose=services&provider=${slug}`;
const profileOr = (fallback: (slug: string) => string) => (slug: string) => (PROFILES.has(slug) ? `/providers/${slug}` : fallback(slug));

const c = (slug: string, name: string): Company => ({ slug, name });

const COMPANY_RAILS: Rail[] = [
  { id: "apps", label: "Money transfer apps", icon: Smartphone, href: sendPrice, more: { label: "Compare transfer apps", href: "/prices" },
    companies: [c("remitly", "Remitly"), c("xoom", "Xoom"), c("world-remit", "WorldRemit"), c("taptap-send", "Taptap Send"), c("sendwave", "Sendwave"), c("aspora", "Aspora"), c("lemfi", "LemFi"), c("revolut", "Revolut")] },
  { id: "online", label: "Online transfer services", icon: Globe2, href: profileOr(sendPrice), more: { label: "Compare online services", href: "/prices" },
    companies: [c("wise", "Wise"), c("instarem", "Instarem"), c("paypal", "PayPal")] },
  { id: "cash", label: "Cash & in-person", icon: Banknote, href: profileOr(sendPrice), more: { label: "Compare cash services", href: "/prices" },
    companies: [c("western-union", "Western Union"), c("moneygram", "MoneyGram"), c("al-ansari-exchange", "Al Ansari Exchange"), c("lulu-exchange", "LuLu Exchange")] },
];

const BUSINESS_RAILS: Rail[] = [
  // Business accounts without a Railor profile open the infrastructure directory: an India receiving price may not apply to them.
  { id: "accounts", label: "Business accounts", icon: Building2, href: profileOr(() => "/providers?view=infrastructure"), more: { label: "Business infrastructure", href: "/providers?view=infrastructure" },
    companies: [c("airwallex", "Airwallex"), c("payoneer", "Payoneer"), c("wise", "Wise Business"), c("revolut", "Revolut Business")] },
  { id: "get-paid", label: "Get paid from abroad", icon: ReceiptText, href: profileOr(receivePrice), more: { label: "Compare ways to get paid", href: "/prices?profile=business&direction=receive&country=IN&purpose=services" },
    companies: [c("skydo", "Skydo"), c("xflow", "Xflow"), c("payglocal", "PayGlocal"), c("razorpay", "Razorpay"), c("briskpe", "BRISKPE"), c("infinity", "Infinity"), c("winvesta", "Winvesta"), c("karbon", "Karbon")] },
  { id: "infrastructure", label: "Payment infrastructure", icon: Layers, href: () => "/providers?view=infrastructure", more: { label: "All infrastructure providers", href: "/providers?view=infrastructure" },
    companies: [c("nium", "Nium"), c("circle", "Circle"), c("dlocal", "dLocal"), c("rapyd", "Rapyd"), c("thunes", "Thunes"), c("stripe", "Stripe")] },
];

function MegaMenu({ feature, rails, extra, onPick }: {
  feature: { icon: LucideIcon; title: string; text: string; cta: string; href: string };
  rails: Rail[];
  extra: Array<{ label: string; href: string; icon: LucideIcon }>;
  onPick: () => void;
}) {
  const [pane, setPane] = useState(rails[0]!.id);
  const rail = rails.find((item) => item.id === pane) ?? rails[0]!;
  const FeatureIcon = feature.icon;
  return (
    <div className={styles.megaGrid}>
      <Link href={feature.href} className={styles.feature} onClick={onPick}>
        <span className={styles.featureIcon}><FeatureIcon size={16} aria-hidden /></span>
        <strong>{feature.title}</strong>
        <small>{feature.text}</small>
        <span className={styles.featureCta}>{feature.cta} <ArrowRight size={13} aria-hidden /></span>
      </Link>

      <ul className={styles.megaRail} aria-label={`${feature.title} by kind`}>
        {rails.map((item) => (
          <li key={item.id}>
            <button type="button" data-active={pane === item.id || undefined} aria-pressed={pane === item.id} onMouseEnter={() => setPane(item.id)} onFocus={() => setPane(item.id)} onClick={() => setPane(item.id)}>
              <item.icon size={17} aria-hidden />{item.label}
            </button>
          </li>
        ))}
        {extra.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className={styles.megaRailLink} onClick={onPick}><item.icon size={17} aria-hidden />{item.label}</Link>
          </li>
        ))}
      </ul>

      <div className={styles.megaPane}>
        <ul className={styles.megaCompanies}>
          {rail.companies.map((company) => (
            <li key={`${rail.id}-${company.slug}`}>
              <Link href={rail.href(company.slug)} onClick={onPick}>
                <ProviderLogo slug={company.slug} name={company.name} size={24} />{company.name}
              </Link>
            </li>
          ))}
        </ul>
        <Link href={rail.more.href} className={styles.megaMore} onClick={onPick}>{rail.more.label} <ArrowRight size={14} aria-hidden /></Link>
      </div>
    </div>
  );
}

export function CompaniesMenu({ onPick }: { onPick: () => void }) {
  return (
    <MegaMenu
      onPick={onPick}
      feature={{ icon: Building2, title: "Companies", text: "Banks, transfer apps, cash services and brokers, each with the price Railor sees today and where it comes from.", cta: "All providers", href: "/providers" }}
      rails={COMPANY_RAILS}
      extra={[{ label: "Coverage map", href: "/coverage", icon: MapIcon }]}
    />
  );
}

export function BusinessMenu({ onPick }: { onPick: () => void }) {
  return (
    <MegaMenu
      onPick={onPick}
      feature={{ icon: Briefcase, title: "Business", text: "Pay suppliers and get paid by clients abroad. Compare business accounts, export payments and the infrastructure behind them.", cta: "Compare business prices", href: "/prices?profile=business&direction=receive&country=IN&purpose=services" }}
      rails={BUSINESS_RAILS}
      extra={[{ label: "Coverage", href: "/coverage", icon: MapIcon }]}
    />
  );
}

/** The phone menu's version: each kind with its first few companies. */
export function ProvidersMobileGroups({ onPick }: { onPick: () => void }) {
  const groups: Array<{ title: string; rails: Rail[]; links: Array<{ label: string; href: string }> }> = [
    { title: "Companies", rails: COMPANY_RAILS.slice(0, 3), links: [{ label: "All providers", href: "/providers" }, { label: "Coverage map", href: "/coverage" }] },
    { title: "For business", rails: BUSINESS_RAILS.slice(0, 2), links: [{ label: "Business infrastructure", href: "/providers?view=infrastructure" }] },
  ];
  return (
    <>
      {groups.map((group) => (
        <div key={group.title} className={styles.sheetGroup}>
          <p>{group.title}</p>
          <ul>
            {group.rails.flatMap((rail) => rail.companies.slice(0, 3).map((company) => (
              <li key={`${rail.id}-${company.slug}`}><Link href={rail.href(company.slug)} onClick={onPick}><ProviderLogo slug={company.slug} name={company.name} size={16} />{company.name}</Link></li>
            )))}
            {group.links.map((link) => <li key={link.href}><Link href={link.href} onClick={onPick}><ArrowRight size={16} aria-hidden />{link.label}</Link></li>)}
          </ul>
        </div>
      ))}
    </>
  );
}
