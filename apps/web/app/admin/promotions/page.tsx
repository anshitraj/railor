import Link from "next/link";
import { asc, desc, eq, sql } from "drizzle-orm";
import { currencies, discountCodeUsage, getDb, providerOffers, providerPromotions, providers, walletEntries, walletPromoCodes } from "@railor/database";
import { remittanceProviderCatalog } from "@railor/core";
import { AdminHeader } from "../../../components/admin/admin-shell";
import { ProviderLogo } from "../../../components/app/provider-logo";
import { dodoConfig } from "../../../lib/billing/config";
import { activatePromotion, createCreditCode, createDiscountCode, createOffer, revokePromotion, setPromotionActive } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operations · Promotions" };

const TABS = [
  { id: "offers", label: "Provider offers", blurb: "Offers a provider publishes, shown beside its price with the provider’s own page as the source. They never change an amount or the ranking." },
  { id: "featured", label: "Paid placements", blurb: "Verify that a sponsorship payment has settled before activating. The provider is labelled Promoted on the selected currency pair only; its price and rank stay as calculated." },
  { id: "codes", label: "Discount codes", blurb: "Money off Railor plans and wallet top-ups. Card checkouts need the same code at Dodo Payments, which Railor creates for you when Dodo is connected." },
  { id: "credit", label: "Wallet credit", blurb: "Codes a workspace redeems once for wallet credit, from the Wallet page." },
] as const;
type Tab = (typeof TABS)[number]["id"];

const input = "min-h-10 w-full rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 text-[14px]";
const label = "grid gap-1 text-[12.5px] font-semibold text-[var(--color-ink-soft)]";
const hint = "text-[12px] font-normal text-[var(--color-muted)]";
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const day = (date: Date | null) => date ? date.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—";

