# Public pricing coverage

Railor now keeps three kinds of evidence separate: current public/provider
quotes, fee statements captured from provider sources, and historical
consumer-remittance surveys. No new account credentials are needed for the
public survey directory or historical samples.

## Added source

- Source: [The World Bank, Remittance Prices Worldwide](https://datacatalog.worldbank.org/search/dataset/0037898/remittance-prices-worldwide).
- Latest downloaded survey: **2025 Q3**, retrieved **2026-10-07**.
- **400 provider entries**, **12,905 fee samples** at their original amounts.
- Public dataset license: **CC BY 4.0**, as recorded in the source catalog.
- Provider names can include regional brands and service combinations;
  the count is entries, not a claim of 400 independent companies or integrations.
- Workbook SHA-256 is stored with the derived data for reproducibility.

The calculator's historical panel filters by the observed sending currency
and selected receiving country. Each sample preserves its original amount,
fee, collection date, payment method and pickup method. Undisclosed FX
margins and total costs remain unknown. The workbook does not explicitly
identify the destination payout currency, so Railor does not manufacture
recipient amounts or current exchange-rate quotes from it.

Historical samples never enter the live/published quote rows, best-price
ranking, selected payout amount or execution flow. They are not estimates
for an arbitrary user-entered amount, nor evidence of business eligibility.

## Product surfaces

- `/prices` and `/app/prices`: country-filtered historical fee samples,
  independently searchable and expandable without another provider API call.
- `/providers`: all 400 surveyed entries, searchable by name and source
  currency, filterable by receiving country, with a fee example from the
  selected country. The original mapped infrastructure catalog remains at
  `/providers?view=infrastructure`.
- `/prices/providers`: redirects to the main surveyed directory.
- Business-provider coverage: existing database fee statements, their source
  links and original dates. These do not become quotes unless a valid quote
  source provides the required request-specific pricing.
- Wise quotes: prefer `price.total.value.amount`, which can include taxes
  absent from the older `fee.total` field; retain the legacy fallback.

## Refresh

Download the complete workbook linked from the official source catalog, then:

```powershell
python scripts/import-remittance-prices.py C:/path/to/rpw_dataset.xlsx https://official-download-url
```

The importer uses Python's standard library, selects the latest available
quarter, preserves collection dates, and writes
`packages/core/src/public-pricing/data/world-bank-remittances.json`.
Pass the actual workbook download URL to preserve its provenance; otherwise
the source catalog URL is stored as the download reference.
Review dataset licensing, workbook layout and reported counts for each update.
The imported data is a dated snapshot; normal price-panel polling does not
make those survey observations live.

## Production account pricing later

Account-specific quotes still require official account/API access and the
provider's route and fee permissions. Currently configured local Airwallex
credentials are sandbox credentials. They must not be represented as real
production quotes. Xflow's documented quote endpoint is account-authenticated
and indicative, and dLocal's Quote API requires account enablement.

Sources: [Xflow API reference](https://docs.xflowpay.com/exports/latest/api),
[dLocal quote configuration](https://docs.dlocal.com/docs/quotes-configuration-payouts-v3),
[Wise quote pricing structure](https://docs.wise.com/guides/product/send-money/use-cases/correspondent/correspondent-create-auth-quote).
