import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, X } from "lucide-react";
import { getSession } from "../../../lib/auth";
import { validateAuthorizeRequest } from "../../../lib/oauth-server";
import { ConsentActions } from "../../../components/oauth/consent-actions";
import styles from "../../../components/oauth/oauth.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connect an app", robots: { index: false } };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element -- small static brand mark */}
          <img src="/brand/railor-r.png" alt="" width={30} height={30} />Railor
        </div>
        {children}
      </div>
    </main>
  );
}

/** Where a chat app (ChatGPT, Claude) sends someone to let it use their workspace's Railor tools. */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const params = Object.fromEntries(Object.entries(raw).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : []))) as Record<string, string>;
  const query = new URLSearchParams(params).toString();
  const checked = await validateAuthorizeRequest(params);
  if (!checked.ok) {
    if ("redirect" in checked) redirect(checked.redirect);
    return <Shell><h1>Can’t connect this app</h1><p className={styles.warn}>{checked.show}</p><Link href="/app">Back to Railor</Link></Shell>;
  }

  const session = await getSession();
  const here = `/oauth/authorize?${query}`;
  if (!session) redirect(`/login?next=${encodeURIComponent(here)}`);
  if (!session.organization) redirect(`/welcome?next=${encodeURIComponent(here)}`);

  const { client, request } = checked;
  const host = new URL(request.redirectUri).host;
  const canApprove = session.role === "owner" || session.role === "admin";
  return (
    <Shell>
      <h1>Connect {client.name} to Railor</h1>
      <p className={styles.lead}><strong>{client.name}</strong> is asking to use Railor’s price and provider tools for your workspace.</p>
      <div className={styles.who}>
        <strong>{session.organization.name}</strong>
        <small>Signed in as {session.user.email}</small>
      </div>
      <ul className={styles.list}>
        <li className={styles.yes}><Check size={16} aria-hidden /><span>Compare transfer prices and look up provider coverage, fees and requirements.</span></li>
        <li className={styles.yes}><Check size={16} aria-hidden /><span>Each request counts toward your workspace’s monthly API allowance.</span></li>
        <li className={styles.no}><X size={16} aria-hidden /><span>It can’t send money, connect provider accounts, or change your workspace.</span></li>
      </ul>
      {canApprove ? null : <p className={styles.warn}>Only a workspace owner or admin can connect an app. Ask one of them to approve this.</p>}
      <ConsentActions query={query} host={host} canApprove={canApprove} />
      <p className={styles.note}>You’ll go back to {host}. Disconnect any time: Developers → All keys → revoke “{client.name} (OAuth)”.</p>
    </Shell>
  );
}
