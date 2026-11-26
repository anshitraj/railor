# How comparison sites get their quotes, and what Railor still lacks

Written 26 November 2026. Everything in the first section is what the sites say
about themselves on their own pages; nothing is inferred.

## 1. How Monito and MoneyTransfers.com get prices

| Site | What it says about its data | Source |
| --- | --- | --- |
| Monito | "Our preferred way is to collect real-time data from money transfer companies directly, which allows us to display very accurate information. When this is not possible, we collect data" by other means (the FAQ continues; read it before copying the wording). It scans live rates and fees, shows costs for at least two amounts, and compares each provider's rate with the latest mid-market rate. | https://monito.com/en/faq , https://monito.com/en/pledge-our-users , https://monito.com/en/wiki/monito-score |
| MoneyTransfers.com | Collects "the rates, fees, speed and other data via API, or collect it manually", for "all combinations of currencies, payment methods, payout methods, and various amounts (usually $2,000 and $10,000)". It earns revenue through partnerships with selected providers (affiliate links), and says these do not change the fee a customer pays. | https://moneytransfers.com/how-we-review , https://moneytransfers.com/editorial-policy |

What that means for Railor:

1. **The two sites do not scrape their way to the top. They have provider
   relationships.** Direct API/feed access is the "preferred" source and comes from
   a partner agreement (usually an affiliate or distribution programme). Everything
   else is manual collection on a schedule.
2. **They publish prices for fixed amounts across every payment and payout method.**
   Railor prices one profile and one amount at a time on demand. Pre-computing a
   grid (a few amounts, each funding and payout method) would make every guide and
   corridor page show a table, and would let the history chart fill in faster.
3. **Revenue is outbound clicks.** Railor now sends buttons through `/go/<provider>`,
   so a tracking and affiliate parameter can be added in one place. No affiliate
   agreement exists yet.

## 2. Where Railor's quotes come from today

- Wise's public comparison feed (market feed, labelled as such).
- Browser-agent reads of providers' own calculators for a short list
  (Xe, Ria, Western Union, Paysend, Instarem, WorldRemit, MoneyGram, Remitly, Xoom),
  rate-limited per hour. These need `TINYFISH_API_KEY` (or `TINY_FISH_API_KEY`).
- Published fee pages for providers with a fixed schedule (Skydo, Infinity, Mulya,
  Winvesta, PayGlocal and others) with the source page and date on each price.
- Account-level quotes where a workspace connects its own provider account.

## 3. What would add the most coverage, in order

1. **Partner or affiliate feeds** from the providers people compare most. This is
   what the two sites rely on, and it needs a signed agreement, not code. Providers
   that publish partner or affiliate programmes are the place to start; apply on the
   provider's own partner page. Railor cannot sign up on anyone's behalf.
2. **More calculators read by the browser agent.** Each needs a verified entry page
   and a check that it returns a price for the corridor; the existing
   `provider-calculators.ts` pattern covers it. Candidates are providers whose public
   calculators already work for the corridors Railor serves.
3. **A pre-computed price grid** (see section 1, point 2).
4. **The RBI's authorised cross-border payment aggregators** (below): a first-party,
   current list of platforms allowed to take export payments into India.

## 4. RBI-authorised cross-border payment aggregators (PA-CB)

Source: the RBI's "Certificates of Authorisation issued under the Payment and
Settlement Systems Act", https://rbi.org.in/scripts/PublicationsView.aspx?id=12043 .
Category: O = outward, I = inward (receiving into India), I & O = both. The list is
authority to operate, not a product with a public price: each needs its own pricing
page reviewed before it can be listed.

Already tracked by Railor: Skydo, Xflow, PayGlocal, Razorpay, Cashfree.

Not tracked yet (inward or both): Adyen India (O), Airpay (I & O), AuroPay /
Aurionpro (I & O), Easebuzz (I & O), ePAYnow / Finlogic (I & O), Getepay / Futuretek
(I & O), GoBrisk (I & O), Arthpay / GVP Infotech (I & O), ISGPAY / In-Solutions
Global (I & O), Billdesk / IndiaIdeas.com (I & O), Jio Payment Solutions (I & O),
Juspay (I & O), Les Amis (I & O), Lyra Network (I & O), Mpay / MMAD Communications
(I & O), Pay10 (I & O), Paymentz / Payment Gateway Solutions (I & O), Paytm Payments
Services (I & O), PayU (I & O), Pine Labs Online (I & O), SabPaisa / SRS Live
Technologies (I & O), Toucan Payments (I & O), Trade Pe Tech (I), Unlimit (I & O),
VegaaH / Concerto Software (I & O), PayG / Xsilica Software (I & O), Worldline
ePayments (I & O), Zoho Payment Technologies (I), Wise Payments India (I).

Most of these are gateways that sell to merchants. The ones with a freelancer or
exporter product (for example Zoho, Toucan, Easebuzz, Pay10, SabPaisa) are the
likeliest "hidden gems"; the rest only matter for business receiving.

## 5. What needs a signed relationship or credentials, and what does not

| Needs | Examples | Why |
| --- | --- | --- |
| A partner or affiliate agreement | Direct rate feeds from remittance providers | Both reference sites say this is their preferred source. |
| An API key from the provider | Airwallex, Nium, Xflow, dLocal, Bridge, Circle | Already named in `.env.example`; each needs an account and the provider's approval. |
| Nothing but a verified public page | Fixed fee schedules, public calculators | Add the source URL and date; the browser agent can read calculators. |
| Not available | Trustpilot-style scores, other sites' proprietary rankings | Not Railor's data. Do not display scores Railor cannot source. |

Railor's own API keys already in the environment (Gemini, Tavily, Firecrawl, Parallel,
TinyFish) read and summarise public pages. They can find and extract a price that a
provider publishes; they cannot create a price a provider does not publish, and
nothing should present such a guess as a quote.
