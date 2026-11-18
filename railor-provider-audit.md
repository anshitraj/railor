# Railor provider and pricing audit

**Version:** branch `feat/stablecoin-inr-and-picker-ui`, HEAD `9905a3d861ee1de9a7f85a3ab9cc6699fd564428`; current working tree including pre-existing modifications and untracked comparison/history files. **Date:** 18 November 2026, Asia/Kolkata. Public numeric checks ran approximately **18:12 IST / 12:42 UTC**.

**Method:** source tracing, current module execution with real anonymous public endpoint responses, and SELECTs against the configured PostgreSQL database in an explicit REPEATABLE READ, READ ONLY transaction followed by rollback. No application files, migrations, seeds, account credentials, conformance records or deployed configuration were changed. No payments, authenticated provider calls or paid background web-checks were triggered. Only audit artifacts were created. The configured database is not proof of the currently deployed application revision. Browser behavior was traced in source, not visually tested.

Exports: [full source inventory](railor-provider-inventory.csv), [72 numeric result rows with field provenance](railor-price-audit-results.csv), [76 exact stablecoin provider-route entries](railor-stablecoin-routes.csv). Inventory rows are sources/products, not provider counts.

## Counts and method

| Measure | Count | Counting method / evidence |
|---|---:|---|
| Infrastructure directory brands | **89** | 90 non-demo database records, collapsing Bitso/Juno into Bitso; public infrastructure view uses `loadProviderSummaries` and filters isDemo. `packages/core/src/repository.ts:467`; `apps/web/app/(public)/providers/page.tsx`. |
| Comparison discovery catalog | **111 brands / 112 entries** | Execute `providerMarketCoverage`, merge universe + receiving products + source audit + discovery, canonicalize Bitso/Juno. `apps/web/lib/provider-market.ts`. Of these, 93 have no active price/link source in this audit. |
| Complete public directory, all views | **Unknown unique brands** | Default `/providers` lists 400 World Bank survey entries; these include regional brands, products and agent/provider combinations. Infrastructure has 90 records. A reviewed cross-catalog brand/agent map is required before combining counts. |
| Fixed active comparison brands | **22** | 16 bank-flow brands + 7 stablecoin brands − shared Xflow. Includes conditional published estimates and provider links; excludes expired Xoom capture, fixtures and directory-only brands. |
| Enabled including observed dynamic feed | **31 observed** | 22 fixed + 9 current Wise-comparison brands. All possible enabled feed brands across all corridors remain unknown without an inventory of that dynamic feed. |
| Account quote adapters in code | **7** | ADAPTERS with getQuote: Wise, Airwallex, Xflow, dLocal, Circle, Bridge, MoonPay. Bridge is FX-reference-only. `packages/core/src/adapters.ts:343`. Four are wired to bank Compare prices; receiving only uses Xflow. |
| First-party quote integrations incl. anonymous quotes | **8 distinct brands** | Seven account adapters + Revolut; Wise has both account and anonymous endpoints. Skydo/Mulya FX feeds and exchange books are separately counted as data feeds rather than amount-specific quote adapters. |
| Customer-account quote integrations verified working in production | **0 evidenced; actual count unknown** | No customer provider_connections rows in configured DB; no successful quote_api evidence. Quote conformance checks are placeholders returning access_required. Need authorized production success receipts tied to deployed revision, matching inputs, quote validity and fee coverage. |
| Account integrations whose production status is unverified | **7** | All seven above. Deployment of the anonymous integrations is also unverified. Public endpoint success from this checkout does not prove deployed Railor integration. |
| Production public endpoints exercised | **2 quote brands, 1 FX feed, 2 book venues** | Wise and Revolut HTTP200; Skydo HTTP200; CoinDCX/WazirX books HTTP200. Mulya FX HTTP403. |
| Directory route records | **872** | COUNT provider_routes joined to non-demo providers. Records are not brands or executable quotes. |
| Stablecoin selectors / provider legs | **30 / 76** | 15 source token/networks × 2 destinations. INR60 provider legs; EURC16. Nine exchange legs across eight INR selectors have support=yes in code, subject to inadequate deposit evidence. EURC has no numeric quote. |

