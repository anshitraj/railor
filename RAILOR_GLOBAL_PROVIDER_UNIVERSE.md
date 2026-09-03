# Railor Global Provider Universe

Generated: 2026-09-02T08:21:30.154Z. Supersedes RAILOR_PROVIDER_UNIVERSE_AUDIT.md
(kept as a dated snapshot) with the wider column set and renamed depth ladder
from the global provider & competitor intelligence expansion brief. Every
number is a live query against real (`is_demo:false`) rows — nothing here is
estimated or padded. Re-run `node --env-file=.env --import=tsx packages/database/generate_global_provider_universe.ts`
to refresh.

Competitor products (Borderless, Heron, RIVR, StableNexus, OneStable,
Paycrest, DFNS Payouts, Fireblocks Network for Payments, Circle Payments
Network, Meld, Onramper, Modern Treasury, Basilic) are covered in
[RAILOR_COMPETITIVE_ROUTING_AUDIT.md](./RAILOR_COMPETITIVE_ROUTING_AUDIT.md),
not registered as Railor providers here — they are execution/orchestration
platforms sitting *over* real infra companies, several of which (Circle,
dLocal, Banxa, Bridge, Coins.ph, Yellow Card, Koywe) already appear in this
table directly. Paycrest is the one borderline case (a genuine open protocol
a customer could integrate against directly) held out of the registry this
pass pending a decision on whether Railor models permissionless-liquidity
protocols the same way it models named companies.

## Depth ladder (this brief's naming)

