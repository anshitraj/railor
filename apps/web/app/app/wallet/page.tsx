import "@fontsource/manrope/latin-800.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, ArrowUpRight, Building2, Gift, History, Plus, RotateCcw, SlidersHorizontal, Ticket, Wallet, type LucideIcon } from "lucide-react";
import type { WalletEntry } from "@railor/database";
import { getSession } from "../../../lib/auth";
import { ensureWallet, getAutoReload, listWalletEntries, walletTestModeEnabled } from "../../../lib/wallet";
import { WALLET_RANGES, formatCents, parseWalletRange, type WalletRange } from "../../../lib/wallet-options";
import { AddMoneyButton, AutoReloadCard, PromoCard } from "../../../components/app/wallet/wallet-controls";
import styles from "../../../components/app/wallet/wallet.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Wallet" };

const KIND: Record<WalletEntry["kind"], { icon: LucideIcon; tone: "credit" | "gift" | "debit" }> = {
  signup_credit: { icon: Gift, tone: "gift" },
  promo_credit: { icon: Ticket, tone: "gift" },
  top_up: { icon: Plus, tone: "credit" },
  refund: { icon: RotateCcw, tone: "credit" },
  usage: { icon: Activity, tone: "debit" },
  adjustment: { icon: SlidersHorizontal, tone: "debit" },
};
const STATUS_LABEL: Record<WalletEntry["status"], string> = { completed: "Completed", pending: "Pending", failed: "Failed" };

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

function EntryRow({ entry }: { entry: WalletEntry }) {
  const kind = KIND[entry.kind] ?? KIND.adjustment;
  const Icon = kind.icon;
  const counted = entry.status === "completed";
  return (
    <li className={styles.entry}>
      <span className={styles.entryIcon} data-tone={kind.tone}><Icon size={17} aria-hidden /></span>
      <span className={styles.entryText}>
        <strong title={entry.label}>{entry.label}</strong>
        <time dateTime={entry.createdAt.toISOString()}>{dateFormat.format(entry.createdAt)} · {timeFormat.format(entry.createdAt)} UTC</time>
      </span>
      <span className={styles.pill} data-status={entry.status}>{STATUS_LABEL[entry.status] ?? entry.status}</span>
      <span className={styles.amount} data-sign={entry.amountCents > 0 ? "plus" : "minus"} data-muted={!counted}>
        <span className="sr-only">{entry.amountCents > 0 ? "Credit " : entry.amountCents < 0 ? "Debit " : ""}{formatCents(Math.abs(entry.amountCents))}{counted ? "" : ", excluded from balance"}</span>
        <span aria-hidden>{formatCents(entry.amountCents, { signed: true })}</span>
      </span>
    </li>
  );
}

/**
 * Wallet: prepaid Railor credit. The balance is the sum of the ledger below,
 * so what you see in history always adds up to the number at the top.
 */
export default async function WalletPage({ searchParams }: { searchParams: Promise<{ range?: string; code?: string }> }) {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const params = await searchParams;
  const range: WalletRange = parseWalletRange(params.range);
  const organizationId = session.organization.id;
  const canManage = session.role === "owner" || session.role === "admin";
  const canRedeem = session.role !== "viewer";

  const totals = await ensureWallet(organizationId, session.user.id);
  const [entries, autoReload] = await Promise.all([listWalletEntries(organizationId, range), getAutoReload(organizationId)]);
  const promoFromLink = typeof params.code === "string" ? params.code.replace(/[^A-Za-z0-9-]/g, "").slice(0, 32).toUpperCase() : "";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Wallet</h1>
          <p>Manage prepaid credit and see what went into your balance.</p>
        </div>
        <span className={styles.workspace}><Building2 size={15} aria-hidden />{session.organization.name}</span>
      </header>

      <div className={styles.grid}>
        <section className={styles.hero} aria-labelledby="wallet-balance-label">
          <div className={styles.balanceSurface}>
            <h2 id="wallet-balance-label" className={styles.balanceLabel}><Wallet size={17} aria-hidden />Available balance</h2>
            <p className={styles.balance}>{formatCents(totals.balanceCents)} <small>USD</small></p>
            <p className={styles.balanceNote}>Use credit for eligible price checks and API calls as they become available.</p>
            <div className={styles.heroActions}>
              <AddMoneyButton balanceCents={totals.balanceCents} testMode={walletTestModeEnabled()} canManage={canManage} />
              {canRedeem ? <a href="#promo" className={styles.secondary}>Redeem a code<ArrowUpRight size={15} aria-hidden /></a> : null}
            </div>
          </div>
          <dl className={styles.stats}>
            <div className={styles.stat}><dt>Added</dt><dd>{formatCents(totals.addedCents)}</dd></div>
            <div className={styles.stat}><dt>Free credit</dt><dd>{formatCents(totals.creditsCents)}</dd></div>
            <div className={styles.stat}><dt>Used</dt><dd>{formatCents(totals.usedCents)}</dd></div>
          </dl>
        </section>

        <div className={styles.controls}>
          <AutoReloadCard initial={autoReload} canManage={canManage} />
          <PromoCard initialCode={promoFromLink} canRedeem={canRedeem} />
        </div>

        <section className={`${styles.card} ${styles.history}`} aria-labelledby="wallet-history-title">
          <div className={styles.historyHead}>
            <div className={styles.titleRow}>
              <span className={styles.cardIcon}><History size={18} aria-hidden /></span>
              <div>
                <h2 id="wallet-history-title">Billing history</h2>
                <p>Credits and charges, newest first.</p>
              </div>
            </div>
            <nav className={styles.ranges} aria-label="Date range">
              {(Object.keys(WALLET_RANGES) as WalletRange[]).map((key) => (
                <Link
                  key={key}
                  href={key === "all" ? "/app/wallet" : `/app/wallet?range=${key}`}
                  scroll={false}
                  aria-current={key === range ? "true" : undefined}
                  className={styles.range}
                >
                  {WALLET_RANGES[key]}
                </Link>
              ))}
            </nav>
          </div>
          {entries.length ? (
            <>
              <div className={styles.historyColumns} aria-hidden><span>Transaction</span><span>Status</span><span>Amount</span></div>
              <ol className={styles.entries} role="list">
                {entries.map((entry) => <EntryRow key={entry.id} entry={entry} />)}
              </ol>
            </>
          ) : (
            <div className={styles.empty}>
              <span className={styles.cardIcon}><History size={18} aria-hidden /></span>
              <strong>{range === "all" ? "No wallet activity yet" : "No activity in this range"}</strong>
              {range !== "all" ? <Link href="/app/wallet" scroll={false}>View all activity</Link> : null}
            </div>
          )}
          <p className={styles.historyFoot}>
            <span>{entries.length} {entries.length === 1 ? "entry" : "entries"}</span>
            <span>Only completed entries count toward your balance.</span>
          </p>
        </section>
      </div>
    </div>
  );
}
