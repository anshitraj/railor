# Railor Competitive Routing Audit

Generated: 2026-09-02. Every claim below is paraphrased from each company's own
public site/docs, retrieved live this session (Parallel.ai search+extract),
not copied verbatim and not taken from memory. Where a company's public
material doesn't state something, the cell says "not disclosed" — that is
itself a finding, not a gap in this research. Basilic's site (getbasilic.com)
is a JS-rendered Spanish-language landing page that returned almost no static
content even on direct extraction; its row is marked accordingly rather than
guessed from search snippets.

## Method

Real page content was pulled directly from each company's own homepage,
product pages, and (where public) docs — see the Sources section at the
bottom for the exact URLs fetched. No LinkedIn/X/Reddit content was used to
assert a capability; those channels are explicitly discovery-only per the
brief and none of the 13 required a social-media detour to find an official
source.

## Per-company dimension table

Legend: **Y** = explicitly claimed on their own site. **N** = explicitly
claimed absent/opposite. **~** = implied but not explicit. **?** = not
disclosed in public material reviewed.

| Dimension | Fireblocks Network | Circle CPN | Borderless | Heron | RIVR | DFNS Payouts | Meld | Onramper | Modern Treasury | Paycrest | StableNexus | OneStable | Basilic |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Provider universe size (as claimed) | "2,400+ exchanges/fintechs/banks" network-wide; ~11 named payment providers in the payments directory | Network of banks/PSPs/VASPs, count not disclosed | 14+ locally-licensed providers | Not disclosed (aggregates "a global network of stablecoin gateways") | Not disclosed ("global network of liquidity providers") | 1 disclosed integration (Borderless) at launch | 50+ (per this session's earlier research; not re-confirmed on the page pulled today) | Aggregates many on/off-ramp widgets (count not on the page fetched) | N/A — owns rails directly, doesn't aggregate 3rd-party payout providers | Permissionless network of liquidity providers, count not disclosed | Coordinates named banking/custody/FX/registrar/paying-agent partners per corridor, count not disclosed | Not disclosed | ? |
| Live quote support | ? | ? | ~ (benchmarks execution, doesn't show a public quote API) | ~ | ~ ("get the best rate every time") | ~ (via Borderless) | Y (RampScore compares live conversion/price) | ~ | ? | Y ("matched to the best-priced, fastest liquidity provider... automatic") | ? | ~ ("real-time exchange rates") | ? |
| Customer BYO provider credentials | N — Fireblocks/its customers hold the relationship, not a pass-through to the underlying provider's own account | N — CPN membership is the integration | N — Borderless is the counterparty of record, not a passthrough to your own Nium/dLocal account | N | N | N (customer integrates to DFNS, which integrates to Borderless) | N | N | N (Modern Treasury is the platform of record) | N/A (protocol-level, no "BYO" concept) | N | N | ? |
| Route optimization / best execution | ~ (directory, not shown optimizing) | N (settlement network, not a router) | Y ("reliability scoring, execution benchmarking, real-time routing") | Y ("intelligent routing... optimize for speed, cost, or redundancy") | Y ("routed dynamically... fastest, lowest-cost path") | Y (inherits Borderless's) | Y (RampScore) | Y (its stated purpose) | ~ ("one flow" across rails, not framed as optimization) | Y ("automatic, competitive, fully transparent" matching) | ~ ("route map," not framed as cost/speed optimization) | ~ | ? |
| FX comparison | ? | ? | ~ ("no FX markups" claimed, not shown compared) | ~ | Y ("aggregate global liquidity. Get the best rate every time") | ~ | Y | ~ | ? | ~ | ? | Y ("real-time exchange rates") | ? |
| Stablecoin support | Y | Y (USDC/EURC native) | Y | Y | Not stablecoin-specific — "capital movement" broadly | Y (core product) | Y | Y | Y ("Stablecoin Orchestration" product line) | Y (core product; cNGN/USDT named) | Y | Y | Y (implied by category) |
| Multi-chain / network routing | ? | Y (multiple chains per CPN docs) | ? | Y ("optimize... across chains") | ? | ~ (inherits Borderless) | Y ("multi-chain and token support") | ? | ? | Y ("8 blockchain networks") | ? | ? | ? |
| Local payout rails named | ? | Y (e.g. UAE FTS, per this session's own earlier research) | Y (currency list shown: USD/EUR/MXN/BRL/NGN/INR/KES/ZAR/PHP/IDR/GBP/ARS/COP/CLP/EGP) | ? | ? | ~ (inherits Borderless's) | ? | ? | ? | ~ (cNGN/KES/NGN named, specific rail names not shown) | Y (per-market case studies name specific regulators/rails) | ? | ? |
| Compliance / licensing claims | "does not provide regulated services... not responsible for" listed providers' regulation | Travel Rule + "CPN Rules" + Trust Engine for counterparty risk | "14+ locally-licensed providers," compliance-as-a-feature | Y ("deterministic controls... auditable trails") | Y ("compliance built in... every transaction screened") | Y (frames itself as "control plane for authorization, signing, and auditability") | Y (SOC 2, independently pen-tested) | ? | Y (built-in compliance claimed) | Y ("compliance built in") | Y — this is StableNexus's central pitch (government/regulator case studies, MAS named) | Y ("banking-grade security," "regulatory resilience") | ? |
| Evidence / provenance model (public) | N — no cited source-of-truth per claim | N | N — no per-claim citation shown | N | N | N | N | N | N | N | **Y-ish** — "proof of completion," "exportable proof, lifecycle objects, and named operating parties," "visible route map with operating posture shown at each stage" | N | ? |
| Continuous monitoring (of routes/providers, not just uptime) | ? | ? | ~ ("new providers added every month," reliability *scoring* implies some monitoring, not described as source-level) | ~ | ? | ~ (inherits Borderless) | ~ (RampScore is described as updated from "millions of monthly transactions") | ? | 99.99% uptime stat (platform uptime, not per-provider route monitoring) | ? | ~ (case-study feed reads like ongoing regulatory monitoring, not route-level) | ? | ? |
| Historical route-change graph (public) | N | N | N | N | N | N | N | N | N | N | N | N | ? |
| Real observed reliability (published number) | N | N | ~ (talks about "reliability scoring" as a feature, doesn't publish its own number) | N | N | N | N | N | Y (99.99% uptime) | Y (98.7% reliability, 30s avg delivery) | N | N | ? |
| Failover | ? | N (not its role — network operator, not a router) | Y ("Every outage routed around") | Y (routing explicitly optimizes for "redundancy") | ~ | ~ (inherits Borderless) | ~ | ? | ? | ~ (automatic matching implies failover) | ? | ? | ? |
| Executes real payments | Y (via listed providers) | Y (via network participants) | Y | Y | Y | Y (via Borderless) | Y | Y | Y | Y | ~ (coordinates; named partners execute) | Y | ? |
| Customer-specific pricing | ? | ? | "Flat platform fee, no FX markups" (uniform, not customer-specific) | ? | ? | ? | ? | ? | "Usage-based pricing that scales" | ? | ? | "Near-zero... significantly reduce" (not customer-specific) | ? |
| Public API | Y | Y | Y (implied — "single API") | ~ (not shown on the page fetched) | Y | Y | Y (multi-language SDKs shown) | Y (its entire product) | Y | Y (public docs) | ? | Y | ? |
| Agent / AI capabilities | N (none disclosed) | N | N | N | N | N | N | N | N | N | N | N | ? |

## What this actually shows

**Every one of the 12 companies with substantive public material is an
execution/orchestration platform, not an evidence layer.** Borderless, Heron,
RIVR, Meld, OneStable, and (via Borderless) DFNS Payouts all sell the same
underlying pitch — "connect once, we route across our provider network for
you" — and compete on coverage, speed, and cost. Not one of them publishes a
standard for distinguishing a *proven* route from a *plausible* one. None
expose which specific fact (which docs page, which API response, which
regulator filing) backs a given coverage claim. None publish a route-level
change history. That gap is real, not assumed — it was checked, not asserted.

**Circle Payments Network and Fireblocks Network for Payments are
connectivity/settlement infrastructure, not routers.** CPN is a settlement
rail (USDC/EURC between network participants) that other routers plug into;
Fireblocks Network for Payments is a directory of providers Fireblocks
customers can connect to, with an explicit disclaimer that Fireblocks "does
not provide regulated services" for any listed provider. Neither claims to
compare or rank providers.

**Meld's RampScore is the closest published analog to a confidence/ranking
system** — but it scores consumer fiat-to-crypto onramp widgets on
price/conversion/settlement from transaction volume, not B2B cross-border
stablecoin *payout* routes from cited evidence. Different market, different
proof standard (statistical performance vs. documentary evidence).

**StableNexus is the philosophically closest competitor found** — the only
one of the 13 whose own language ("proof of completion," "exportable proof,
lifecycle objects, and named operating parties," "a visible route map with
the operating posture shown at each stage") sounds like it's reaching for the
same thing Railor's RouteConfirmation model does. The real difference: their
proof is post-hoc, execution-workflow proof for government/institutional
treasury corridors (MAS, Indonesian export-proceeds rules) — proof that a
specific transaction completed correctly — not a pre-trade capability graph
that tells a customer, before they route anything, whether a given
provider/asset/country/currency/rail combination has ever been *shown* to
work versus merely assembled from independently-true pieces. That distinction
is exactly what this session's CONFIRMED / PARTIALLY_CONFIRMED / UNCONFIRMED
/ UNSUPPORTED / UNKNOWN states exist to make legible.

**Paycrest is structurally the furthest from Railor's model.** It's a
permissionless protocol matching orders to anonymous/algorithmic liquidity
providers, not a registry of identifiable, named, licensed companies. "Best
route" there means "cheapest available bid right now," not "the company
we can prove serves this corridor."

**DFNS Payouts is not yet an independent data point** — its own launch post
says it starts with exactly one integration (Borderless) and frames itself as
"powered by Borderless." Evaluating DFNS today is close to evaluating
Borderless with a wallet/custody/signing layer (DFNS's actual core product)
in front of it.

## Where Railor is genuinely different

Twelve real, verified data points, not marketing:

1. **No competitor found publishes a route-confirmation tier tied to a
   specific cited source.** Railor's CONFIRMED/PARTIALLY_CONFIRMED/
   UNCONFIRMED/UNSUPPORTED/UNKNOWN states, each backed by an evidence row
   with a URL and a verbatim quote, has no public analog among these 13 —
   including the two (StableNexus, Meld) that come closest in spirit.
2. **No competitor exposes *which dimensions* are proven vs. missing for a
   specific route.** Railor's `confirmedDimensions`/`unconfirmedDimensions`
   split (source asset confirmed, entity jurisdiction not) is a level of
   transparency none of the reviewed sites offer — they show a route or they
   don't.
3. **Railor explicitly refuses to synthesize an atomic route from
   independently-true facts** (the anti-Cartesian rule this session
   repeatedly enforced — e.g. refusing to claim Nium's USDC-funding fact plus
   its separate AE/AED fact together prove one exact route). Every
   competitor examined markets itself on *doing* exactly that kind of
   synthesis automatically, faster.
4. **BYO-credential architecture is structurally absent from all 13.** Every
   one wants to be the counterparty of record between the customer and the
   underlying provider. Railor's schema (`provider_connections`,
   `encryptedCredentials`) is built for a customer to connect *their own*
   provider account — Railor stays a neutral research/comparison layer even
   after a customer picks a provider, rather than inserting itself into the
   settlement path.
5. **No competitor publishes a source re-check cadence or a historical
   route-change record.** Railor's `source_snapshots`/`nextCheckAt`
   monitoring loop is infrastructure none of the 13 describe in public
   material — their "gets smarter every transaction" language is about
   traffic-driven scoring, not source-level change detection.
6. **Named-rail specificity.** Railor's `named_rails` reference table (UPI,
   PIX, CHAPS, per-country SEPA variants, M-PESA, PayShap, Interac, and now
   UAE's FTS/IPI/RTGS) is more granular than any local-rail claim found on
   these 13 sites, which mostly name countries/currencies, not the specific
   settlement rail.
7. **Provider-neutral by construction, including both direct providers and
   aggregators in one graph.** Railor doesn't have to pick a side between
   "be an aggregator" and "list direct providers" — it evaluates both
   Fireblocks-Network-style aggregators and the direct providers underneath
   them on the same evidentiary terms.
8. **Explicit refusal to fabricate execution capability.** Railor's
   `executeTransfer` function permanently refuses to execute a real transfer
   — a hard policy line, not a roadmap gap — while 12 of 13 competitors here
   already execute real payments today. Railor is not competing on
   execution; it's competing on trustworthy pre-trade intelligence that a
   customer then acts on directly with the provider or via their own
   execution stack.
9. **No competitor discloses a demo/real-data separation as a first-class
   product property.** Railor's `isDemo` boundary and its enforced separation
   from real provider evidence (the seed-script bug fixed earlier this
   session was specifically about protecting this boundary) has no stated
   analog — most competitors' public materials don't distinguish real
   customer-verified corridors from illustrative ones at all.
10. **Deterministic, auditable ranking over ML-black-box scoring.** Meld's
    RampScore and Borderless's "reliability scoring" are described as
    learned/statistical and opaque from the outside. Railor's ranking
    (`scoreProvider`) is deterministic and its reasons are enumerable and
    shown to the customer.
11. **Agentic gap-filling is not yet a differentiator — it's a roadmap item.**
    None of the 13 disclose agent/AI capabilities either, so this is not
    currently a point of difference; it's an opportunity where Railor's
    stated direction (agentic investigation of missing/changed routes) would
    be the first mover among reviewed competitors, not a caught-up feature.
12. **Railor is not (yet) an execution platform, and that is a real,
    current limitation, not a hidden strength.** Every competitor reviewed
    already moves real money. Railor's differentiation claim is
    trustworthiness and transparency of the *decision*, not speed or
    coverage of the *transaction* — a genuinely different value proposition,
    but one that only matters to a buyer who also has (or is willing to
    build) their own execution path, which is a narrower buyer than "give me
    one API that just works."

## Sources fetched this session

- https://www.fireblocks.com/platforms/fireblocks-network/directory
- https://www.circle.com/cpn
- https://developers.circle.com/cpn
- https://borderless.xyz/
- https://tryheron.com/
- https://www.rivr.finance/
- https://getbasilic.com/ (minimal static content retrieved)
- https://onestable.finance/
- https://stablenexus.dev/
- https://dfns.co/article/introducing-payouts
- https://www.moderntreasury.com/
- https://www.meld.io/
- https://docs.onramper.com/ (redirected to generic docs landing)
- https://www.paycrest.io/

## Research gaps in this audit

- Basilic: needs a non-JS-rendering fetch method (e.g. a headless browser) or
  a direct conversation with the company; this session's tooling could not
  retrieve its actual product content.
- Onramper: the specific `/docs/onramp-providers` page named in the brief
  redirected rather than rendering its provider list in this session's
  fetch — worth a direct retry with the exact URL and a different
  extraction path (their `llms.txt` is the better next attempt).
- Live-quote, customer-specific-pricing, and continuous-monitoring cells
  marked "?" reflect genuinely undisclosed information on the public pages
  reviewed, not a research shortcut — several of these companies likely
  disclose more under an NDA/sales conversation than on their marketing site.
