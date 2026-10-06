# Railor product priorities

Reviewed 7 October 2026 against the current repository and official product documentation. Recommendations are product judgments, not promises of funding or proof of demand from Railor customers. The pasted industry comparison is a research lead; its funding figures and provider claims were not adopted as verified facts.

## Recommended first customer

Indian service exporters, agencies and freelancers receiving recurring overseas client payments. Start with USD, EUR and GBP into INR. Sell less work and clearer outcomes: know which account fits, get paid, find the receipt documents, and reconcile the invoice. Broaden to goods exporters after purpose and documentation workflows are verified.

A long provider directory is useful discovery, but recurring workflow adoption is a stronger foundation for retention. The provider-independent record linking invoice, eligibility evidence, actual costs, settlement and documents is the proposed advantage. It needs official integrations and customer results to become defensible.

## What already exists

The repository already implements provider/corridor discovery, evidence-based route evaluation, public price comparison, beneficiary records, payment attempts/status, idempotency, webhook verification and reconciliation of outgoing payment status, policy decisions, approvals, monitoring and developer interfaces. These are foundations to improve, not missing features to recreate. Provider-account connectivity and production readiness vary by adapter; catalog coverage is not execution coverage.

This change adds Business and Freelancer/Sole proprietor account context to price checks, including personal-name versus registered trading-name accounts, account country, Send/Receive, and purpose. Published Wise and Skydo Indian collection rules affect qualification and ranking, with document, fee, corridor and settlement explanations. Other contexts remain explicitly unconfirmed. URL parameters preserve the selection; it does not certify the workspace's legal identity or complete provider KYC.

## Highest-priority gaps

| Order | Feature and smallest useful release | Why a customer would use it repeatedly | Current gap and acceptance evidence |
| --- | --- | --- | --- |
| 1 | Client invoice/payment request: import or create an invoice, choose an approved collection account, copy payment instructions, track due and paid amounts | Getting paid for a real invoice is more frequent than browsing provider prices | No complete collection/invoice workflow found; the payout composer only has a reference field. Pilot five customers through invoice → receipt with correct payer reference and no false paid status. |
| 2 | Receipt document inbox: attach provider-issued FIRA/e-FIRC to its invoice and bank credit, list missing items and offer accountant export | Eliminates document chasing at month end | No receipt-document workflow found. Store issuer/type separately; Railor must not create a bank certificate or claim that FIRA, e-FIRC and e-BRC are interchangeable. Measure document completeness and retrieval time. |
| 3 | Reconciliation: invoice currency → provider receipt → fees/tax → FX → INR bank credit; manual CSV first, then Zoho Books | A payment status alone does not close the books | Existing payment-state reconciliation is not accounting reconciliation. Account for partial payments, multiple invoices per receipt, returns and FX differences. Demonstrate a balanced ledger export with unresolved differences visible. Consider Tally/QuickBooks after interviews confirm which is used. |
| 4 | Saved verified customer profile and onboarding checklist: exact entity form, legal name, bank-name match, beneficial owners, purpose and industry | Prevents wasted signups and rejected collections | New comparison context is declared and URL-scoped. Carry evidence through workspace settings and provider onboarding, with expiry and re-verification; do not relabel freelancers as personal remittance senders. Expand sourced provider rules based on customer demand. |
| 5 | Official quotes and authorized connections for the first 2–3 providers customers actually use | Makes comparisons usable and reduces credential work | Most catalog providers have no account quote adapter. Obtain permitted API/data scope; implement provider-approved authorization, token lifecycle, account fees and quote validity. Track successful production connections and quote completeness by product. |
| 6 | Collection tracking and exception inbox: awaiting client payment, funds received, compliance hold, converted, bank credited, returned; assign an owner | Answers “where is my money?” and makes delays actionable | Outgoing payout state exists; receiving workflow and human case ownership still need work. Avoid automatic rerouting or retrying an uncertain transfer until the original is reconciled. Measure exception resolution time and duplicate prevention. |
| 7 | Receipt-level actual-cost and settlement analytics; budget/target-rate notifications | Shows measurable savings and cash-flow impact | Comparisons are mostly observations, not realized savings. Record all actual fee components and benchmark against a documented alternative at the same time, product and amount. Existing monitoring can be extended after reliable receipt data exists. |
| 8 | Partnership and evidence lifecycle: permission scope, expiry, change review, official source freshness and integration health | Keeps eligibility and commercial claims dependable | Connection requests now record demand but do not constitute permission. See [provider launch prerequisites](PROVIDER_PARTNERSHIP_READINESS.md). Require a per-product agreement/evidence owner before official launch. |

