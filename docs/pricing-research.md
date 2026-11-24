# Railor plans: competitor pricing research and recommendation

Researched 24 November 2026. Every price below comes from the competitor's own
page or app-store listing, or from a dated third-party review of that page
when the page itself wasn't readable. Re-check these numbers before you quote
them in public.

## The short answer

| Plan | Price | Who it's for | Headline limits |
|---|---|---|---|
| Free | $0 | Anyone checking a price | Unlimited price checks, 12 saved transfers, **1 rate alert**, 500 API requests a month |
| Plus | **$2.99 / month** | People who send money often | **10 rate alerts**, 25 saved transfers, email on route changes, 1,000 API requests |
| Pro | **$9.99 / month** | Freelancers and small teams paid from abroad | 25 rate alerts, 50 saved transfers, your own provider connections, 10,000 API/MCP requests |
| Business | **$29 / month** | Finance teams, products built on Railor | 100 rate alerts, 200 saved transfers, 100,000 API/MCP requests |
| Enterprise | Contact us | Platforms, banks, high volume | Custom volume, data feeds, uptime commitment |
| Pay per usage | Coming soon | Developers and agents with spiky usage | Wallet top-up, pay per call |

Checking what arrives stays free on every plan, signed in or not. That's the
rule: **Railor never charges for the answer, only for watching it for you.**

The existing $29 "Founding" plan keeps working and now gets Business limits,
so early payers lose nothing.

## 1. What competitors charge

### Rate alerts are free almost everywhere

| Who | What's free | Source |
|---|---|---|
| Wise | Rate alerts by email or push, daily updates | wise.com/gb/tools/exchange-rate-alerts |
| XE | Rate alerts in the app | xe.com/ratealerts |
| Western Union | Rate alerts in the app | westernunion.com blog, Nov 2026 |
| RemitFinder | Email and mobile rate alerts, "completely free" | remitfinder.com/about |
| RemitRate | Email rate notifications, daily or at a target | remitrate.com/notifications |
| Monito | Comparison across 100+ providers, free to use | monito.com |

**What this means:** nobody will pay $2.99 for a plain mid-market rate alert,
because Wise gives one away. Railor's paid alert has to be the one they can't
get anywhere else: **"email me when what actually arrives, after fees, GST and
receipts, gets better, across every provider."** That's what the alert already
checks: it only counts complete exact, live public or published prices, never
market estimates or partial rows.

### Paid currency apps sit at $2–$7 a month

| App | Monthly | Yearly | Source |
|---|---|---|---|
| Currency Converter · Rate Alerts | $1.99–$2.99 | $12.99–$17.99 | App Store |
| CurrencyX Pro | $3.99 | $19.99 | App Store |
| Rates: Currency Converter | $4.99 | $19.99 | App Store |
| FX Sentinel | $4.99 | $49.99 | App Store |
| Verte | $6.99 | $29.99 | App Store |

$2.99 sits in the middle of this band. These apps sell mid-market rates and
widgets; Railor sells the complete price across providers, so it is worth at
least as much.

### Deal-alert memberships: the closest business model

| Product | Free tier | Paid | Source |
|---|---|---|---|
| Going (flight deals) | "Limited", a subset of deals | Premium $49/yr (~$4/mo), Elite $199/yr | going.com, help.going.com |
| Keepa (Amazon prices) | Price history and drop alerts | Pro €29/mo | sellertoolsindex.com, sellersonar.com |

Going is the best template: a useful free tier, a cheap premium tier sold
yearly, and a pricier tier for serious users. Plus maps to Going Premium.

### FX data APIs: what developers already pay

| API | Entry plan | Higher plan | Source |
|---|---|---|---|
| Open Exchange Rates | $12/mo for 10,000 requests | $47/mo for 100,000; $97 unlimited | openexchangerates.org/signup |
| Fixer | $14.99/mo for 10,000 | $59.99/mo for 100,000 | fixer.io/pricing |
| currencylayer | $14.99/mo for 10,000 | $59.99/mo | exchangerate.dev comparison |
| currencyapi | $9.99/mo for 15,000 | | exchangerate.dev |

These APIs sell **mid-market rates only**. Railor's API returns what arrives
through each provider, with fees, tax and sources. So:

- **Pro at $9.99 for 10,000 requests** undercuts Open Exchange Rates ($12) and
  Fixer ($14.99) for the same volume, with richer data.
- **Business at $29 for 100,000 requests** undercuts Open Exchange Rates ($47)
  and Fixer ($59.99).

### Enterprise pricing data

FXC Intelligence sells remittance pricing benchmarks to Remitly, Intermex and
others. Prices aren't published (custom contracts). Railor's Enterprise
"Contact us" tier is the low-cost alternative for smaller platforms.

### What the India audience already pays

| Product | Price | Source |
|---|---|---|
| Skydo transfer fee | $19 up to $2,000; $29 up to $10,000 | infinityapp.in Skydo review |
| Refrens (invoicing) | from ~$25/month, or $220/year | Capterra |
| ChatGPT Go, India | ₹399/month | help.openai.com |

