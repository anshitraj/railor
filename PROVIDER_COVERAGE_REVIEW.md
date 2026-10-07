# Provider coverage review — 7 October 2026

A read-only check of the production Neon database found **90 non-demo providers**, **48 with capability records**, and **41 with no attached evidence records**. A registry entry is not proof of country eligibility, a working integration, a live quote, or payout support. Dedicated route rows cover four providers; capability and receiving-endpoint records also contribute to coverage, so this is not the total number of usable providers.

## Candidates missing from the registry

| Candidate | Relevant offering | Research needed before adding coverage |
| --- | --- | --- |
| [Revolut Business](https://www.revolut.com/business/) | Business accounts and international payments | Supported business registration countries, currencies, account requirements and published pricing |
| [Remitly](https://www.remitly.com/) | Consumer international transfers | Individual eligibility, sending/receiving markets, delivery methods and quote terms |
| [TerraPay](https://www.terrapay.com/) | Cross-border payment infrastructure | Partner access, verified corridors, wallet/bank delivery and business requirements |
| [Ebury](https://ebury.com/) | Business payments and currency services | Entity eligibility, settlement coverage, collections and source-backed requirements |

These are a prioritised research list, not an exhaustive provider universe. Some brands appear in the separate public-pricing inventory already; pricing observations do not create provider capability records. Keep unsupported corridors unknown until primary-source evidence is attached. Eligibility varies by customer type and country.

## Higher priority than increasing the logo count

1. Attach dated primary-source evidence to existing providers without evidence, starting with providers relevant to active markets.
2. Separate directory presence, documented capability, connected accounts, and executable quotes in the product.
3. Verify personal versus business eligibility for each corridor. Onboarding now records this choice and suggested routes respect it.
4. Review Railway discovery failures and approve queued source changes before publishing new coverage claims.

## Account onboarding changes

New email and OAuth sign-ins enter setup before their requested destination; invitation acceptance is preserved. Completed accounts return to the app. Five guided questions cover account use, home country, destination markets, settlement currencies and interests, with a final answer review. Business, independent freelancer, registered freelancer business and personal choices persist in the existing organization profile field. No database migration is required. Price comparisons inherit the saved account profile and still honour explicit comparison parameters; commercial export-collection evidence never verifies a personal account.

Steps autosave when continuing. Users can go back, resume saved progress, edit reviewed answers or explicitly decide later; skipped filters remain visible as assumptions. Motion honours reduced-motion preferences. This is workspace personalisation; each provider performs its own onboarding and verification.

Production authentication still needs the verified Resend sending domain and SMTP credentials, plus Google OAuth configuration. The production usage-rollup cron also needs its Vercel secret. These deployment settings are separate from this onboarding change.