L0 DISCOVERED (name/domain only, not yet in this table) · **L1
OFFICIAL_SOURCE_FOUND** (provider row exists — official site/docs on record)
· **L2 CAPABILITY_MAPPED** (≥1 `provider_capabilities` or
`receiving_endpoints` row) · **L3 ROUTE_MAPPED** (≥1 `provider_routes` row
with a real `evidence_id` — never a Cartesian join of independently-true
facts) · **L4 CUSTOMER_CONNECTABLE** (≥1 real `provider_connections` row
with status `connected` and stored credentials — genuinely 0 today; V1 has
no credential flow) · **L5 LIVE_QUOTABLE** (a `getQuote` implementation
exists in `packages/core/src/adapters.ts` — Circle, Bridge, MoonPay only) ·
**L6 RAILOR_OBSERVED** (≥1 real `conformance_runs` row with status
pass/fail/warning — placeholders don't count) · **L7 EXECUTABLE** — always 0;
`executeTransfer` permanently refuses to execute a real transfer, a hard
policy line, not a gap. L5/L6 are not strictly nested in this data (some L6
rows have no `getQuote` adapter — their conformance checks don't need one);
"provider level" means the highest independently-satisfied rung.

## Summary

| Metric | Count | Target (brief) |
|---|---:|---|
| Total candidate entities discovered this + prior pass | 90 + (see gaps file for un-registered leads) | 150+ candidates |
| Registered / L1+ (official source found) | 90 | 100+ verified |
| L2+ (meaningfully mapped) | 48 | 50-75 |
| L3+ (route-mapped, real evidence) | 20 | 25-40 |
| L4+ (customer-connectable, cumulative ladder) | 17 | — |
| L5+ (cumulative ladder — includes L6/L7 providers who lack `getQuote`) | 17 | — |
| **Real `getQuote` adapters (the actual "live-quotable" count)** | **3** | **3-5 initially, 10-15 over time** |
| L6+ (Railor-observed via real conformance runs) | 17 | — |
| L7 (executable) | 0 | never fabricated |
| Providers with named rails on record | 5 | — |
| Providers with zero evidence citations | 41 | — |
| Providers with evidence older than 30 days | 0 | — |

**Honest read against targets:** 90 registered is real
progress toward 100+ verified but short of 150+ candidates — this pass added
25 new real, individually-domain-verified providers (on top of the prior
pass's 66) sourced from Mastercard's Crypto Partner Program list and Meld's
integration directory, filtered down from ~100 raw names to ones that
actually move money (blockchains, pure custody/signing infra, and pure
compliance tooling from those source lists were excluded per this brief's own
classification rule, not registered as low-quality padding). 48
capability-mapped sits below the 50-75 target's midpoint mainly because most
of this pass's 25 new providers are still L1-only (official source found,
nothing extracted yet) — that extraction work is the next pass, not this
one. 20 route-mapped is below the 25-40 target;
Ramp Network alone (868 real atomic routes from its structured coverage API)
still carries most of that number. 3 real
`getQuote` adapters (Circle, Bridge, MoonPay) sits inside the brief's own
"3-5 initially" band — the L5+/L6+ ladder rows above read higher only because
several L6 providers reached conformance-observed status through checks that
never required a quote adapter (docs-parity, sandbox-reachability), not
because they can actually be quoted today.

## Provider table

Provider | Categories | Website | Docs | API docs | llms/OpenAPI | Regions | Stablecoins | Networks | Countries | Currencies | Local rails | Route count | Evidence count | Provider level | Quote support | BYO credentials | Commercial access | Last verified | Research gaps
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
1Money (`1money`) | PAYMENT_NETWORK, STABLECOIN_INFRA | https://www.1money.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Airwallex (`airwallex`) | DIRECT_PAYOUT_PROVIDER, BANKING_INFRA | https://www.airwallex.com | Yes | Yes | Not checked | 22 | — | — | 22 | AED, AUD, CAD, CHF, COP, DKK, EUR, GBP, HKD, IDR, ILS, INR, MXN, NZD, PLN, SEK, SGD, THB, TRY, USD | ACH_HK, ACH_US, BACS, BECS, BI_FAST, CENIT, CHAPS, DATACLEARINGEN, DIRECT_CREDIT_NZ, EFT_CA, ELIXIR, EXPRESS_ELIXIR, FASTER_PAYMENTS_GB, FASTER_PAYMENTS_IL, FAST_SG, FAST_TR, FEDNOW, FEDWIRE, FPS_HK, GIRO_SG, IMPS, INTERAC_E_TRANSFER, INTRADAGCLEARING, IPI_AE, KRONOS2, MASAV, MEPS, NEFT, PROMPTPAY, RTGS, RTGS_AE, RTGS_HK, RTGS_ID, RTP, SEPA_CT_DE, SEPA_CT_NL, SEPA_ICT_DE, SEPA_ICT_NL, SIC, SKN, SORBNET, SPEI, STRAKSCLEARING, ZAHAV, bank_transfer_local | 0 | 14 | L6 | No | Not researched | Not researched | 2026-08-28 | 4
Alchemy Pay (`alchemy-pay`) | ONRAMP, OFFRAMP | https://alchemypay.org | No | No | Not checked | 11 | USDC, USDT | — | 11 | GBP, KES, NGN, RWF, TZS, UGX, XAF, ZAR, ZMW | — | 0 | 9 | L2 | No | Not researched | Not researched | 2026-08-28 | 5
Alfred (`alfred`) | DIRECT_PAYOUT_PROVIDER, STABLECOIN_INFRA | https://alfredpay.io | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Anchorage Digital (`anchorage`) | CUSTODY_SIGNING | https://www.anchorage.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Anclap (`anclap`) | OFFRAMP, STABLECOIN_INFRA | https://www.anclap.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
B2C2 (`b2c2`) | FX_LIQUIDITY, LIQUIDITY_PROVIDER | https://www.b2c2.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Baanx (`baanx`) | CARD_INFRA, WALLET_INFRA | https://www.baanx.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Banking Circle (`banking-circle`) | BANKING_INFRA | https://www.bankingcircle.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Banxa (`banxa`) | ONRAMP, OFFRAMP | https://banxa.com | Yes | Yes | Not checked | 6 | USDC, USDT | tron | 6 | AUD, BRL, CAD, EUR, GBP, USD | — | 0 | 17 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
BitGo (`bitgo`) | CUSTODY_SIGNING | https://www.bitgo.com | Yes | Yes | Not checked | 0 | USDC | — | 0 | — | — | 0 | 5 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
Bitso (`bitso`) | DIRECT_PAYOUT_PROVIDER, ONRAMP | https://bitso.com | Yes | Yes | Not checked | 5 | BRL1, USDC, USDT | arbitrum, avalanche, polygon, stellar, tron | 5 | ARS, BRL, COP, MXN, USD | bank_transfer_local | 0 | 14 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
Bitso / Juno (`bitso-juno`) | LOCAL_PAYOUT_PROVIDER | — | Yes | Yes | Not checked | 1 | MXNB | arbitrum | 1 | MXN | bank_transfer_local | 0 | 2 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
BlindPay (`blindpay`) | OFFRAMP, STABLECOIN_INFRA | — | Yes | Yes | Not checked | 1 | USDC | arbitrum, base, ethereum, polygon, solana, stellar | 1 | EUR, USD | ach, bank_transfer_local, bank_transfer_swift, sepa, wire | 0 | 14 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
Brale (`brale`) | ISSUER, STABLECOIN_INFRA | https://brale.xyz | Yes | Yes | Not checked | 1 | PYUSD, USDC, USDP | arbitrum, avalanche, base, celo, ethereum, optimism, polygon, solana, stellar | 1 | USD | — | 0 | 11 | L6 | No | Not researched | Not researched | 2026-08-28 | 4
Bridge (`bridge`) | DIRECT_PAYOUT_PROVIDER, STABLECOIN_INFRA | https://bridge.xyz | Yes | Yes | Not checked | 1 | USDC, USDT | base | 1 | EUR, GBP, MXN, USD | sepa | 0 | 12 | L6 | Yes | Not researched | Not researched | 2026-08-28 | 3
BVNK (`bvnk`) | DIRECT_PAYOUT_PROVIDER, STABLECOIN_INFRA | https://www.bvnk.com | Yes | Yes | Not checked | 0 | PYUSD, USDC, USDT | ethereum, polygon, tron | 0 | — | — | 0 | 10 | L6 | No | Not researched | Not researched | 2026-08-28 | 4
Cashfree Payments (`cashfree`) | LOCAL_PAYOUT_PROVIDER | https://www.cashfree.com | Yes | Yes | Not checked | 1 | — | — | 1 | INR | — | 0 | 1 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
CBW Bank (`cbw-bank`) | BANKING_INFRA | https://www.cbw.bank | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Checkout.com (`checkout-com`) | DIRECT_PAYOUT_PROVIDER | https://www.checkout.com | Yes | Yes | Not checked | 1 | — | — | 1 | — | — | 0 | 1 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
Circle (`circle`) | ISSUER, PAYMENT_NETWORK | https://www.circle.com | Yes | Yes | Yes | 6 | CIRBTC, EURC, USDC, USYC | arbitrum, avalanche, base, celo, ethereum, optimism, polygon, solana, stellar | 6 | AED, MXN | bank_transfer_local | 1 | 17 | L6 | Yes | Not researched | Not researched | 2026-09-01 | 2
ClickPesa (`clickpesa`) | MOBILE_MONEY | https://clickpesa.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Coinbase (`coinbase`) | ONRAMP, OFFRAMP | https://www.coinbase.com | Yes | Yes | Not checked | 1 | USDC | base | 1 | USD | — | 0 | 12 | L6 | No | Not researched | Not researched | 2026-08-28 | 4
Coins.ph (`coins-ph`) | ONRAMP, OFFRAMP | https://coins.ph | No | No | Not checked | 1 | USDC, USDT | tempo | 1 | PHP | INSTAPAY, PESONET, QR_PH | 0 | 13 | L2 | No | Not researched | Not researched | 2026-08-28 | 5
Conduit (`conduit`) | DIRECT_PAYOUT_PROVIDER, STABLECOIN_INFRA | https://conduitpay.com | Yes | Yes | Not checked | 4 | USDC, USDT | — | 4 | — | — | 0 | 15 | L6 | No | Not researched | Not researched | 2026-08-28 | 4
Cowrie Integrated Systems (`cowrie`) | DIRECT_PAYOUT_PROVIDER | https://www.cowriesys.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Cross River Bank (`cross-river`) | BANKING_INFRA | https://www.crossriver.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Crossmint (`crossmint`) | OFFRAMP, ONRAMP | — | Yes | Yes | Yes | 0 | — | — | 0 | — | ach, bank_transfer_local, sepa | 0 | 7 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
Currencycloud (`currencycloud`) | BANKING_INFRA, FX_LIQUIDITY | https://www.currencycloud.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
DashX (`dashx`) | DIRECT_PAYOUT_PROVIDER | https://dashx.xyz | Yes | Yes | Not checked | 4 | — | — | 4 | AED, EUR, GBP, INR, USD | — | 0 | 5 | L6 | No | Not researched | Not researched | 2026-08-28 | 4
dLocal (`dlocal`) | AGGREGATOR, LOCAL_RAIL_OPERATOR | https://dlocal.com | Yes | Yes | Yes | 11 | USDC, USDT | arbitrum, base, bnb-chain, ethereum, polygon, solana, tron | 11 | AED, ARS, BRL, EGP, GHS, INR, KES, MXN, NGN, XAF, ZAR | bank_transfer_local | 0 | 22 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
dtcpay (`dtcpay`) | DIRECT_PAYOUT_PROVIDER, STABLECOIN_INFRA | https://www.dtcpay.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Eco (`eco`) | ISSUER, STABLECOIN_INFRA | https://eco.com | Yes | Yes | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 5
Episode Six (`episode-six`) | CARD_INFRA | https://episodesix.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Ethena (`ethena`) | ISSUER | https://ethena.fi | Yes | Yes | Not checked | 0 | USDC, USDT, USDe | — | 0 | — | — | 0 | 8 | L6 | No | Not researched | Not researched | 2026-08-28 | 4
Fireblocks (`fireblocks`) | CUSTODY_SIGNING | https://www.fireblocks.com | Yes | Yes | Not checked | 8 | EURC, USDC | — | 8 | AED, BRL, COP, GBP, HKD, MXN, PHP, SGD | — | 0 | 6 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
Flutterwave (`flutterwave`) | LOCAL_PAYOUT_PROVIDER, MOBILE_MONEY | https://flutterwave.com | Yes | Yes | Not checked | 13 | RLUSD, USDC, USDT | base, ethereum, polygon, solana | 13 | AED, GBP, GHS, KES, NGN, RWF, TZS, UGX, USD, ZAR, ZMW | — | 0 | 27 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
FOMO Pay (`fomo-pay`) | DIRECT_PAYOUT_PROVIDER | https://www.fomopay.com | Yes | Yes | Not checked | 0 | — | — | 0 | — | — | 0 | 1 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
Fonbnk (`fonbnk`) | STABLECOIN_INFRA, MOBILE_MONEY | https://fonbnk.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Fuze (`fuze`) | STABLECOIN_INFRA, BANKING_INFRA | https://fuze.finance | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Guardarian (`guardarian`) | ONRAMP, OFFRAMP | https://guardarian.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Highnote (`highnote`) | CARD_INFRA | https://highnote.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Immersve (`immersve`) | CARD_INFRA | https://immersve.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Koywe (`koywe`) | STABLECOIN_INFRA, DIRECT_PAYOUT_PROVIDER | https://www.koywe.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Lirium (`lirium`) | STABLECOIN_INFRA, LIQUIDITY_PROVIDER | https://www.lirium.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Mastercard Move (`mastercard-move`) | PAYMENT_NETWORK | https://www.mastercard.com/us/en/business/payments/mastercard-move.html | Yes | Yes | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 5
Mercuryo (`mercuryo`) | ONRAMP, OFFRAMP | https://mercuryo.io | Yes | Yes | Not checked | 10 | USDC, USDT | base, polygon, solana, stellar | 10 | BRL, GBP, NGN, USD | — | 0 | 18 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
Mesh (`mesh`) | AGGREGATOR, WALLET_INFRA | https://www.meshconnect.com | Yes | Yes | Not checked | 0 | EURC, USDC, USDT | ethereum | 0 | — | — | 0 | 4 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
Mobee (`mobee`) | ONRAMP, OFFRAMP | https://mobee.com/en | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Monavate (`monavate`) | BANKING_INFRA, CARD_INFRA | https://www.monavate.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
MoneyGram (`moneygram`) | DIRECT_PAYOUT_PROVIDER, LOCAL_RAIL_OPERATOR | https://www.moneygram.com | Yes | Yes | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 5
MoonPay (`moonpay`) | ONRAMP, OFFRAMP | https://www.moonpay.com | Yes | Yes | Not checked | 5 | EURC, USDC | — | 5 | GBP, USD | — | 0 | 8 | L6 | Yes | Not researched | Not researched | 2026-08-28 | 3
Moorwand (`moorwand`) | CARD_INFRA, BANKING_INFRA | https://moorwand.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Mural Pay (`mural-pay`) | DIRECT_PAYOUT_PROVIDER, STABLECOIN_INFRA | https://muralpay.com | Yes | Yes | Not checked | 1 | USDC, USDT | — | 1 | ARS, COP, MXN, USD | — | 0 | 8 | L6 | No | Not researched | Not researched | 2026-08-28 | 4
n.exchange (`n-exchange`) | ONRAMP, OFFRAMP | https://n.exchange | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Nium (`nium`) | DIRECT_PAYOUT_PROVIDER, AGGREGATOR | https://www.nium.com | Yes | Yes | Not checked | 17 | USDC | — | 17 | AED, CAD, CNY, EUR, JPY, SGD, USD, ZAR | INTERAC_E_TRANSFER, RTGS_AE, ZENGIN, bank_transfer_local, sepa | 0 | 21 | L2 | No | Not researched | Not researched | 2026-09-01 | 4
Onafriq (`onafriq`) | LOCAL_PAYOUT_PROVIDER, MOBILE_MONEY | https://onafriq.com | No | No | Not checked | 10 | — | — | 10 | GHS, NGN | — | 0 | 6 | L2 | No | Not researched | Not researched | 2026-08-28 | 5
Due (`opendue`) | DIRECT_PAYOUT_PROVIDER, WALLET_INFRA | https://www.opendue.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
OpenPayd (`openpayd`) | BANKING_INFRA | https://www.openpayd.com | Yes | Yes | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 5
Parfin (`parfin`) | DIRECT_PAYOUT_PROVIDER, CUSTODY_SIGNING | https://parfin.io | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Paxos (`paxos`) | ISSUER, STABLECOIN_INFRA | https://paxos.com | Yes | Yes | Not checked | 0 | BTC, PYUSD, USDP | ethereum, solana | 0 | — | — | 0 | 8 | L6 | No | Not researched | Not researched | 2026-08-28 | 4
PayCaddy (`paycaddy`) | CARD_INFRA | https://paycaddy.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
PayGlocal (`payglocal`) | LOCAL_PAYOUT_PROVIDER | https://payglocal.in | Yes | Yes | Not checked | 1 | — | — | 1 | INR | — | 0 | 1 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
Payoneer (`payoneer`) | DIRECT_PAYOUT_PROVIDER | https://www.payoneer.com | Yes | Yes | Not checked | 12 | USDC, USDT | — | 12 | AED, AUD, CAD, CNY, EUR, GBP, HKD, INR, JPY, PKR, SGD, USD | — | 0 | 26 | L6 | No | Not researched | Not researched | 2026-08-28 | 4
PayPal (`paypal`) | DIRECT_PAYOUT_PROVIDER | https://www.paypal.com/in | Yes | Yes | Not checked | 0 | — | — | 0 | — | — | 0 | 1 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
Peoples Group (`peoples-group`) | BANKING_INFRA | https://peoplesgroup.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Pomelo (`pomelo-la`) | CARD_INFRA | https://www.pomelo.la/en | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Ramp Network (`ramp-network`) | ONRAMP, OFFRAMP | https://ramp.network | Yes | Yes | Not checked | 32 | USDC, USDT | arbitrum, avalanche, base, bnb-chain, celo, ethereum, linea, monad, near, optimism, polygon, solana, stellar, ton, tron, world-chain, zksync | 32 | BRL, EUR, USD | PIX, ach, bank_transfer_local, card, sepa | 868 | 21 | L3 | No | Not researched | Not researched | 2026-08-31 | 3
Rapyd (`rapyd`) | AGGREGATOR | https://www.rapyd.net | Yes | Yes | Not checked | 4 | — | — | 4 | GBP, INR, SGD, USD | — | 0 | 5 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
Ripple (`ripple`) | PAYMENT_NETWORK, STABLECOIN_INFRA | https://ripple.com | Yes | Yes | Not checked | 7 | RLUSD, USDC, USDT | — | 7 | BRL | — | 0 | 9 | L6 | No | Not researched | Not researched | 2026-08-28 | 4
SCRYPT (`scrypt`) | CUSTODY_SIGNING | https://scrypt.swiss | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Skydo (`skydo`) | DIRECT_PAYOUT_PROVIDER | https://www.skydo.com | Yes | Yes | Not checked | 7 | — | — | 7 | AUD, CAD, GBP, INR, USD | — | 0 | 12 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
Sphere (`sphere`) | DIRECT_PAYOUT_PROVIDER, STABLECOIN_INFRA | https://www.spherepay.co | Yes | Yes | Not checked | 2 | EURC, USDC, USDT | arbitrum, avalanche, base, ethereum, polygon, solana, tron | 2 | BRL, USD | — | 0 | 16 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
Stablecore (`stablecore`) | STABLECOIN_INFRA, ISSUER | https://stablecore.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
StraitsX (`straitsx`) | ISSUER, STABLECOIN_INFRA | https://www.straitsx.com | Yes | Yes | Not checked | 1 | — | — | 1 | SGD, USD | PAYNOW, bank_transfer_swift, faster_payments | 0 | 1 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
Stripe (`stripe`) | DIRECT_PAYOUT_PROVIDER | https://stripe.com | Yes | Yes | Not checked | 5 | — | — | 5 | AUD, CAD, GBP, USD | — | 0 | 12 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
Tazapay (`tazapay`) | DIRECT_PAYOUT_PROVIDER | https://tazapay.com | Yes | Yes | Not checked | 11 | — | — | 11 | AED, AUD, CAD, EUR, GBP, IDR, KRW, NGN, SGD, USD, VND | — | 0 | 11 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
Tether (`tether`) | ISSUER | https://tether.to | Yes | Yes | Not checked | 0 | USDT | avalanche, bnb-chain, celo, ethereum, solana, ton, tron | 0 | — | — | 0 | 8 | L6 | No | Not researched | Not researched | 2026-08-28 | 4
Thredd (`thredd`) | CARD_INFRA | https://www.thredd.ai | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Thunes (`thunes`) | AGGREGATOR, LOCAL_RAIL_OPERATOR | https://www.thunes.com | Yes | Yes | Not checked | 23 | EURC, USDC | — | 23 | BRL, COP, CRC, GTQ, JPY, KRW, MXN, MYR, USD, VND | — | 0 | 14 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
Transak (`transak`) | ONRAMP, OFFRAMP | https://transak.com | Yes | Yes | Not checked | 7 | BTC, EURC, FDUSD, PYUSD, RLUSD, USDC, USDT | bnb-chain, ethereum, tron | 7 | AUD, CAD, GBP, HKD, MXN, USD | — | 0 | 23 | L6 | No | Not researched | Not researched | 2026-08-28 | 4
Triple-A (`triple-a`) | DIRECT_PAYOUT_PROVIDER, STABLECOIN_INFRA | https://www.triple-a.io | Yes | Yes | Not checked | 0 | — | — | 0 | — | — | 0 | 1 | L1 | No | Not researched | Not researched | 2026-08-28 | 4
Unlimit (`unlimit`) | DIRECT_PAYOUT_PROVIDER, AGGREGATOR | https://www.unlimit.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Vibrant (`vibrant`) | OFFRAMP, WALLET_INFRA | https://vibrantapp.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Visa Direct (`visa-direct`) | PAYMENT_NETWORK | https://www.visa.com/en-us/products/visa-direct | Yes | Yes | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 5
WebBank (`webbank`) | BANKING_INFRA | https://webbank.com | No | No | Not checked | 0 | — | — | 0 | — | — | 0 | 0 | L1 | No | Not researched | Not researched | — | 6
Wise (`wise`) | DIRECT_PAYOUT_PROVIDER | https://wise.com | Yes | Yes | Not checked | 12 | — | — | 12 | AUD, BRL, CAD, CNY, GBP, INR, MXN, SGD, USD, ZAR | — | 0 | 28 | L6 | No | Not researched | Not researched | 2026-08-28 | 4
Xflow (`xflow`) | DIRECT_PAYOUT_PROVIDER | https://www.xflowpay.com | Yes | Yes | Not checked | 4 | USDC, USDT | — | 4 | AUD, GBP, INR, USD | — | 2 | 11 | L3 | No | Not researched | Not researched | 2026-08-28 | 3
Yellow Card (`yellow-card`) | DIRECT_PAYOUT_PROVIDER, STABLECOIN_INFRA | https://yellowcard.io | Yes | Yes | Not checked | 6 | USDC, USDT | — | 6 | GHS, KES, NGN, RWF, USD, ZAR | — | 0 | 14 | L2 | No | Not researched | Not researched | 2026-08-28 | 4
Zero Hash (`zero-hash`) | DIRECT_PAYOUT_PROVIDER, STABLECOIN_INFRA | https://zerohash.com | Yes | Yes | Yes | 15 | BTC, USDC | base, polygon | 15 | ARS | — | 1 | 24 | L3 | No | Not researched | Not researched | 2026-09-02 | 3
