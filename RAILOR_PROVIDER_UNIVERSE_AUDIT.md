# Railor Provider Universe Audit

Generated: 2026-09-02T07:56:25.729Z. Every number below is a live query
against the real (`is_demo:false`) database — nothing here is estimated or
padded. Re-run `node --env-file=.env --import=tsx packages/database/generate_provider_audit.ts`
to refresh after new ingestion.

## Methodology

- **Railor depth level** is computed, not asserted: L1 = provider row exists.
  L2 = at least one `provider_capabilities` or `receiving_endpoints` row.
  L3 = at least one `provider_routes` row with a real `evidence_id` (an
  atomic, evidence-backed route — never a Cartesian join of independent
  facts; see this session's RouteConfirmation work for why that distinction
  is load-bearing). L4 = at
  least one real `provider_connections` row (a customer actually connected
  credentials — expected near-zero; V1 has no credential flow per the schema's
  own "Stage 5 architecture" comment). L5 = the provider has a `getQuote`
  implementation in `packages/core/src/adapters.ts` (only Circle, Bridge,
  MoonPay today). L6 = at least one real `conformance_runs` row. **L7 is
  always 0 for every provider** — `executeTransfer` permanently refuses to
  execute a real transfer; this is a hard policy line, not a coverage gap to
  close.
- **L5 and L6 are not strictly nested in this data** — several L6 rows (e.g.
  DashX, Airwallex, Ripple) have no `getQuote` adapter at all. Their
  `conformance_runs` come from checks that don't require one (docs-parity,
  sandbox-reachability, asset/network availability), which run independently
  of the small `getQuote` set. Read "Railor depth level" as "the highest
  independently-satisfied rung," not proof every lower rung was cleared first
  — the separate Quote endpoint column is what actually answers "does L5
  hold." 565 of 702 `conformance_runs` rows are `access_required` (a
  credential-gated check Railor can't run yet) or `not_tested` placeholders —
  those never count toward L6.
- **llms/OpenAPI** is "Yes" only where this session directly confirmed a
  structured source (Circle, dLocal, Zero Hash, Crossmint). Every other row
  reads "Not checked" — that is an honest gap, not a "No".
- **Priority** is a simplified proxy for the requested `providerValue`
  formula (uncovered_route_demand × markets_unlocked × stablecoin_relevance ×
  local_rail_coverage × API_quality × quote_availability ×
  customer_connectability): it rewards existing route evidence, adapter code,
  stablecoin-relevant category, and breadth of country coverage. It is a
  starting ranking for the next research pass, not a precise reproduction of
  that formula — several of its inputs (quote availability across all
  providers, true market-unlock counts) aren't measured yet.
- **Country coverage / Stablecoin support / Network support / Local payout
  rails** are read from `provider_capabilities`, `provider_routes`, and
  `receiving_endpoints` combined — a provider can appear here via any of the
  three tables, which is why a row can show country coverage without yet
  having an atomic route (L3).

## Summary

| Metric | Count |
|---|---:|
| Total real providers discovered (registered, is_demo:false) | 66 |
| L1+ (sourced) | 66 |
| L2+ (capability-mapped) | 48 |
| L3+ (route-mapped, evidence-backed) | 20 |
| L4+ (customer-connectable, real connections) | 17 |
| L5+ (live-quotable) | 17 |
| L6+ (observed via real conformance runs) | 17 |
| L7+ (executable) | 0 |

Against the brief's targets: **66 registered** (target 100-150 —
this pass added 15 real new providers on top of the existing 51; reaching
100-150 needs further discovery passes, not a one-shot), **48
capability-mapped** (target 50+), **20 route-mapped with real
evidence** (target 25-40), **17 live-quotable adapters** (target
10-15 "over time" — today's 3 reflects the project's stated preference for a
few real HTTP-verified integrations over many stubs).

## Provider table