function windowState(active: boolean, startsAt: Date | null, endsAt: Date | null, now: Date) {
  if (!active) return { text: "Off", tone: "off" };
  if (startsAt && startsAt > now) return { text: `Starts ${day(startsAt)}`, tone: "wait" };
  if (endsAt && endsAt < now) return { text: "Ended", tone: "off" };
  return { text: endsAt ? `Live · ends ${day(endsAt)}` : "Live", tone: "live" };
}
function Status({ state }: { state: { text: string; tone: string } }) {
  const tone = state.tone === "live" ? "bg-[var(--color-ok-bg)] text-[var(--color-ok)]" : state.tone === "wait" ? "bg-[#fff1d6] text-[#7a4f0e]" : "bg-[var(--color-canvas)] text-[var(--color-muted)]";
  return <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold ${tone}`}>{state.text}</span>;
}
function Toggle({ kind, id, active }: { kind: "offer" | "discount" | "credit"; id: string; active: boolean }) {
  return (
    <form action={setPromotionActive}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={String(!active)} />
      <button className={`min-h-9 rounded-full px-3 text-[12.5px] font-semibold ${active ? "border border-[var(--color-line-strong)]" : "bg-[var(--color-ink)] text-white"}`}>{active ? "Switch off" : "Switch on"}</button>
    </form>
  );
}
function Window() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={label}>Starts (UTC, optional)<input type="datetime-local" name="startsAt" className={input} /></label>
      <label className={label}>Ends (UTC, optional)<input type="datetime-local" name="endsAt" className={input} /></label>
    </div>
  );
}
function Corridor() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={label}>From currency <span className={hint}>Blank for any</span><input name="sourceCurrency" maxLength={3} placeholder="USD" className={`${input} uppercase`} /></label>
      <label className={label}>To currency <span className={hint}>Blank for any</span><input name="destinationCurrency" maxLength={3} placeholder="INR" className={`${input} uppercase`} /></label>
    </div>
  );
}
const card = "grid gap-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5";
const submit = "min-h-11 w-fit rounded-full bg-[var(--color-ink)] px-5 text-[14px] font-semibold text-white";

export default async function PromotionsPage({ searchParams }: { searchParams: Promise<{ tab?: string; notice?: string; error?: string }> }) {
  const params = await searchParams;
  const tab: Tab = TABS.some((item) => item.id === params.tab) ? (params.tab as Tab) : "offers";
  const db = await getDb();
  const now = new Date();
  const [offers, placements, codes, credits, creditUse, known, codesList] = await Promise.all([
    db.select().from(providerOffers).orderBy(desc(providerOffers.createdAt)).limit(100),
    db.select({ promotion: providerPromotions, provider: providers.name }).from(providerPromotions)
      .innerJoin(providers, eq(providers.slug, providerPromotions.providerSlug)).orderBy(desc(providerPromotions.confirmedAt)).limit(100),
    discountCodeUsage(db),
    db.select().from(walletPromoCodes).orderBy(desc(walletPromoCodes.createdAt)).limit(100),
    db.select({ code: walletEntries.reference, n: sql<number>`count(*)::int`, cents: sql<number>`coalesce(sum(${walletEntries.amountCents}), 0)::int` }).from(walletEntries).where(eq(walletEntries.kind, "promo_credit")).groupBy(walletEntries.reference),
    db.select({ slug: providers.slug, name: providers.name }).from(providers).where(eq(providers.isDemo, false)).orderBy(asc(providers.name)),
    db.select({ code: currencies.code }).from(currencies).orderBy(desc(currencies.popularity), asc(currencies.code)),
  ]);
  const slugs = [...new Map([...known, ...remittanceProviderCatalog().map((item) => ({ slug: item.slug, name: item.name }))].map((item) => [item.slug, item])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const dodo = Boolean(dodoConfig());
  const current = TABS.find((item) => item.id === tab)!;
  const live = {
    offers: offers.filter((row) => windowState(row.active, row.startsAt, row.endsAt, now).tone === "live").length,
    featured: placements.filter(({ promotion }) => !promotion.revokedAt && promotion.endsAt > now).length,
    codes: codes.filter(({ code }) => windowState(code.active, code.startsAt, code.endsAt, now).tone === "live").length,
    credit: credits.filter((row) => windowState(row.active, row.startsAt, row.expiresAt, now).tone === "live").length,
  };

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <AdminHeader title="Promotions" description="Offers, sponsored placements and codes. Every change is recorded in the audit log." />
      <datalist id="provider-slugs">{slugs.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</datalist>

      <nav className="flex flex-wrap gap-2" aria-label="Promotion types">
        {TABS.map((item) => (
          <Link key={item.id} href={`/admin/promotions?tab=${item.id}`} aria-current={tab === item.id ? "page" : undefined}
            className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold ${tab === item.id ? "bg-[var(--color-ink)] text-white" : "border border-[var(--color-line)] bg-[var(--color-surface)]"}`}>
            {item.label}<span className={`rounded-full px-1.5 text-[12px] ${tab === item.id ? "bg-white/15" : "bg-[var(--color-canvas)]"}`}>{live[item.id]} live</span>
          </Link>
        ))}
      </nav>
      <p className="-mt-2 max-w-3xl text-[13.5px] text-[var(--color-muted)]">{current.blurb}</p>
      {params.notice ? <p role="status" className="rounded-xl bg-[var(--color-ok-bg)] px-4 py-3 text-[13.5px] font-semibold text-[var(--color-ok)]">{params.notice}</p> : null}
      {params.error ? <p role="alert" className="rounded-xl bg-[var(--color-bad-bg)] px-4 py-3 text-[13.5px] font-semibold text-[var(--color-bad)]">{params.error}</p> : null}

      {tab === "offers" ? <>
        <form action={createOffer} className={card}>
          <h2 className="text-[15px] font-semibold">Add a provider offer</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>Provider<input name="providerSlug" list="provider-slugs" required placeholder="wise" className={input} /></label>
            <label className={label}>Type<select name="kind" className={input}><option value="fee_free">Fee-free transfer</option><option value="better_rate">Better rate</option><option value="bonus">Bonus or cashback</option><option value="other">Other</option></select></label>
          </div>
          <label className={label}>Headline <span className={hint}>Shown on the price row, up to 60 characters</span><input name="headline" required maxLength={60} placeholder="First transfer fee-free" className={input} /></label>
          <label className={label}>Terms <span className={hint}>Who qualifies and the limits, as the provider states them</span><textarea name="terms" required maxLength={400} rows={3} placeholder="New customers only, on their first transfer up to 1,000 USD." className={`${input} py-2`} /></label>
          <label className={label}>Provider’s offer page <span className={hint}>The source; must be the provider’s own https page</span><input name="sourceUrl" type="url" required placeholder="https://…" className={input} /></label>
          <Corridor />
          <fieldset className="grid gap-2"><legend className={label}>Profiles <span className={hint}>None ticked means everyone</span></legend>
            <div className="flex flex-wrap gap-4 text-[13.5px]">{["personal", "freelancer", "business"].map((profile) => <label key={profile} className="inline-flex items-center gap-2 capitalize"><input type="checkbox" name="profiles" value={profile} />{profile}</label>)}</div>
          </fieldset>
          <label className="inline-flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="newCustomersOnly" defaultChecked />New customers only</label>
          <Window />
          <button className={submit}>Add offer</button>
        </form>
        <section className="grid gap-2">
          {offers.length ? offers.map((row) => (
            <article key={row.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
              <ProviderLogo slug={row.providerSlug} name={row.providerSlug} size={32} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold">{row.headline}<Status state={windowState(row.active, row.startsAt, row.endsAt, now)} /></p>
                <p className="text-[12.5px] text-[var(--color-muted)]">{row.providerSlug} · {row.sourceCurrency ?? "any"} → {row.destinationCurrency ?? "any"} · {row.profiles?.join(", ") ?? "all profiles"}{row.newCustomersOnly ? " · new customers" : ""}</p>
                <p className="mt-1 text-[13px]">{row.terms} <a href={row.sourceUrl} target="_blank" rel="noreferrer noopener" className="font-semibold text-[var(--color-orange-deep)]">Source</a></p>
              </div>
              <Toggle kind="offer" id={row.id} active={row.active} />
            </article>
          )) : <p className="rounded-2xl border border-dashed border-[var(--color-line-strong)] p-5 text-[13px] text-[var(--color-muted)]">No offers yet.</p>}
        </section>
      </> : null}

      {tab === "featured" ? <>
        <form action={activatePromotion} className={`${card} sm:grid-cols-2`}>
          <h2 className="text-[15px] font-semibold sm:col-span-2">Activate a paid placement</h2>
          <label className={label}>Provider<select name="providerSlug" required defaultValue="" className={input}><option value="" disabled>Choose a provider</option>{known.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
          <label className={label}>Verified payment reference<input name="paymentReference" required minLength={4} maxLength={160} className={input} /></label>
          <label className={label}>Sending currency<select name="sourceCurrency" required defaultValue="USD" className={input}>{codesList.map(({ code }) => <option key={code}>{code}</option>)}</select></label>
          <label className={label}>Receiving currency<select name="destinationCurrency" required defaultValue="INR" className={input}>{codesList.map(({ code }) => <option key={code}>{code}</option>)}</select></label>
          <label className={label}>Settled amount in USD<input name="paidUsd" type="number" min="0.01" step="0.01" required className={input} /></label>
          <label className={label}>Placement days<input name="days" type="number" min={1} max={365} defaultValue={30} required className={input} /></label>
          <label className="flex items-center gap-2 text-[13.5px] sm:col-span-2"><input name="settled" type="checkbox" required />I verified this settled payment in the payment provider.</label>
          <button className={`${submit} sm:col-span-2`}>Activate placement</button>
        </form>
        <section className="grid gap-2" aria-label="Placement history">
          {placements.length ? placements.map(({ promotion, provider }) => {
            const running = !promotion.revokedAt && promotion.endsAt > now;
            return (
              <article key={promotion.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
                <ProviderLogo slug={promotion.providerSlug} name={provider} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold">{provider} · {promotion.sourceCurrency} → {promotion.destinationCurrency}<Status state={promotion.revokedAt ? { text: "Ended", tone: "off" } : running ? { text: `Live · ends ${day(promotion.endsAt)}`, tone: "live" } : { text: "Expired", tone: "off" }} /></p>
                  <p className="text-[12.5px] text-[var(--color-muted)]">{money(promotion.paidUsdCents)} received · ref <span className="break-all">{promotion.paymentReference}</span></p>
                </div>
                {running ? <form action={revokePromotion}><input type="hidden" name="id" value={promotion.id} /><button className="min-h-9 rounded-full border border-[var(--color-line-strong)] px-3 text-[12.5px] font-semibold">End placement</button></form> : null}
              </article>
            );
          }) : <p className="rounded-2xl border border-dashed border-[var(--color-line-strong)] p-5 text-[13px] text-[var(--color-muted)]">No paid placements yet.</p>}
        </section>
      </> : null}

      {tab === "codes" ? <>
        {!dodo ? <p className="rounded-xl border border-[#f0d39a] bg-[#fff8ea] px-4 py-3 text-[13px]">Dodo Payments isn’t connected, so new codes work for USDC checkouts only. Codes created after the Dodo keys are added also work for card and UPI.</p> : null}
        <form action={createDiscountCode} className={card}>
          <h2 className="text-[15px] font-semibold">Create a discount code</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>Code <span className={hint}>3–16 letters, digits, - or _</span><input name="code" required maxLength={16} placeholder="LAUNCH20" className={`${input} font-mono uppercase`} /></label>
            <label className={label}>Description <span className={hint}>Internal</span><input name="description" maxLength={120} placeholder="Launch week, Product Hunt" className={input} /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={label}>Type<select name="kind" className={input}><option value="percent">Percent off</option><option value="amount">Amount off (USD)</option></select></label>
            <label className={label}>Percent off<input name="percent" type="number" min={1} max={100} step={1} placeholder="20" className={input} /></label>
            <label className={label}>Amount off, $<input name="amountOff" type="number" min={0.5} max={500} step={0.01} placeholder="5.00" className={input} /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={label}>Applies to<select name="appliesTo" className={input}><option value="plan">Plans</option><option value="top_up">Wallet top-ups</option><option value="any">Both</option></select></label>
            <label className={label}>Months <span className={hint}>How many monthly payments it discounts</span><input name="cycles" type="number" min={1} max={24} defaultValue={1} className={input} /></label>
            <label className={label}>Use limit <span className={hint}>Blank for unlimited</span><input name="maxRedemptions" type="number" min={1} className={input} /></label>
          </div>
          <fieldset className="grid gap-2"><legend className={label}>Plans <span className={hint}>None ticked means every plan</span></legend>
            <div className="flex flex-wrap gap-4 text-[13.5px]">{["plus", "pro", "business"].map((plan) => <label key={plan} className="inline-flex items-center gap-2 capitalize"><input type="checkbox" name="plans" value={plan} />{plan}</label>)}</div>
          </fieldset>
          <Window />
          <button className={submit}>Create code</button>
        </form>
        <section className="grid gap-2">
          {codes.length ? codes.map(({ code, redemptions, discountedCents, pendingCheckouts }) => (
            <article key={code.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold"><code className="rounded-md bg-[var(--color-canvas)] px-2 py-0.5">{code.code}</code>{code.kind === "percent" ? `${(code.percentBps ?? 0) / 100}% off` : `${money(code.amountOffCents ?? 0)} off`}<Status state={windowState(code.active, code.startsAt, code.endsAt, now)} /></p>
                <p className="text-[12.5px] text-[var(--color-muted)]">{code.appliesTo === "any" ? "Plans and top-ups" : code.appliesTo === "plan" ? `Plans${code.plans?.length ? ` (${code.plans.join(", ")})` : ""}` : "Top-ups"} · {code.cycles} {code.cycles === 1 ? "month" : "months"} · {code.dodoDiscountId ? "card + USDC" : "USDC only"}{code.description ? ` · ${code.description}` : ""}</p>
                <p className="text-[12.5px]">{redemptions} used{code.maxRedemptions ? ` of ${code.maxRedemptions}` : ""} · {money(discountedCents)} given{pendingCheckouts ? ` · ${pendingCheckouts} checkout${pendingCheckouts === 1 ? "" : "s"} open` : ""}</p>
              </div>
              <Toggle kind="discount" id={code.id} active={code.active} />
            </article>
          )) : <p className="rounded-2xl border border-dashed border-[var(--color-line-strong)] p-5 text-[13px] text-[var(--color-muted)]">No discount codes yet.</p>}
        </section>
      </> : null}

      {tab === "credit" ? <>
        <form action={createCreditCode} className={card}>
          <h2 className="text-[15px] font-semibold">Create a credit code</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={label}>Code<input name="code" required maxLength={32} placeholder="WELCOME5" className={`${input} font-mono uppercase`} /></label>
            <label className={label}>Credit, $<input name="amount" type="number" required min={0.5} max={500} step={0.01} placeholder="5.00" className={input} /></label>
            <label className={label}>Use limit <span className={hint}>Blank for unlimited</span><input name="maxRedemptions" type="number" min={1} className={input} /></label>
          </div>
          <label className={label}>Label <span className={hint}>Shown in the workspace’s wallet history</span><input name="label" required maxLength={80} placeholder="Welcome credit" className={input} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>Starts (UTC, optional)<input type="datetime-local" name="startsAt" className={input} /></label>
            <label className={label}>Expires (UTC, optional)<input type="datetime-local" name="expiresAt" className={input} /></label>
          </div>
          <button className={submit}>Create code</button>
        </form>
        <section className="grid gap-2">
          {credits.length ? credits.map((row) => {
            const use = creditUse.find((item) => item.code === row.code);
            return (
              <article key={row.code} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold"><code className="rounded-md bg-[var(--color-canvas)] px-2 py-0.5">{row.code}</code>{money(row.amountCents)} credit<Status state={windowState(row.active, row.startsAt, row.expiresAt, now)} /></p>
                  <p className="text-[12.5px] text-[var(--color-muted)]">{row.label} · {use?.n ?? 0} redeemed{row.maxRedemptions ? ` of ${row.maxRedemptions}` : ""} · {money(use?.cents ?? 0)} given</p>
                </div>
                <Toggle kind="credit" id={row.code} active={row.active} />
              </article>
            );
          }) : <p className="rounded-2xl border border-dashed border-[var(--color-line-strong)] p-5 text-[13px] text-[var(--color-muted)]">No credit codes yet.</p>}
        </section>
      </> : null}
    </div>
  );
}
