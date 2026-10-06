# Provider partnership readiness

Reviewed 7 October 2026. The [39-entry public pricing inventory](PUBLIC_PRICING_PROVIDERS.md) is a source inventory, including regional bank brands. It is not a list of confirmed partners or working account integrations.

## Available now

- Each price, estimate and coverage entry opens its provider's connection options. Sign-in preserves the selected provider.
- The searchable Connections directory includes registered providers and all 39 pricing entries. Only registered providers with implemented adapters expose credentials.
- Unsupported providers can receive a saved connection-access request. Requests carry the signed-in workspace, provider and contact email, and appear as requested after reload.
- Connection requests accept a freelancer's personal-domain contact email. A database migration allows the same email to request a provider independently in different workspaces, while deduplicating retries within a workspace.
- Public observations, dated estimates, published schedules, sandbox data and customer account quotes keep separate labels. Partial prices cannot win the complete-price ranking.
- Source collection times and the selected price's source/notes are visible independently of the panel check time.
- Existing credential encryption, owner/admin authorization, environment separation and live-payment approval gates still apply.

## Required before an official integration launches

| Work | Evidence to record for each provider | Current readiness |
| --- | --- | --- |
| Commercial permission | Signed scope for API use, customer onboarding, quote display, data redistribution, storage/caching and branding; owner, review date and expiry | Not established by public access or a connection request. Maintain a provider agreement register. |
| Product and entity eligibility | Supported business countries, customer types, currencies, transfer directions and payment methods | Catalog membership or a public conversion is insufficient; confirm the specific product and route. |
| Account authorization | Provider-approved OAuth or credential flow, scopes, customer consent, token refresh and revocation | Manual encrypted credentials exist for implemented adapters. Guided provider authorization still needs provider-specific implementation. |
| Exact quotes | Account-specific pricing, all fees, source/recipient amount semantics, quote ID, timestamp, validity and funding method | Most public-feed providers have no Railor quote adapter. Revolut's public UK Standard reference excludes transfer fees. |
| Data rights and freshness | Documented official endpoint/feed, permitted polling frequency, cache lifetime, regional context, stale-data handling and incident contacts | Public website endpoints remain provisional. Scheduled source/license review and monitoring are still needed. |
| Production operations | Sandbox conformance, webhook authentication or reconciliation, idempotency, payout status, returns and support ownership | Existing payout controls apply only to implemented adapters; every new adapter needs its own verification. |
| Permission lifecycle | Agreement revocation/expiry handling and a feature gate for the affected provider/product | Live payout flags exist; a commercial permission registry and automatic expiry gate are not implemented. |
| Customer rollout | Ownership, priority, status and notification delivery for saved access requests | Requests are persisted and demand is visible to admins. A request is not provider approval or a promised launch date. |

## Integration sequence

1. Establish the provider relationship and permitted product/data scope.
2. Verify entity and route eligibility; obtain sandbox access and the official API contract.
3. Implement and test account authorization and complete quotes.
4. Verify the full payment lifecycle before enabling live execution.
5. Replace provisional public observations with official feeds where the agreement allows them; keep market estimates separately labelled.

Provider onboarding is specific to the partner and product. Wise's [partner account documentation](https://docs.wise.com/guides/product/account-setup) describes the relationship, credentials and permissions separately, and its [security guide](https://docs.wise.com/guides/developer/auth-and-security) covers partner OAuth authorization. Revolut's [Business API](https://developer.revolut.com/docs/api/business) and [transfer preparation workflow](https://developer.revolut.com/docs/guides/manage-accounts/transfers/prepare-and-validate-transfers) describe account authentication and indicative transfer quoting. The public converter is a separate source.