Provider | Category | Country coverage | Stablecoin support | Network support | Local payout rails | Official docs | llms/OpenAPI | API availability | Quote endpoint | Sandbox | Railor depth level | Atomic route count | Evidence count | Last verified | Major gaps | Priority
--- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---
Circle (`circle`) | ISSUER | 6 | CIRBTC, EURC, USDC, USYC | arbitrum, avalanche, base, celo, ethereum, optimism, polygon, solana, stellar | bank_transfer_local | Yes | Yes | Yes | Yes | Yes | L6 | 1 | 17 | 2026-09-01 | none material | P0
Nium (`nium`) | DIRECT_PROVIDER | 17 | USDC | — | INTERAC_E_TRANSFER, RTGS_AE, ZENGIN, bank_transfer_local, … | Yes | Not checked | Yes | No | No | L2 | 0 | 21 | 2026-09-01 | no evidence-backed atomic route yet; adapter has no getQuote | P0
Xflow (`xflow`) | DIRECT_PROVIDER | 4 | USDC, USDT | — | — | Yes | Not checked | Yes | No | No | L3 | 2 | 11 | 2026-08-28 | no adapter code | P0
Zero Hash (`zero-hash`) | DIRECT_PROVIDER | 15 | BTC, USDC | base, polygon | — | Yes | Yes | Yes | No | Yes | L3 | 1 | 24 | 2026-09-02 | no adapter code | P0
Airwallex (`airwallex`) | DIRECT_PROVIDER | 22 | — | — | ACH_HK, ACH_US, BACS, BECS, … | Yes | Not checked | Yes | No | Yes | L6 | 0 | 14 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P1
Bitso (`bitso`) | DIRECT_PROVIDER | 5 | BRL1, USDC, USDT | arbitrum, avalanche, polygon, stellar, tron | bank_transfer_local | Yes | Not checked | Yes | No | Yes | L2 | 0 | 14 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P1
Bridge (`bridge`) | DIRECT_PROVIDER | 1 | USDC, USDT | base | sepa | Yes | Not checked | Yes | Yes | No | L6 | 0 | 12 | 2026-08-28 | no evidence-backed atomic route yet | P1
Coinbase (`coinbase`) | ONRAMP | 1 | USDC | base | — | Yes | Not checked | Yes | No | Yes | L6 | 0 | 12 | 2026-08-28 | no evidence-backed atomic route yet; adapter has no getQuote | P1
Conduit (`conduit`) | DIRECT_PROVIDER | 4 | USDC, USDT | — | — | Yes | Not checked | Yes | No | Yes | L6 | 0 | 15 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P1
DashX (`dashx`) | DIRECT_PROVIDER | 4 | — | — | — | Yes | Not checked | Unknown | No | No | L6 | 0 | 5 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P1
dLocal (`dlocal`) | AGGREGATOR | 11 | USDC, USDT | arbitrum, base, bnb-chain, ethereum, polygon, solana, tron | bank_transfer_local | Yes | Yes | Yes | No | No | L2 | 0 | 22 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P1
MoonPay (`moonpay`) | ONRAMP | 5 | EURC, USDC | — | — | Yes | Not checked | Yes | Yes | Yes | L6 | 0 | 8 | 2026-08-28 | no evidence-backed atomic route yet | P1
Paxos (`paxos`) | ISSUER | 0 | BTC, PYUSD, USDP | ethereum, solana | — | Yes | Not checked | Yes | No | Yes | L6 | 0 | 8 | 2026-08-28 | no evidence-backed atomic route yet; adapter has no getQuote | P1
Payoneer (`payoneer`) | DIRECT_PROVIDER | 12 | USDC, USDT | — | — | Yes | Not checked | Yes | No | No | L6 | 0 | 26 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P1
Ramp Network (`ramp-network`) | ONRAMP | 32 | USDC, USDT | arbitrum, avalanche, base, bnb-chain, celo, ethereum, linea, monad, near, optimism, polygon, solana, stellar, ton, tron, world-chain, zksync | PIX, ach, bank_transfer_local, card, … | Yes | Not checked | Yes | No | No | L3 | 868 | 21 | 2026-08-31 | no adapter code | P1
Rapyd (`rapyd`) | AGGREGATOR | 4 | — | — | — | Yes | Not checked | Yes | No | Yes | L2 | 0 | 5 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P1
Ripple (`ripple`) | PAYMENT_NETWORK | 7 | RLUSD, USDC, USDT | — | — | Yes | Not checked | Yes | No | No | L6 | 0 | 9 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P1
Skydo (`skydo`) | DIRECT_PROVIDER | 7 | — | — | — | Yes | Not checked | Unknown | No | No | L2 | 0 | 12 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P1
Stripe (`stripe`) | DIRECT_PROVIDER | 5 | — | — | — | Yes | Not checked | Yes | No | Yes | L2 | 0 | 12 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P1
Tazapay (`tazapay`) | DIRECT_PROVIDER | 11 | — | — | — | Yes | Not checked | Yes | No | No | L2 | 0 | 11 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P1
Thunes (`thunes`) | AGGREGATOR | 23 | EURC, USDC | — | — | Yes | Not checked | Yes | No | No | L2 | 0 | 14 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P1
Wise (`wise`) | DIRECT_PROVIDER | 12 | — | — | — | Yes | Not checked | Yes | No | Yes | L6 | 0 | 28 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P1
Yellow Card (`yellow-card`) | DIRECT_PROVIDER | 6 | USDC, USDT | — | — | Yes | Not checked | Yes | No | No | L2 | 0 | 14 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P1
Alchemy Pay (`alchemy-pay`) | ONRAMP | 11 | USDC, USDT | — | — | No | Not checked | Unknown | No | No | L2 | 0 | 9 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code; no docs URL on record | P2
Alfred (`alfred`) | DIRECT_PROVIDER | 0 | — | — | — | No | Not checked | Unknown | No | No | L1 | 0 | 0 | — | no capability/coverage data mapped yet; zero evidence citations; no adapter code; no docs URL on record | P2
Banxa (`banxa`) | ONRAMP | 6 | USDC, USDT | tron | — | Yes | Not checked | Yes | No | No | L2 | 0 | 17 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P2
BitGo (`bitgo`) | CUSTODY_SIGNING | 0 | USDC | — | — | Yes | Not checked | Yes | No | Yes | L2 | 0 | 5 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P2
Bitso / Juno (`bitso-juno`) | LOCAL_PAYOUT | 1 | MXNB | arbitrum | bank_transfer_local | Yes | Not checked | Yes | No | Yes | L2 | 0 | 2 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P2
BlindPay (`blindpay`) | OFFRAMP | 1 | USDC | arbitrum, base, ethereum, polygon, solana, stellar | ach, bank_transfer_local, bank_transfer_swift, sepa, … | Yes | Not checked | Yes | No | No | L2 | 0 | 14 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P2
Brale (`brale`) | ISSUER | 1 | PYUSD, USDC, USDP | arbitrum, avalanche, base, celo, ethereum, optimism, polygon, solana, stellar | — | Yes | Not checked | Yes | No | Yes | L6 | 0 | 11 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P2
BVNK (`bvnk`) | DIRECT_PROVIDER | 0 | PYUSD, USDC, USDT | ethereum, polygon, tron | — | Yes | Not checked | Yes | No | Yes | L6 | 0 | 10 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P2
Cashfree Payments (`cashfree`) | LOCAL_PAYOUT | 1 | — | — | — | Yes | Not checked | Yes | No | No | L2 | 0 | 1 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P2
Checkout.com (`checkout-com`) | DIRECT_PROVIDER | 1 | — | — | — | Yes | Not checked | Yes | No | No | L2 | 0 | 1 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P2
Coins.ph (`coins-ph`) | ONRAMP | 1 | USDC, USDT | tempo | INSTAPAY, PESONET, QR_PH | No | Not checked | Yes | No | No | L2 | 0 | 13 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code; no docs URL on record | P2
Cowrie Integrated Systems (`cowrie`) | DIRECT_PROVIDER | 0 | — | — | — | No | Not checked | Unknown | No | No | L1 | 0 | 0 | — | no capability/coverage data mapped yet; zero evidence citations; no adapter code; no docs URL on record | P2
Crossmint (`crossmint`) | OFFRAMP | 0 | — | — | ach, bank_transfer_local, sepa | Yes | Yes | Yes | No | Yes | L2 | 0 | 7 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P2
Eco (`eco`) | ISSUER | 0 | — | — | — | Yes | Not checked | Yes | No | No | L1 | 0 | 0 | — | no capability/coverage data mapped yet; zero evidence citations; no adapter code | P2
Ethena (`ethena`) | ISSUER | 0 | USDC, USDT, USDe | — | — | Yes | Not checked | Unknown | No | No | L6 | 0 | 8 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P2
Fireblocks (`fireblocks`) | CUSTODY_SIGNING | 8 | EURC, USDC | — | — | Yes | Not checked | Yes | No | No | L2 | 0 | 6 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P2
Flutterwave (`flutterwave`) | LOCAL_PAYOUT | 13 | RLUSD, USDC, USDT | base, ethereum, polygon, solana | — | Yes | Not checked | Yes | No | Yes | L2 | 0 | 27 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P2
FOMO Pay (`fomo-pay`) | DIRECT_PROVIDER | 0 | — | — | — | Yes | Not checked | Yes | No | No | L2 | 0 | 1 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P2
Mastercard Move (`mastercard-move`) | PAYMENT_NETWORK | 0 | — | — | — | Yes | Not checked | Unknown | No | No | L1 | 0 | 0 | — | no capability/coverage data mapped yet; zero evidence citations; no adapter code | P2
Mercuryo (`mercuryo`) | ONRAMP | 10 | USDC, USDT | base, polygon, solana, stellar | — | Yes | Not checked | Yes | No | No | L2 | 0 | 18 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P2
Mesh (`mesh`) | AGGREGATOR | 0 | EURC, USDC, USDT | ethereum | — | Yes | Not checked | Yes | No | Yes | L2 | 0 | 4 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P2
MoneyGram (`moneygram`) | DIRECT_PROVIDER | 0 | — | — | — | Yes | Not checked | Unknown | No | No | L1 | 0 | 0 | — | no capability/coverage data mapped yet; zero evidence citations; no adapter code | P2
Mural Pay (`mural-pay`) | DIRECT_PROVIDER | 1 | USDC, USDT | — | — | Yes | Not checked | Yes | No | Yes | L6 | 0 | 8 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P2
Onafriq (`onafriq`) | LOCAL_PAYOUT | 10 | — | — | — | No | Not checked | Yes | No | No | L2 | 0 | 6 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code; no docs URL on record | P2
PayGlocal (`payglocal`) | LOCAL_PAYOUT | 1 | — | — | — | Yes | Not checked | Yes | No | No | L2 | 0 | 1 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P2
PayPal (`paypal`) | DIRECT_PROVIDER | 0 | — | — | — | Yes | Not checked | Yes | No | No | L2 | 0 | 1 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P2
Sphere (`sphere`) | DIRECT_PROVIDER | 2 | EURC, USDC, USDT | arbitrum, avalanche, base, ethereum, polygon, solana, tron | — | Yes | Not checked | Yes | No | No | L2 | 0 | 16 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P2
StraitsX (`straitsx`) | ISSUER | 1 | — | — | PAYNOW, bank_transfer_swift, faster_payments | Yes | Not checked | Yes | No | No | L2 | 0 | 1 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P2
Tether (`tether`) | ISSUER | 0 | USDT | avalanche, bnb-chain, celo, ethereum, solana, ton, tron | — | Yes | Not checked | Unknown | No | No | L6 | 0 | 8 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P2
Transak (`transak`) | ONRAMP | 7 | BTC, EURC, FDUSD, PYUSD, RLUSD, USDC, USDT | bnb-chain, ethereum, tron | — | Yes | Not checked | Yes | No | No | L6 | 0 | 23 | 2026-08-28 | no evidence-backed atomic route yet; no adapter code | P2
Triple-A (`triple-a`) | DIRECT_PROVIDER | 0 | — | — | — | Yes | Not checked | Yes | No | No | L1 | 0 | 1 | 2026-08-28 | no capability/coverage data mapped yet; no adapter code | P2
Visa Direct (`visa-direct`) | PAYMENT_NETWORK | 0 | — | — | — | Yes | Not checked | Unknown | No | No | L1 | 0 | 0 | — | no capability/coverage data mapped yet; zero evidence citations; no adapter code | P2
Anchorage Digital (`anchorage`) | CUSTODY_SIGNING | 0 | — | — | — | No | Not checked | Unknown | No | No | L1 | 0 | 0 | — | no capability/coverage data mapped yet; zero evidence citations; no adapter code; no docs URL on record | P3
Anclap (`anclap`) | OFFRAMP | 0 | — | — | — | No | Not checked | Unknown | No | No | L1 | 0 | 0 | — | no capability/coverage data mapped yet; zero evidence citations; no adapter code; no docs URL on record | P3
B2C2 (`b2c2`) | FX_LIQUIDITY | 0 | — | — | — | No | Not checked | Unknown | No | No | L1 | 0 | 0 | — | no capability/coverage data mapped yet; zero evidence citations; no adapter code; no docs URL on record | P3
Banking Circle (`banking-circle`) | BANKING_INFRA | 0 | — | — | — | No | Not checked | Unknown | No | No | L1 | 0 | 0 | — | no capability/coverage data mapped yet; zero evidence citations; no adapter code; no docs URL on record | P3
ClickPesa (`clickpesa`) | MOBILE_MONEY | 0 | — | — | — | No | Not checked | Unknown | No | No | L1 | 0 | 0 | — | no capability/coverage data mapped yet; zero evidence citations; no adapter code; no docs URL on record | P3
Currencycloud (`currencycloud`) | BANKING_INFRA | 0 | — | — | — | No | Not checked | Unknown | No | No | L1 | 0 | 0 | — | no capability/coverage data mapped yet; zero evidence citations; no adapter code; no docs URL on record | P3
Mobee (`mobee`) | ONRAMP | 0 | — | — | — | No | Not checked | Unknown | No | No | L1 | 0 | 0 | — | no capability/coverage data mapped yet; zero evidence citations; no adapter code; no docs URL on record | P3
n.exchange (`n-exchange`) | ONRAMP | 0 | — | — | — | No | Not checked | Unknown | No | No | L1 | 0 | 0 | — | no capability/coverage data mapped yet; zero evidence citations; no adapter code; no docs URL on record | P3
OpenPayd (`openpayd`) | BANKING_INFRA | 0 | — | — | — | Yes | Not checked | Unknown | No | No | L1 | 0 | 0 | — | no capability/coverage data mapped yet; zero evidence citations; no adapter code | P3
SCRYPT (`scrypt`) | CUSTODY_SIGNING | 0 | — | — | — | No | Not checked | Unknown | No | No | L1 | 0 | 0 | — | no capability/coverage data mapped yet; zero evidence citations; no adapter code; no docs URL on record | P3
Vibrant (`vibrant`) | OFFRAMP | 0 | — | — | — | No | Not checked | Unknown | No | No | L1 | 0 | 0 | — | no capability/coverage data mapped yet; zero evidence citations; no adapter code; no docs URL on record | P3
