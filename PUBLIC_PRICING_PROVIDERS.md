# Public pricing providers for Railor

Checked 2026-10-07. **39 provider entries**, including regional bank brands.

Railor now fetches Revolut’s anonymous UK converter alongside Wise. The existing comparison reader automatically includes providers returned for the selected currency pair and amount. The survey below found 36 entries across 12 currency pairs; all 39 entries will not have prices for every request.

Revolut is a UK Standard personal-plan FX reference, with transfer fees marked incomplete. It does not establish that an India-registered business can open an account. Wise is a direct public reference. Other comparison-feed rows are dated consumer estimates, and Skydo/PayZoll are published fee calculations. Partial rows cannot win the complete-price ranking.

The public website endpoints are undocumented and may change or become unavailable. Railor uses bounded requests and cached observations; an unavailable Revolut quote is reported without inventing a price. Collection dates are retained separately from the panel refresh time.

| # | Provider | Pricing source | Observed sample pairs |
| --- | --- | --- | --- |
| 1 | [Revolut · UK Standard](https://www.revolut.com/currency-converter/) | Direct public FX; fees incomplete | USD/INR, GBP/INR |
| 2 | [ABN AMRO Bank](https://api.wise.com/v4/comparisons/?sourceCurrency=EUR&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | EUR/INR, EUR/GBP |
| 3 | [ANZ](https://api.wise.com/v4/comparisons/?sourceCurrency=AUD&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | AUD/INR, AUD/USD |
| 4 | [Barclays](https://api.wise.com/v4/comparisons/?sourceCurrency=GBP&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | GBP/INR, GBP/USD |
| 5 | [BBVA](https://api.wise.com/v4/comparisons/?sourceCurrency=EUR&targetCurrency=GBP&sendAmount=10000) | Wise comparison feed; dated estimate | EUR/GBP |
| 6 | [BNP Paribas](https://api.wise.com/v4/comparisons/?sourceCurrency=EUR&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | EUR/INR, EUR/GBP |
| 7 | [Chase (US)](https://api.wise.com/v4/comparisons/?sourceCurrency=USD&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | USD/INR, USD/EUR |
| 8 | [Commerzbank](https://api.wise.com/v4/comparisons/?sourceCurrency=EUR&targetCurrency=GBP&sendAmount=10000) | Wise comparison feed; dated estimate | EUR/GBP |
| 9 | [Commonwealth Bank of Australia](https://api.wise.com/v4/comparisons/?sourceCurrency=AUD&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | AUD/INR, AUD/USD |
| 10 | [Deutsche Bank](https://api.wise.com/v4/comparisons/?sourceCurrency=EUR&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | EUR/INR, EUR/GBP |
| 11 | [Halifax](https://api.wise.com/v4/comparisons/?sourceCurrency=GBP&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | GBP/INR, GBP/USD |
| 12 | [HSBC](https://api.wise.com/v4/comparisons/?sourceCurrency=GBP&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | GBP/INR, GBP/USD |
| 13 | [HSBC Australia](https://api.wise.com/v4/comparisons/?sourceCurrency=AUD&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | AUD/INR, AUD/USD |
| 14 | [HSBC Singapore](https://api.wise.com/v4/comparisons/?sourceCurrency=SGD&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | SGD/INR |
| 15 | [Instarem](https://api.wise.com/v4/comparisons/?sourceCurrency=USD&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | USD/INR, EUR/INR, USD/EUR, AUD/INR, GBP/USD, SGD/INR, EUR/GBP, USD/PHP, AUD/USD |
| 16 | [LaCaixa](https://api.wise.com/v4/comparisons/?sourceCurrency=EUR&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | EUR/INR, EUR/GBP |
| 17 | [Lloyds](https://api.wise.com/v4/comparisons/?sourceCurrency=GBP&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | GBP/INR, GBP/USD |
| 18 | [Monese](https://api.wise.com/v4/comparisons/?sourceCurrency=GBP&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | GBP/INR, EUR/INR, GBP/USD, EUR/GBP |
| 19 | [Moneygram](https://api.wise.com/v4/comparisons/?sourceCurrency=GBP&targetCurrency=USD&sendAmount=10000) | Wise comparison feed; dated estimate | GBP/USD |
| 20 | [Nationwide](https://api.wise.com/v4/comparisons/?sourceCurrency=GBP&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | GBP/INR, GBP/USD |
| 21 | [NatWest](https://api.wise.com/v4/comparisons/?sourceCurrency=GBP&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | GBP/INR, GBP/USD |
| 22 | [OFX](https://api.wise.com/v4/comparisons/?sourceCurrency=GBP&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | GBP/INR, USD/INR, EUR/INR, USD/EUR, AUD/INR, GBP/USD, SGD/INR, CAD/INR, EUR/GBP, CAD/USD, USD/PHP, AUD/USD |
| 23 | [PayPal](https://api.wise.com/v4/comparisons/?sourceCurrency=GBP&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | GBP/INR, USD/EUR, GBP/USD, EUR/GBP, CAD/USD, USD/PHP, AUD/USD |
| 24 | [Rabobank](https://api.wise.com/v4/comparisons/?sourceCurrency=EUR&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | EUR/INR, EUR/GBP |
| 25 | [RBS](https://api.wise.com/v4/comparisons/?sourceCurrency=GBP&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | GBP/INR, GBP/USD |
| 26 | [Remitly](https://api.wise.com/v4/comparisons/?sourceCurrency=GBP&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | GBP/INR, USD/INR, EUR/INR, USD/EUR, AUD/INR, GBP/USD, EUR/GBP, USD/PHP, AUD/USD |
| 27 | [Royal Bank of Canada](https://api.wise.com/v4/comparisons/?sourceCurrency=CAD&targetCurrency=USD&sendAmount=10000) | Wise comparison feed; dated estimate | CAD/USD |
| 28 | [Sabadell](https://api.wise.com/v4/comparisons/?sourceCurrency=EUR&targetCurrency=GBP&sendAmount=10000) | Wise comparison feed; dated estimate | EUR/GBP |
| 29 | [Skrill](https://api.wise.com/v4/comparisons/?sourceCurrency=GBP&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | GBP/INR, EUR/INR, GBP/USD, EUR/GBP |
| 30 | [State Bank of India](https://api.wise.com/v4/comparisons/?sourceCurrency=GBP&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | GBP/INR, USD/INR, EUR/INR |
| 31 | [UniCredit](https://api.wise.com/v4/comparisons/?sourceCurrency=EUR&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | EUR/INR, EUR/GBP |
| 32 | [Wells Fargo](https://api.wise.com/v4/comparisons/?sourceCurrency=USD&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | USD/INR, USD/EUR, USD/PHP |
| 33 | [Western Union](https://api.wise.com/v4/comparisons/?sourceCurrency=GBP&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | GBP/INR, USD/INR, EUR/INR, USD/EUR, AUD/INR, GBP/USD, CAD/INR, EUR/GBP, CAD/USD, USD/PHP, AUD/USD |
| 34 | [Westpac](https://api.wise.com/v4/comparisons/?sourceCurrency=AUD&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | AUD/INR, AUD/USD |
| 35 | [Wise](https://api.wise.com/v4/comparisons/?sourceCurrency=GBP&targetCurrency=INR&sendAmount=10000) | Direct public quote | GBP/INR, USD/INR, EUR/INR, USD/EUR, AUD/INR, GBP/USD, SGD/INR, CAD/INR, EUR/GBP, CAD/USD, USD/PHP, AUD/USD |
| 36 | [WorldRemit](https://api.wise.com/v4/comparisons/?sourceCurrency=USD&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | USD/INR, GBP/USD |
| 37 | [Xoom](https://api.wise.com/v4/comparisons/?sourceCurrency=GBP&targetCurrency=INR&sendAmount=10000) | Wise comparison feed; dated estimate | GBP/INR, USD/INR, EUR/INR, USD/EUR, AUD/INR, GBP/USD, CAD/INR, EUR/GBP, CAD/USD, USD/PHP, AUD/USD |
| 38 | [Skydo](https://www.skydo.com/) | Published schedule | Foreign currency/INR |
| 39 | [PayZoll](https://payzoll.finance/payzoll-vs-skydo) | Published schedule; fees incomplete | Foreign currency/INR |

## Data and integration

The accompanying `PUBLIC_PRICING_PROVIDERS.json` contains provider slugs, source links and collection timestamps for observed feed samples. It is an inventory for review, not a database seed that asserts eligibility or guaranteed coverage.

No new Business API credentials are needed for these public references. Account-specific quotes and payment execution still require a supported customer account and an authenticated integration.