Fixed bank brands: Refrens, Salt, DashX, Mulya, Infinity, PayGlocal, Razorpay, Winvesta, Xflow, Atlantic Money, PayZoll, Skydo, Wise, Revolut, Airwallex, dLocal. Stablecoin brands: CoinDCX, WazirX, Xflow, Tether, Circle, Uniswap, Titan. Current feed brands: Remitly, Xoom, SBI, WorldRemit, Instarem, Western Union, Wells Fargo, Chase, OFX. Product names, plans, currencies and networks do not add brands. Parent ownership alone does not merge separately branded Xoom and PayPal.

**Excluded/non-price entries:** 15 is_demo providers (listed below); 32 source rows not belonging to non-demo providers; all synthetic E2E/test pricing fixtures. There are 283 source_documents rows, 251 for non-demo providers, and none disabled. A source enabled flag is not a provider pricing toggle. Nium/Paxos have connection checks without getQuote; Coinbase's signed-JWT auth is a stub. Circle/Bridge/MoonPay account adapters are outside Compare prices. Atlantic Money prices UK-business GBP sends only, not USD tests. Static Xoom first-transfer capture expired 30 October; current Xoom results come from Wise's dynamic feed. The World Bank survey is 2025 Q3, retrieved 7 October 2026, 400 provider entries and 12,905 historical samples. US→India samples are $200/$500, never rescaled to $1,000/$5,000. Old universe fields claiming 17 liveQuotable/observed providers are not account quote proof.

## UI and API data flow

Bank: `/prices` or `/app/prices` → `loadPricePage` (`apps/web/lib/pricing.ts:109`) → `SwapQuote` (or locked QuickQuote) → GET `/api/prices` → parsePriceQuery/runPriceCheck → `comparePrices` (`packages/core/src/pricing.ts:394`). `/v1/prices` uses the same service and serializes basis/profile/comparable flags. Without customer context, v1 explicitly labels results unscoped.

`comparePrices` requests Wise public quote, optional Wise comparison feed, Revolut UK FX reference, Skydo/Mulya FX, optional connected quotes and platform observations concurrently. Published fees are calculated from code constants. Database fee rows, source-review JSON and directory metadata only enrich provider details through `providerMarketCoverage` and `attachMarketPricingEvidence`; they do not produce numeric quotes.

Production account wiring: ACCOUNT_PRICED includes Wise/Airwallex/Xflow/dLocal; receive mode skips all except Xflow. Sandbox customer connections are excluded. Optional Railor-owned Airwallex/Xflow/dLocal observations require configuration/opt-ins, are sanitized, partial and separate from ranking. Actual platform environment and enablement were not exercised. Public `/prices` SSR passes organizationId=null even for signed-in users; its later API polls use session organization, so initial and later account coverage can differ.

Stablecoins: mode=stablecoin → StablecoinQuote/stablecoinInitial → useExchangeQuotes → GET `/api/stablecoin` → indiaExchangeQuotes → public bid books → fillBids/exchangeCharges. Static cards and DEX links are independently generated by `apps/web/lib/stablecoin-routes.ts`. EURC does not call any swap-quote API. Both price APIs suppress numeric data for signed-out visitors and return availability/provider previews. Free sign-in unlocks numbers.

History (pre-existing uncommitted code): RateHistoryChart → `/api/prices/history` → loadRateHistory. Bank history uses Frankfurter; selected exchange history uses daily candles, falling back to CoinGecko; EURC history is a calculated same-hour ratio. No history source supplies current net calculations. These are market references before fees/tax, with missing observations left empty.

## Five highest-impact data gaps

