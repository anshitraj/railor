import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, Gift, Plus, RotateCcw, SlidersHorizontal, Ticket, Wallet, type LucideIcon } from "lucide-react";
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
      <span className={styles.amount} data-sign={entry.amountCents > 0 ? "plus" : "minus"} data-muted={!counted} aria-label={`${entry.amountCents > 0 ? "Credit" : "Debit"} ${formatCents(Math.abs(entry.amountCents))}${counted ? "" : ", not counted"}`}>
        {formatCents(entry.amountCents, { signed: true })}
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
          <p>Prepaid Railor credit for {session.organization.name}. Everything below adds up to your balance.</p>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="wallet-balance-label">
        <div>
          <p id="wallet-balance-label" className={styles.balanceLabel}><Wallet size={16} aria-hidden />Available balance</p>
          <p className={styles.balance}>{formatCents(totals.balanceCents)}<small>USD</small></p>
          <p className={styles.balanceNote}>
            Credit will pay for metered checks and API calls as they launch. Nothing draws from it yet, so your balance only grows.
          </p>
        </div>
        <div className={styles.heroActions}>
          <AddMoneyButton balanceCents={totals.balanceCents} testMode={walletTestModeEnabled()} canManage={canManage} />
          <a href="#promo" className={styles.secondary}><Ticket size={16} aria-hidden />Redeem a code</a>
        </div>
        <dl className={styles.stats}>
          <div className={styles.stat}><dt><span>Added</span></dt><dd><strong>{formatCents(totals.addedCents)}</strong></dd></div>
          <div className={styles.stat}><dt><span>Free credit</span></dt><dd><strong>{formatCents(totals.creditsCents)}</strong></dd></div>
          <div className={styles.stat}><dt><span>Used</span></dt><dd><strong>{formatCents(totals.usedCents)}</strong></dd></div>
        </dl>
      </section>

      <div className={styles.grid}>
        <AutoReloadCard initial={autoReload} canManage={canManage} />
        <PromoCard initialCode={promoFromLink} canRedeem={canRedeem} />
      </div>

      <section className={`${styles.card} ${styles.history}`} aria-labelledby="wallet-history-title">
        <div className={styles.historyHead}>
          <div>
            <h2 id="wallet-history-title">Billing history</h2>
            <p>Every credit and charge, newest first.</p>
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
          <ol className={styles.entries}>
            {entries.map((entry) => <EntryRow key={entry.id} entry={entry} />)}
          </ol>
        ) : (
          <div className={styles.empty}>
            <strong>Nothing in this range</strong>
            <span>Pick “All time” to see every entry.</span>
          </div>
        )}
        <p className={styles.historyFoot}>
          {entries.length} {entries.length === 1 ? "entry" : "entries"} · {WALLET_RANGES[range]} · Pending and failed entries don’t count toward the balance.
        </p>
      </section>
    </div>
  );
}