A freelancer paying Skydo $19–$29 per transfer saves more than $2.99 the first
time an alert moves them to a cheaper route. ₹399 is the ceiling Indian
consumers accept for a mainstream subscription, so Plus in rupees should sit
well under it.

## 2. Unit economics at these prices

### Payment fees eat a lot of a $2.99 charge

| Charge | Stripe fee | You keep |
|---|---|---|
| $2.99 monthly, US card (2.9% + 30¢) | $0.39 (13%) | $2.60 |
| $2.99 monthly, foreign card + conversion (5.4% + 30¢) | $0.46 (15.5%) | $2.53 |
| $29.90 yearly, US card | $1.17 (3.9%) | $28.73 |
| $9.99 monthly, US card | $0.59 (5.9%) | $9.40 |

Source: stripe.com/pricing; international card +1.5% and conversion +1% from
several 2026 fee guides.

Razorpay (for Indian customers): international cards 3% plus 18% GST on the
fee. Check its pricing page for domestic UPI and card rates before launch.

**Recommendation:** offer **Plus yearly at $29.90 (2 months free)** and nudge
people toward it. The 30¢ fixed fee is what hurts at $2.99, and yearly billing
pays it once instead of twelve times.

### Running costs are tiny

- **Price checks:** the checker runs one price check per distinct workspace
  and transfer, once a day, and nearly all sources are public. Compute is
  pennies per thousand checks on Vercel.
- **Email (Resend):** free for 3,000 a month but **at most 100 a day**; Pro is
  $20/month for 50,000. An alert emails only when a price crosses the target,
  so a few hundred users fit inside the free tier. Sign-in emails share the
  same 100-a-day cap, so move to Resend Pro ($20) before launch traffic.
- **Margin:** at 100 Plus subscribers (~$260/month after Stripe), email and
  compute cost under $25. Gross margin stays above 90%.

## 3. Pricing in rupees (recommended)

Most early users are Indian freelancers. A dollar price charged to an Indian
card costs them their bank's forex markup and costs you Stripe's +2.5%. Set
local prices (rounded, tax-inclusive) and collect through Razorpay or UPI:

| Plan | USD | Suggested INR |
|---|---|---|
| Plus | $2.99 | ₹199/month or ₹1,999/year |
| Pro | $9.99 | ₹699/month |
| Business | $29 | ₹2,499/month |

₹199 sits under ChatGPT Go's ₹399, which is the right place for a utility.
Confirm GST treatment with an accountant: an Indian entity selling to Indian
consumers charges 18% GST, so decide whether the shown price includes it.

## 4. Pay per usage (coming soon)

The wallet already exists, with a $5 signup credit and an append-only ledger.
Once it's metered, people top up and pay per call with no plan. Suggested
starting rates, chosen to sit below the per-request price of the FX APIs above:

| Use | Suggested price |
|---|---|
| API or MCP price comparison | $0.002 per call ($2 per 1,000) |
| Catalog and provider lookups | $0.0005 per call |
| Extra rate-alert check (beyond plan) | $0.01 per alert per day |

For comparison: TinyFish keeps search and fetch free and bills agents per step
from a wallet; Tavily charges $0.008 per credit pay-as-you-go. Keep Railor's
price checks free in the app; meter only API and agent use.

## 5. What's built now (this commit)

- Plan limits in `apps/web/lib/plans.ts`: Free 1 alert, Plus 10, Pro 25,
  Business 100, all enforced when an alert is set (under a workspace lock).
- After a downgrade, the checker keeps the oldest alerts within the new limit
  running; the rest pause until the plan returns or alerts are removed.
- Saved-transfer limits now follow the plan (12 / 25 / 50 / 200).
- `/app/upgrade` and a new public `/pricing` page show all five plans and a
  "Pay per usage — coming soon" section.
- Checkout uses one Stripe Payment Link per plan: `PLUS_PAYMENT_LINK`,
  `PRO_PAYMENT_LINK` and `BUSINESS_PAYMENT_LINK` (Business falls back to the
  old `FOUNDING_PAYMENT_LINK`). Enterprise "Contact us" uses `CONTACT_EMAIL`.
- Admin plan activation can grant any plan.
- Migration `0029_paid_plans` adds the plan values to the database enum.

## 6. Open decisions

1. **Yearly billing.** Recommended for Plus ($29.90/yr). Not built yet; it
   needs a second payment link per plan.
2. **Rupee prices.** Recommended. Needs Razorpay payment links and a GST
   decision.
3. **Per-workspace vs per-person alerts.** Limits count per workspace, like
   every other Railor limit. A team on Plus shares 10 alerts.
4. **Faster checks for paid plans.** Alerts are checked daily (Vercel Hobby
   cron limit). Checking hourly on Pro and Business would be a good selling
   point, but needs Vercel Pro or a GCP Cloud Scheduler job calling the same
   route. Don't advertise it until it runs.
5. **Free trial.** Going and most app-store competitors offer one. A 7-day Pro
   trial would let freelancers try their own provider connections.