1. **Stablecoin eligibility is overstated.** CoinDCX support=yes reuses a generic CoinDCX↔Web3 chain list for both tokens, which does not prove external deposits of the selected token/network. WazirX USDC is unknown. The API prices books even for unsupported/unknown networks. Main output/recommendation gates are stricter than provider-list/detail rendering, which can still show a numeric amount and “In your bank”. The UI counts all entries as “verified routes”, including unconfirmed Xflow networks and below-minimum issuer redemption. Require current token/network/product-specific admission evidence and consistent numeric gating. Evidence: `india-exchanges.ts:51,213`, `stablecoin-quote.tsx:49,74,137,144`, `stablecoin-inr.tsx:115`; [CoinDCX generic network source](https://support.coindcx.com/articles/transfer/which-blockchain-networks-are-supported-for-transfers-between-coindcx-and-coindcx-web3/66d82d2b2b52180f6c097752).

2. **INR bank cost is incomplete.** Retail tiers assume account volume/subscription. WazirX $5,000 USDT needs at least three withdrawals under its modeled ₹200,000 cap, yet only one ₹10 fee is deducted: net is ₹20 too high if that tariff applies. Its [withdrawal page](https://support.wazirx.com/hc/en-us/articles/360001690794-How-can-I-withdraw-INR-to-my-bank-account) advertises waived fees and lists ₹10 simultaneously; Railor notes the conflict but always computes ₹10. Gas/deposit/bridge costs, account restrictions, delivery and export documents remain unknown. Tax constants are modeled, not account-specific provider tax quotes.

3. **Invoice profile/method eligibility is too broad.** indiaReceivingAssessment uses currencies + Indian commercial services to mark both freelancers and companies documented/priceApplicable. It does not separately establish legal form, US payer approval, actual KYC, exact ACH variant or monthly volume. Salt is documented despite an explicit availability caveat. The input has no sender-country or ACH push/debit distinction. [Razorpay publishes different local-account and FlashLinks ACH-debit prices](https://razorpay.com/accept-international-payments/money-saver/). Generic local_bank estimates must not imply verified US ACH receiving offers.

4. **FX fallback and fee evidence can conflict.** Ten invoice rows at $1,000 use Wise reference FX here, including Mulya after403. Widget rates deviating >5% also silently fall back to Wise. Some modeled rows remain complete. Published tariffs have no expiry. Database Xflow text says flat1%, whereas active code chooses $12/$20 Starter/Growth; product metadata still describes Starter. Source failure/rejected FX, review age and product-specific conflict should accompany the number. Evidence: `pricing.ts:464`, `market-pricing-evidence.ts`, current fees SELECT.

5. **Freshness and production verification are incomplete.** No account integration has recorded production quote success; quote_api conformance never calls quotes. Bank UI retains previous same-input results after failed polls and resets the fetch clock. Non-expiring published/FX rows lack a universal display-age cutoff. Exchange freshness is fetch/cache age, not exchange-event time. Polling dots, “Panel checked” and “Order book read live” can look fresher than the data. Evidence: `swap-quote.tsx:180–238`, `india-exchanges.ts:201`, `conformance.ts:134`. Resolve with explicit source age/failure state, maximum display age and authorized production quote receipts.

## Numeric coverage

| Profile | $1,000 numeric brands | $5,000 numeric brands | Source breakdown | Complete/documented per code |
|---|---:|---:|---|---|
| Personal remittance | 10 | 10 | Wise public1 + third-party feed9; six feed rows in prices, three in market context | Wise only |
| Freelancer receiving US client ACH invoice | 11 | 10 | Published fee calculations; one Skydo FX feed, remaining Wise reference; Winvesta unavailable at5k | Five each |
| Business receiving US client ACH invoice | 11 | 10 | Same product set and generic commercial rules | Five each |

These are numeric-capable counts including partial references, not executable-provider counts. No account-specific quotes were available. Six tests produced64 raw numeric rows, including two excluded Revolut observations;62 retained/context-visible rows span21 brands. Tests use India/receive, services/local_bank for invoices, personal/transfer_service for personal money, includeMarket=true and explicit IN destination. US ACH specificity cannot be represented fully in current input.

The following tables are observations, not locked quotes or recommendations. D=direct provider data; T=third-party feed; C=Railor calculation; P=published claim; U=unknown.

### Personal remittance

| Brand | Net INR $1,000 | Net INR $5,000 | FX rate1k /5k | Fee USD1k /5k | Provenance/status |
|---|---:|---:|---|---|---|
| Wise | 92,368.39 | 464,486.67 | 93.42030000 | 11.26 / 27.99 | D, public quote; ETA3h |
| Remitly | 93,314.83 | 466,574.15 | 93.31483097 | 0.00 / 0.00 | T; main prices, <24h at audit |
| Xoom | 93,282.27 | 466,410.86 | 93.28227297 / 93.28217296 | 0.00 / 0.00 | T; main prices, <24h at audit |
| State Bank of India | 92,914.98 | 464,574.91 | 92.91498167 | 0.00 / 0.00 | T; context: destination missing, originIN |
| WorldRemit | 92,819.07 | 465,208.80 | 93.09743134 | 2.99 / 2.99 | T; main prices, <24h at audit |
| Instarem | 92,800.96 | 464,752.36 | 92.80096362 / 92.95047274 | 0.00 / 0.00 | T; main prices, <24h at audit |
| Western Union | 92,693.97 | 463,935.77 | 92.69396941 / 92.78715417 | 0.00 / 0.00 | T; main prices, <24h at audit |
| Wells Fargo | 90,513.06 | 452,565.28 | 90.51305581 | 0.00 / 0.00 | T; main prices, <24h at audit |
| Chase (US) | 90,453.20 | 456,881.47 | 90.90773754 / 91.37629403 | 5.00 / 0.00 | T; context: stale10Nov |
| OFX | 89,878.76 | 456,079.83 | 90.33041285 / 91.21596689 | 5.00 / 0.00 | T; context: countries missing |

Wise: POST `https://api.wise.com/v3/quotes`, payload sourceCurrencyUSD,targetCurrencyINR,sourceAmount. `packages/core/src/payments/adapters/wise.ts:142`. Pay-in selected bank transfer in this run; price.total total fee preferred over legacy fee summary. Public net/rate/fee/delivery are D; personal eligibility is a P-based Railor rule, not account approval. Separate tax treatment and remittance certificate are U.

All other brands: GET `https://api.wise.com/v4/comparisons/?sourceCurrency=USD&targetCurrency=INR&sendAmount={1000|5000}`; `comparisons.ts`. Net/rate/fee/collection time are T, not first-party provider quotes. Funding method, tax breakdown, eligibility and remittance documents are U; delivery is U/null. Zero fees may reflect unknown offers or methods. Xoom lacks sender country but passes receive freshness because destinationIN matches. SBI/OFX do not establish the requested US→India corridor. Chase remains a stale context row.

Revolut UK Standard returned INR93,276/$1k and466,366/$5k, fee0, rates93.2767421047/93.2732099744, excluding transfer fee. All tested India-receiving profiles reject this product; these two raw personal rows are excluded from comparable/visible counts.

### Freelancer receiving a US-client ACH invoice

| Product/source | Net INR $1k (C) | Net INR $5k (C) | Fee/tax1k /5k | FX supplier | Completeness; remittance document |
|---|---:|---:|---|---|---|
| [Infinity](https://www.infinityapp.in/faqs/articles/what-infinity-charges-for-bank-transfer-payments) | 92,953.20 | 464,765.99 | $5/$25;0.5%,GST P included | Wise93.4203 reference | Complete per code; FIRA (free, automatic) |
| [Mulya](https://www.mulya.co/) | 92,486.10 | 462,430.49 | $10/$50;1%,GST P included | Wise93.4203 reference | Complete per code; Remittance documents (free, as stated) |
| [PayGlocal · bank collections](https://payglocal.in/compare/payglocal-vs-skydo) | 92,317.94 | 465,117.25 | $11.80/$21.24;GST18% added(C) | Wise93.4203 reference | Complete per code; document U |
| [Razorpay · MoneySaver bank transfer](https://razorpay.com/accept-international-payments/money-saver/) | 92,240.30 | 461,589.70 | ₹1180/₹5511.80;GST18% added(C) | Wise93.4203 reference | Complete per code; document U |
| [Skydo](https://www.skydo.com/send-money-to-india) | 91,335.10 | 463,951.83 | $22.42/$34.22;GST18% added(C) | Skydo93.4298 D | Complete per code; FIRA (instant, every payment) |
| [DashX](https://dashx.xyz/tools/currency-converter) | 93,140.04 | 465,700.20 | $3/$15;tax U | Wise93.4203 reference | Partial; document U |
| [PayZoll](https://payzoll.finance/) | 92,486.10 | 462,430.49 | $10/$50;tax/minimum/partner U | Wise93.4203 reference | Partial; document U |
| [Xflow](https://www.xflowpay.com/pricing) | 92,299.26 | 465,233.09 | $12 Starter/$20 Growth;reverse-charge caveat | Wise93.4203 reference | Partial; Bank confirmation letter on inward remittance |
| [Refrens · bank transfer](https://www.refrens.com/receive-international-payments-india) | 92,019.00 | 461,496.28 | $15/$60;tax P included,FX U | Wise93.4203 reference | Partial; document U |
| [Winvesta · standard collection plan](https://www.winvesta.in/faqs/global-collections-account/what-are-the-charges-for-the-global-collections-account) | 91,998.44 | Unavailable | $15.22/custom;conditional volume,18%GST(C) | Wise93.4203 reference | Partial; document U |
| [Salt · inward remittance](https://www.salt.pe/international-payments) | 91,785.44 | 458,927.22 | $17.50/$87.50;GST P included | Wise93.4203 reference | Partial; document U |

All tariff models live in `packages/core/src/pricing.ts:209`; fee and GST calculations are C from P schedules. Net=(amount−source-equivalentfee)×rate, rounded to paise; Razorpay fee is INR. Skydo combines P tariff with D timestamped FX. Other ten1k models use Wise reference; Mulya's HTTP403 exercised fallback. No published model uses a locked account FX quote. All delivery fields are U/null. All profile labels are Railor P-based documented assessments subject to actual onboarding, not provider approval. Receipt labels are P, not documents issued for these tests. PayGlocal/Razorpay public pages publish certificate/delivery information that is still null in result fields.

**Business receiving a US-client ACH invoice:** independently tested at both amounts. Every numeric amount, rate, fee, tax flag, delivery-null, receipt and completeness flag exactly matches the freelancer table:11 brands at1k,10 at5k, five complete. Separate rows appear in results CSV. This equality reflects shared rules, not proof of legal-form access.

**Wise India business/freelancer receiving:** no numeric result for either amount. [Receiving guide](https://wise.com/help/articles/71lNXW0Ls3gEFhUH8PtodV/receiving-payments-for-indian-businesses) establishes USD receiving details, automatic INR conversion, USD2 equivalent e-FIRC charge and timelines, but current code has no amount-specific receiving conversion fee/rate. UNPRICED_PRODUCTS avoids substituting the public sender quote. No generic personal-transfer price was used as a business invoice price in these six tests; receive-method filtering removes payer-service rows.

### Stablecoin selectors and results

| Token | Exact selectable source networks | Destination choices |
|---|---|---|
| USDT | Ethereum, Avalanche, Solana, Tron, TON, Aptos (6) | INR or EURC for each |
| USDC | Ethereum, Base, Arbitrum, OP Mainnet, Polygon, Avalanche, Arc, Solana, Aptos (9) | INR or EURC for each |

BNB exists in overall network catalog, but neither source has a stored native address there. Issuer token identity comes from [USDC](https://developers.circle.com/stablecoins/usdc-contract-addresses), [EURC](https://developers.circle.com/stablecoins/eurc-contract-addresses), [Tether](https://tether.to/en/supported-protocols/); this is not exchange deposit evidence.

**INR numeric support labels in code:** USDT Ethereum(CoinDCX/WazirX), Solana(CoinDCX), Tron(WazirX); USDC Ethereum/Base/Arbitrum/Polygon/Solana(CoinDCX). Nine legs/eight selectors can populate main net if book depth and minimum checks pass, subject to admission evidence gaps. CoinDCX USDT Tron is unknown; WazirX USDC is unknown everywhere. Other token/networks are no. API and provider list/details may still show network-independent numeric estimates on those unknown/no routes.

**EURC:** zero numeric quotes. Uniswap links: USDT Ethereum/Avalanche; USDC Ethereum/Base/Avalanche(5). Titan: both tokens onSolana(2). No swap link for USDT Tron/TON/Aptos or USDC Arbitrum/OPMainnet/Polygon/Arc/Aptos. Circle Mint link card is additionally shown for all9 USDC networks, with institutional eligibility/price on request; exact network availability unproven. No bridge is performed.

**INR link/terms-only cards:** Xflow on all15 source selectors, price on request, published T+2/e-FIRA; names Ethereum/Polygon/Solana/Tron broadly and cautions others. Tether on6 USDT selectors redeems USD, not INR; $1k/$5k are below its $100k minimum. Circle Mint on9 USDC selectors redeems USD for qualifying institutions, not an INR quote. These are not all verified end-to-end routes. [Xflow source](https://www.xflowpay.com/products/stablecoins), [Tether terms](https://tether.to/en/fees/).

Exchange tests use Ethereum and 1,000/5,000 **tokens**, not a stablecoin=USD assumption. Books are token-specific, network-independent. Both books filled visible depth at these sizes, though WazirX USDC walked extremely low bids.

| Token/venue | Average bid INR1k/5k | Gross INR1k/5k | Net inBank INR1k/5k | Admission |
|---|---|---|---|---|
| USDT/CoinDCX | 102.95/102.77 | 102,951.50/513,834.14 | 101,320.64/505,694.49 | yes (code label only) |
| USDT/WazirX | 102.85/102.84 | 102,850.00/514,219.44 | 101,330.90/506,664.40 | yes (code label only) |
| USDC/CoinDCX | 102.75/102.75 | 102,754.78/513,754.78 | 101,127.04/505,616.39 | yes (code label only) |
| USDC/WazirX | 77.34/16.22 | 77,343.88/81,092.09 | 76,199.02/79,892.24 | unknown (code label only) |

Sources: CoinDCX GET `https://public.coindcx.com/market_data/orderbook?pair=I-{USDT|USDC}_INR`; WazirX GET `https://api.wazirx.com/sapi/v1/depth?symbol={usdt|usdc}inr&limit=100`. `apps/web/lib/india-exchanges.ts:54,213`. Bids/quantities are D. Weighted rate/gross are C; fees/GST/TDS/withdrawal/net are C from P/constants. CoinDCX fee0.50%, WazirX0.40%; GST18% oftradingfee; TDS1% of(gross−fee−GST); withdrawal₹0/₹10. Net=gross−fee−GST−TDS−withdrawal, rounded bycomponent.

Thus exchange costs and **one** INR withdrawal are included. Sender gas, bridge/deposit charges and multiple-withdrawal costs are not fully covered. Main inBank excludes further income tax: separate VDA output assumes31.2% ofgain, credits TDS, and uses costzero when acquisition cost is missing. Actual thresholds, exemptions, surcharge, transaction classification and profile tax liability are not verified by provider data. Delivery, KYC/account access, bank payout restrictions and remittance documents are U for all exchange results. CSV records each tax/fee component for both amounts.

## Missing, stale and conflicting data handling

- Bank source caches: Wise15s, comparison60s, Revolut60s, Skydo/Mulya20s; UI polls20s whilevisible. Revolut timestamp max5min; Skydo max10min and IST parsing; Mulya HTTPDate/Age max10min but no rate-publication timestamp. Rates >5% from Wise fall back to Wise, not an explicit FX-conflict row.
- Published tariff dates are hard-coded29/30Oct or18Nov; recalculating today does not reverify the tariff. No maximum tariff age. No reference can mean fee-only/nullnet; custom-plan/amount bounds go to unavailable. Unknown delivery/documents remainnull.
- Comparison feed validates exact amount/pair and arithmetic. Personal observations with matched corridor and ≤24h may enter prices with Market reference labels; they do not become best. Older/missing-corridor rows remain numeric market context. No survey rescaling or expired offer reuse.
- Customer quotes with expired validity are unavailable; UI hides expired quotes/offers, aborts late requests and checks input/profile/method match. Same-input bank refresh failures retain prior response and reset the local fetch timer; no universal stale cutoff for rows without expiry.
- Stablecoin state is token/network/amount keyed; errors clear previous numbers. UI30s polling, book10s cache,6s timeout. Book source timestamps are not checked; checkedAt is generated before fetch and can differ from cached-book age. Empty/error books unavailable; partial visible depth still returned/exported, but main recommendation/output rejects it.
- Optional Gemini+Google web-checks run inbackground; official quoted contradiction demotes a profile, third-party conflict flags review, confirmations never promote eligibility. Missing/unclear/disabled checks do not block modeled prices. Cache7days for settled,48h unclear,6hfailed. These check route/profile claims, not all fee math, and were not invoked here.
- Source ingestion schedules do not update tariff constants or approve facts. Current DB source rows have configured1h/24h/168h/720h cadences; operational worker6h schedule is a separate dated deployment claim. Descriptor conflicts are appended rather than reconciled. Xflow flat1% DB text can appear beside current Starter/Growth calculation.
- `/api/prices`:400 invalidinput,429 limits,502 whole-servicefailure; isolated source failures generally degrade to missing/fallback rows. `/api/stablecoin`:400/429 plus per-venue unavailable results. `/v1/prices` can return excluded/partial numeric rows with flags; clients must inspect profile/comparable, not assume every row is usable.
- History cache15min is stale-while-revalidate, keyed by UTCday; HTTP max-age60. Missing daily observations remain gaps. Failed refresh can retain oldhistory; no current-price use.

## Reproduction and limits

Sixbank tests: sourceUSD,destinationINR,destinationCountryIN,amount1000/5000,includeMarkettrue. India/receive/personal/personal/transfer_service versus freelancer orbusiness/services/local_bank. Called real comparePrices functions without connected/platform/web-check dependencies. This reproduces the numeric core path and rules but not deployment-specific platform observations or cached web-check demotions. No broad test suite/server/browser was launched because those can migrate/seed/write application state. No mocks were used for reported observations.

Inventory provides provider,product,publicURL,codepath,sourcetype,coverage,refreshcadence,recordedverificationdate,gaps and component provenance. Some last_checked_at values represent retrieval, not verified tariff/account eligibility; inventory explicitly distinguishes them. Full public-directory unique-brand count remains unknown pending survey/agent reconciliation. Account production verification remains unknown until successful authorized quote observations are recorded and tied to deployed code.

**Demo slugs excluded:** atlas-ramp, cobalt-ramp, corvus-financial, halcyon-clearing, ironwood-settlement, kestrel-payments, lyra-cards, marlin-accounts, meridian-pay, northwind-rails, orbita-money, sablefin, solstice-treasury, tessellate-payments, verdant-rails.
