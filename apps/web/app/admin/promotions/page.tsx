import { asc, desc, eq } from "drizzle-orm";
import { currencies, getDb, providerPromotions, providers } from "@railor/database";
import { redirect } from "next/navigation";
import { getSession } from "../../../lib/auth";
import { AdminHeader } from "../../../components/admin/admin-shell";
import { activatePromotion, revokePromotion } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Provider promotions" };

const feedback = {
  activated: "Paid promotion activated.",
  revoked: "Promotion ended.",
  duplicate: "This payment reference has already been used.",
  invalid: "Select a valid provider and pair, enter the settled payment details, and confirm payment.",
} as const;
const field = "rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-2.5";
const label = "grid gap-1 text-sm font-medium";

export default async function PromotionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await getSession();
  if (!session?.user.isAdmin) redirect("/login?next=/admin/promotions");
  const db = await getDb();
  const [catalog, codes, campaigns, params] = await Promise.all([
    db.select({ slug: providers.slug, name: providers.name }).from(providers).where(eq(providers.isDemo, false)).orderBy(asc(providers.name)),
    db.select({ code: currencies.code }).from(currencies).orderBy(desc(currencies.popularity), asc(currencies.code)),
    db.select({ promotion: providerPromotions, provider: providers.name }).from(providerPromotions)
      .innerJoin(providers, eq(providers.slug, providerPromotions.providerSlug)).orderBy(desc(providerPromotions.confirmedAt)).limit(100).catch(() => null),
    searchParams,
  ]);
  if (!campaigns) return (
    <div className="max-w-4xl space-y-4">
      <AdminHeader title="Provider promotions" description="Promotion storage is unavailable." />
      <p role="status" className="text-sm text-[var(--color-muted)]">Check the database connection and confirm that the provider promotions migration has run.</p>
    </div>
  );
  const message = params.status && Object.hasOwn(feedback, params.status) ? feedback[params.status as keyof typeof feedback] : null;
  const listingTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
  const now = Date.now();

  return <div className="max-w-4xl space-y-6">
    <AdminHeader title="Provider promotions" description="Verify that a sponsorship payment has settled before activating. Placement is labelled Promoted and applies only to the selected currency pair." />
    {message && <p role="status" className="rounded-lg bg-[var(--color-sand)] p-3 text-sm">{message}</p>}
    <form action={activatePromotion} className="grid gap-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 sm:grid-cols-2">
      <div className={label}><label htmlFor="promotion-provider">Provider</label><select id="promotion-provider" className={field} name="providerSlug" required defaultValue=""><option value="" disabled>Choose a provider</option>{catalog.map(p => <option value={p.slug} key={p.slug}>{p.name}</option>)}</select></div>
      <label className={label}>Verified payment reference<input className={field} name="paymentReference" required minLength={4} maxLength={160} /></label>
      <label className={label}>Sending currency<select className={field} name="sourceCurrency" required defaultValue="USD">{codes.map(({ code }) => <option key={code}>{code}</option>)}</select></label>
      <label className={label}>Receiving currency<select className={field} name="destinationCurrency" required defaultValue="INR">{codes.map(({ code }) => <option key={code}>{code}</option>)}</select></label>
      <label className={label}>Settled amount in USD<input className={field} name="paidUsd" type="number" min="0.01" step="0.01" required /></label>
      <label className={label}>Placement days<input className={field} name="days" type="number" min={1} max={365} defaultValue={30} required /></label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input name="settled" type="checkbox" required /> I verified this settled payment in the payment provider.</label>
      <button className="min-h-11 justify-self-start rounded-full bg-[var(--color-action)] px-5 text-sm font-semibold text-white sm:col-span-2">Activate promotion</button>
    </form>
    <section aria-label="Promotion history">
      <h2 className="mb-3 text-lg font-semibold">Promotion history</h2>
      {campaigns.length === 0 && <p className="text-sm text-[var(--color-muted)]">No promotions recorded.</p>}
      <ul className="divide-y divide-[var(--color-line)]">
        {campaigns.map(({ promotion, provider }) => {
          const active = !promotion.revokedAt && promotion.endsAt.getTime() > now;
          return <li key={promotion.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <div>
              <strong>{provider} · {promotion.sourceCurrency} → {promotion.destinationCurrency}</strong>
              <p className="mt-1 text-[var(--color-muted)]">{promotion.revokedAt ? "Ended" : active ? "Active" : "Expired"} · Ends {listingTime.format(promotion.endsAt)} UTC · ${(promotion.paidUsdCents / 100).toFixed(2)} received</p>
              <p className="mt-1 break-all text-xs text-[var(--color-muted)]">{promotion.paymentReference}</p>
            </div>
            {active && <form action={revokePromotion}><input type="hidden" name="id" value={promotion.id} /><button className="min-h-10 rounded-lg border border-[var(--color-line)] px-3 font-semibold">End promotion</button></form>}
          </li>;
        })}
      </ul>
    </section>
  </div>;
}