## Evidence and its limits

- Wise publishes different identity/bank-name requirements for freelancers, sole proprietors and incorporated entities. This supports a real profile model rather than a cosmetic toggle. [Wise verification](https://wise.com/help/articles/6Kpm9pXlJW79OGAktSnHos/how-to-verify-your-indian-business-to-receive-payments).
- Wise's Indian receiving product has specified receipt limits, additional document fees and automatic INR settlement; it is distinct from an anonymous sender quote. [Wise receiving documentation](https://wise.com/help/articles/71lNXW0Ls3gEFhUH8PtodV/receiving-payments-for-indian-businesses).
- Skydo's onboarding requests identity, bank and business-activity evidence, supporting a profile-specific document checklist. [Skydo onboarding](https://www.skydo.com/blog/how-to-sign-up-on-skydo).
- Xflow describes invoices, payout syncing, receipt matching and attached e-FIRA in its Zoho workflow. That establishes an existing competitor baseline, not independent proof of customer satisfaction. [Xflow's Zoho workflow](https://www.xflowpay.com/blog/manage-international-payments-with-xflow-and-zoho-books).
- Airwallex's commissioned Q3 2023 survey covered 1,000 SMBs in the US, UK, China, Australia and Singapore. Respondents reported settlement delays, costly forced conversion and complexity across methods/currencies. It supports the general problem; the age, sponsor and absence of Indian respondents limit direct inference for this launch. [Survey and methodology](https://www.airwallex.com/global/newsroom/demand-for-embedded-finance-soars-among-smbs-as-traditional-banks-fall-short).
- Zoho's own community includes customers struggling to match foreign-currency invoices and bank receipts after fees. These are qualitative workflow examples, not prevalence estimates. [Customer reconciliation discussion](https://help.zoho.com/portal/en-gb/community/topic/foreign-currency-invoice-unable-to-match-payment).

## What to defer

A full neobank, cards, lending, crypto exchange, every-country payroll, a new accounting system, and 100 speculative connectors. They introduce separate customer needs and operating requirements before the first collection workflow is proven. Improve the existing AI/search and routing tools when they remove a measured task; another chatbot alone is not the proposed advantage.

## Next 90 days, conditional on partner access

1. First 2 weeks: interview 10 target customers and 3 accountants. Observe their last three real payments; identify actual fees, document gaps, support delays and accounting tools. Recruit five design partners. Request provider sandbox/production access in parallel.
2. Weeks 3–6: ship invoice import/payment instructions, receipt matching, document inbox and accountant CSV export using authorized provider data or clearly labelled manual uploads. Pilot one collection corridor/product end to end before expanding.
3. Weeks 7–10: integrate the accounting tool most pilots use, then a second approved provider and an exception inbox. Add automated status/document ingestion only where the official product supports it.
4. Weeks 11–12: review retention, paid conversion and operating costs. Broaden provider coverage only when customers ask and the first workflow is repeatable.

Suggested pilot gates, not predicted results: five active design partners, ten paid customers, at least two monthly cohorts, repeat collection activity, measured reduction in reconciliation/document work, and no unresolved duplicate-transfer incidents. Count active organizations completing receipts, not signups or catalog entries. Report net revenue, provider costs, human support time, gross margin and cohort retention separately from payment volume. Confirm willingness to pay with a paid pilot; do not infer it from survey interest.

## Funding case

The strongest pitch to test is: “Railor is the independent operations layer for Indian exporters using multiple payment providers: eligible account choice, transparent realized costs, receipt documentation and clean reconciliation.” Show customer interviews, authorized integration depth, a working workflow, repeat paid usage and measured customer outcomes. No feature list guarantees funding or makes a company unbeatable. Durable advantages could come from maintained eligibility evidence, reliable integrations, distribution through accountants/accounting tools, and customer-authorized operational history.
