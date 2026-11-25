"use client";

import { useId, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Banknote, Briefcase, Globe2, Landmark, ReceiptText, Smartphone, Wallet, type LucideIcon } from "lucide-react";
import type { SendMethod, WayGroup, WayProvider } from "../../lib/ways-to-send";
import { ProviderLogo } from "../app/provider-logo";
import styles from "./ways-to-send.module.css";

const ICONS: Record<SendMethod, LucideIcon> = { app: Smartphone, online: Globe2, cash: Banknote, broker: Briefcase, bank: Landmark, multi: Wallet, get_paid: ReceiptText };
const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Ways to send money on this pair, one method at a time: what it is for, the
 * rules on this corridor that change the choice (with their source), the best
 * price in it today and who else offers it.
 */
export function WaysToSend({ groups, from, to, title, onPick, compareHref }: {
  groups: WayGroup[];
  from: string;
  to: string;
  /** Overrides the default heading, e.g. on a guide page. */
  title?: string;
  /** In the comparison: select the provider in the list. */
  onPick?: (slug: string) => void;
  /** On a guide page: the comparison URL a provider links to (its slug is added as ?provider=). */
  compareHref?: string;
}) {
  const id = useId();
  const [active, setActive] = useState<SendMethod | null>(groups[0]?.id ?? null);
  const group = groups.find((item) => item.id === active) ?? groups[0];
  if (!group) return <p className={styles.empty}>Railor hasn’t found providers for {from} to {to} yet. Try a different pair.</p>;

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = groups.findIndex((item) => item.id === group.id);
    const next = event.key === "Home" ? 0 : event.key === "End" ? groups.length - 1 : (index + (event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1) + groups.length) % groups.length;
    setActive(groups[next]!.id);
    document.getElementById(`${id}-tab-${groups[next]!.id}`)?.focus();
  };
  const hrefFor = compareHref ? (slug: string) => `${compareHref}${compareHref.includes("?") ? "&" : "?"}provider=${encodeURIComponent(slug)}` : undefined;
  const others = group.providers.filter((provider) => provider.slug !== group.best?.slug).slice(0, 8);
  const Icon = ICONS[group.id];

  return (
    <section className={styles.ways} aria-labelledby={`${id}-title`}>
      <header className={styles.head}>
        <h2 id={`${id}-title`}>{title ?? `Ways to send ${from} to ${to}`}</h2>
        <p>{groups.reduce((sum, item) => sum + item.providers.length, 0) > 0 ? `${new Set(groups.flatMap((item) => item.providers.map((provider) => provider.slug))).size} providers, grouped by how the money moves.` : null}</p>
      </header>
      <div className={styles.body}>
        <div className={styles.methods} role="tablist" aria-label="Ways to send" aria-orientation="vertical" onKeyDown={onKey}>
          {groups.map((item) => {
            const ItemIcon = ICONS[item.id];
            const selected = item.id === group.id;
            return (
              <button key={item.id} id={`${id}-tab-${item.id}`} type="button" role="tab" aria-selected={selected} aria-controls={`${id}-panel`} tabIndex={selected ? 0 : -1} onClick={() => setActive(item.id)} className={styles.method}>
                <span className={styles.methodIcon}><ItemIcon size={16} aria-hidden /></span>
                <span className={styles.methodText}><strong>{item.label}</strong><small>{item.hint}</small></span>
                <span className={styles.count} aria-label={`${item.providers.length} providers`}>{item.providers.length}</span>
              </button>
            );
          })}
        </div>

        <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${group.id}`} className={styles.panel} key={group.id}>
          <p className={styles.kicker}><Icon size={13} aria-hidden />{group.hint}</p>
          <h3>{group.label}</h3>
          <p className={styles.about}>{group.about}</p>

          {group.rules.map((rule) => (
            <div key={rule.text} className={styles.rule}>
              <p>{rule.text}</p>
              <a href={rule.source.url} target="_blank" rel="noreferrer noopener">{rule.source.label}<ArrowUpRight size={12} aria-hidden /></a>
            </div>
          ))}

          {group.best ? (
            <div className={styles.best}>
              <span className={styles.bestLabel}>{group.best.recipientAmount !== null ? "Most arrives in this group today" : "In this group"}</span>
              <ProviderRow provider={group.best} to={to} onPick={onPick} hrefFor={hrefFor} featured />
            </div>
          ) : null}

          {others.length ? (
            <div className={styles.others}>
              <span className={styles.bestLabel}>Also offering this</span>
              <ul>{others.map((provider) => <li key={provider.slug}><ProviderRow provider={provider} to={to} onPick={onPick} hrefFor={hrefFor} /></li>)}</ul>
              {group.providers.length - 1 > others.length ? <p className={styles.more}>and {group.providers.length - 1 - others.length} more in the comparison</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ProviderRow({ provider, to, onPick, hrefFor, featured = false }: { provider: WayProvider; to: string; onPick?: (slug: string) => void; hrefFor?: (slug: string) => string; featured?: boolean }) {
  const body = (
    <>
      <ProviderLogo slug={provider.slug} name={provider.name} src={provider.logoUrl} size={featured ? 32 : 24} />
      <span className={styles.providerName}>{provider.name}</span>
      {provider.recipientAmount !== null ? (
        <span className={styles.amount}>
          <strong>{money(provider.recipientAmount)} <small>{to}</small></strong>
          {provider.statusLabel ? <em data-status={provider.status ?? undefined}>{provider.statusLabel}</em> : null}
        </span>
      ) : <span className={styles.noPrice}>No price for this setup</span>}
      <ArrowRight size={14} aria-hidden className={styles.go} />
    </>
  );
  const className = `${styles.provider} ${featured ? styles.featured : ""}`;
  if (onPick) return <button type="button" className={className} onClick={() => onPick(provider.slug)} aria-label={`See ${provider.name} in the comparison`}>{body}</button>;
  if (hrefFor) return <Link href={hrefFor(provider.slug)} className={className}>{body}</Link>;
  return <div className={className}>{body}</div>;
}
