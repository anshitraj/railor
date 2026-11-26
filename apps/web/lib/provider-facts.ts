/**
 * What a provider itself publishes about its fees, limits and tax treatment,
 * kept apart from the price check so a statement is only ever shown with the
 * page it came from. Each entry is a paraphrase of the provider's own page and
 * names it; a provider with no entry shows "not published" instead of a guess.
 * Client-safe: plain data, no server imports.
 */
export interface ProviderFact {
  /** One or more plain sentences, each of which the source page supports. */
  lines: string[];
  sources: Array<{ label: string; url: string }>;
}

export interface ProviderDeliveryFact {
  /** Short label for the hero metric ("Minutes to 2 business days"). */
  label: string;
  /** Plain explanation from the provider's own page. */
  detail: string;
  sources: Array<{ label: string; url: string }>;
}

export interface ProviderFacts {
  fees?: ProviderFact;
  limits?: ProviderFact;
  tax?: ProviderFact;
  delivery?: ProviderDeliveryFact;
  paperwork?: ProviderFact;
  /** When Railor last read the pages above. */
  reviewedAt: string;
}

const REVIEWED_AT = "2026-11-26";
const src = (label: string, url: string) => ({ label, url });

const WISE_FEES = src("Wise · Fees for sending money", "https://wise.com/help/articles/2522717/fees-for-sending-money");
const WISE_PRICING = src("Wise · Fees for sending money (US)", "https://wise.com/us/pricing/send-money");
const WISE_IN_BIZ = src("Wise Business India · Receive payments pricing", "https://wise.com/in/pricing/business/receive/");
const WISE_USD = src("Wise · Guide to USD transfers", "https://wise.com/help/articles/2932150/guide-to-usd-transfers");
const WISE_EUR = src("Wise · Send money to Europe", "https://wise.com/us/send-money/send-money-to-europe");

/** Wise's per-currency limits, as its guides state them. Only currencies Railor has read are listed. */
const WISE_LIMITS: Record<string, { line: string; source: { label: string; url: string } }> = {
  USD: { line: "Sending US dollars: up to 1 million USD per local ACH transfer, and up to 20 million USD per local wire transfer when paid from USD in your Wise account.", source: WISE_USD },
  EUR: { line: "Sending to euros: up to 6 million EUR per transfer. Above 1.2 million EUR the money has to come from your Wise account.", source: WISE_EUR },
  GBP: { line: "British pounds: up to 20 million GBP per transfer from a Wise balance, and up to 1 million GBP via external bank pay-in.", source: src("Wise · Guide to GBP transfers", "https://wise.com/help/articles/2932341/guide-to-gbp-transfers") },
  INR: { line: "Indian rupees: sending to INR up to 100 million INR (personal-to-personal), 1.5 million INR per working day when a business is involved, 500,000 INR via IMPS and 200,000 INR via UPI; sending from INR is 5,000–375,000 INR per transfer (750,000 INR/day, 250,000 USD/FY LRS).", source: src("Wise · Guide to INR transfers", "https://wise.com/help/articles/2932151/guide-to-inr-transfers") },
  AUD: { line: "Australian dollars: up to 5 million AUD to AUD; from AUD up to 5 million AUD (Wise balance), 1.8 million AUD (bank), 50,000 AUD (PayID), 18,000 AUD (card) or unlimited via RTGS.", source: src("Wise · Guide to AUD transfers", "https://wise.com/help/articles/2932154/guide-to-aud-transfers") },
  CAD: { line: "Canadian dollars: unlimited EFT to CAD (25,000 CAD via Interac); from CAD up to 1.5 million CAD by bill pay/wire, 9,500 CAD/day direct debit and 3,000 CAD by card.", source: src("Wise · Guide to CAD transfers", "https://wise.com/help/articles/2932153/guide-to-cad-transfers") },
  SGD: { line: "Singapore dollars: up to 2 million SGD per bank transfer; Singapore personal accounts have a 100,000 SGD rolling 12-month regulatory cap.", source: src("Wise · Guide to SGD transfers", "https://wise.com/help/articles/2932356/guide-to-sgd-transfers") },
  AED: { line: "UAE dirhams: Wise sets AED limits dynamically based on verification, income and local due-diligence thresholds.", source: src("Wise · Guide to AED transfers", "https://wise.com/help/articles/115007797748/guide-to-aed-transfers") },
  MXN: { line: "Mexican pesos: up to the equivalent of 1 million GBP per transfer (subject to sending-currency limits).", source: src("Wise · Guide to MXN transfers", "https://wise.com/help/articles/2932354/guide-to-mxn-transfers") },
  BRL: { line: "Brazilian reals: up to 250,000 BRL personal-to-personal, 10,000 USD equivalent to a Brazilian business, or 3,000 USD equivalent from Wise Business to a person.", source: src("Wise · Guide to BRL transfers", "https://wise.com/help/articles/2932353/guide-to-brl-transfers") },
  PHP: { line: "Philippine pesos: to PHP up to 70 million PHP to bank accounts (50,000 PHP to GCash/Maya wallets); from PHP up to 10,000 USD equiv. per transfer and 50,000 USD equiv. per month.", source: src("Wise · Guide to PHP transfers", "https://wise.com/help/articles/2932333/guide-to-php-transfers") },
  JPY: { line: "Japanese yen: up to 150 million JPY per transfer via bank pay-in (Type 1 licence), or up to 1 million JPY when funded from a Wise balance.", source: src("Wise · Guide to JPY transfers", "https://wise.com/help/articles/2932156/guide-to-jpy-transfers") },
  CHF: { line: "Swiss francs: no fixed hard cap published; transfers over 300,000 CHF process on weekdays between 05:00 and 10:00 CET.", source: src("Wise · Guide to CHF transfers", "https://wise.com/help/articles/2932338/guide-to-chf-transfers") },
};

const US_REMITTANCE_TAX = "Since January 1, 2026, a 1% US federal remittance excise tax applies only to cash, money order or cashier’s check funding; electronic bank-account and card transfers are exempt.";

function entry(
  label: string,
  url: string,
  data: {
    fees?: string[];
    limits?: string[];
    tax?: string[];
    delivery?: { label: string; detail: string };
    paperwork?: string[];
    extraSources?: Array<{ label: string; url: string }>;
  },
): ProviderFacts {
  const sources = [src(label, url), ...(data.extraSources ?? [])];
  return {
    reviewedAt: REVIEWED_AT,
    ...(data.fees?.length ? { fees: { lines: data.fees, sources } } : {}),
    ...(data.limits?.length ? { limits: { lines: data.limits, sources } } : {}),
    ...(data.tax?.length ? { tax: { lines: data.tax, sources } } : {}),
    ...(data.delivery ? { delivery: { ...data.delivery, sources } } : {}),
    ...(data.paperwork?.length ? { paperwork: { lines: data.paperwork, sources } } : {}),
  };
}

/** Published fee schedules, transfer limits and tax notes read from providers' own official pages. */
const STATIC_FACTS: Record<string, ProviderFacts> = {
  // --- Global Consumer & Business Providers ---
  remitly: entry("Remitly · Large transfers & terms", "https://remitly.com/us/en/money-transfer/large-amounts", {
    fees: [
      "Remitly’s fee depends on the corridor, amount, delivery speed (Economy vs Express) and funding method, plus an exchange-rate markup.",
      "Bank-account funding is generally cheaper than card funding; first-transfer welcome offers apply once per new customer.",
    ],
    limits: [
      "Remitly uses dynamic per-user limits based on verification, corridor and history, shown in-app before you send.",
      "Published ceilings for verified accounts reach up to 300,000 USD (US), 75,000 GBP (UK), 85,000 EUR (EU), 140,000 CAD (Canada) and 45,000 AUD (Australia); destination partner caps can be lower.",
    ],
    tax: [
      "Remitly’s user agreement places any applicable taxes on the sender.",
      US_REMITTANCE_TAX,
    ],
    extraSources: [src("Remitly · Agreement", "https://remitly.com/us/en/home/agreement-business")],
  }),
  xoom: entry("Xoom · Transfer fees", "https://www.xoom.com/legal/xoom-transfer-fees", {
    fees: [
      "Xoom charges a funding- and corridor-dependent transfer fee plus an exchange-rate spread.",
      "PayPal balance or PYUSD funding often carries a zero transfer fee, linked bank accounts and debit cards carry lower fees, and credit cards cost more (and may trigger issuer cash-advance fees).",
    ],
    limits: [
      "US sending tiers (24h / 30d / 180d): Level 1 up to 2,999 / 6,000 / 9,999 USD; Level 2 up to 10,000 / 20,000 / 30,000 USD; Level 3 up to 50,000 / 60,000 / 100,000 USD (cash pickup capped lower).",
      "UK starts at 850 GBP (Level 1) up to 21,500–42,500 GBP (Level 3); Canada 2,999 to 50,000 CAD; EEA 3,000 to 25,000–50,000 EUR per 24 hours.",
    ],
    tax: [
      "Xoom’s User Agreement states payouts exclude destination local taxes.",
      US_REMITTANCE_TAX,
    ],
    extraSources: [src("Xoom · User Agreement", "https://xoom.com/user-agreement")],
  }),
  paypal: entry("PayPal · Consumer & business fees", "https://www.paypal.com/us/digital-wallet/paypal-consumer-fees", {
    fees: [
      "Personal international transfers: 5% (0.99–4.99 USD in the US; 0.99–2.99 GBP in the UK) plus any card funding fee and currency-conversion spread.",
      "PayPal India commercial international receipts: 4.40% + fixed currency fee + currency conversion spread + 18% GST on PayPal’s fee.",
    ],
    limits: [
      "Unverified accounts have low initial caps until bank/card and identity checks complete; verified accounts typically support up to 10,000–60,000 USD per single transfer depending on region.",
      "PayPal India cross-border export receipts follow the RBI PA-CB cap of ₹25 lakh per transaction.",
    ],
    tax: ["PayPal India charges 18% GST on its service fee; exporters require FIRA/e-FIRC reconciliation."],
    extraSources: [src("PayPal India · Business fees", "https://www.paypal.com/in/business/paypal-business-fees")],
  }),
  revolut: entry("Revolut · Standard fees & transfer limits", "https://www.revolut.com/legal/standard-fees/", {
    fees: [
      "UK/EEA personal weekday FX allowance per rolling month: Standard 1,000 GBP/EUR free then 1%; Plus 3,000 GBP/EUR free then 0.5%; Premium/Metal/Ultra 0% weekday fee.",
      "Weekend FX markup (Fri 17:00 ET–Sun 18:00 ET): 1% Standard, 0.5% Plus, 0% Premium/Metal/Ultra. International bank transfer fees vary by route and plan.",
    ],
    limits: [
      "Up to 200 currency exchanges per rolling 24 hours.",
      "Outbound bank transfers follow local rail caps (e.g. UK Faster Payments up to 250,000 GBP per transfer, 500,000 GBP/day and 1,000,000 GBP/week); large transfers may trigger source-of-funds checks.",
    ],
    extraSources: [src("Revolut · Transfer limits", "https://help.revolut.com/help/transfers/outbound-transfers/are-there-any-transfer-limits-on-sending-money-to-a-bank-account/transfer-limits-to-send-money/")],
  }),
  "western-union": entry("Western Union · Transfer limits & terms", "https://www.westernunion.com/us/en/transfer-limits.html", {
    fees: [
      "Western Union charges a transfer fee based on origin, destination, funding method and payout method, plus an exchange-rate margin.",
      "Bank-funded transfers are generally cheaper than card or in-person cash transfers.",
    ],
    limits: [
      "US online transfers: up to 3,000 USD before ID verification and up to 50,000 USD verified for bank-to-bank (lower caps apply to cash/card routes).",
      "UK online ID verification starts at 800 GBP; EU online ID verification typically starts at 1,000 EUR.",
    ],
    tax: [
      "Western Union collects transfer fees plus applicable taxes.",
      US_REMITTANCE_TAX,
    ],
    extraSources: [src("Western Union · Terms", "https://westernunion.com/us/en/legal/terms-conditions.html")],
  }),
  moneygram: entry("MoneyGram · US remittance tax & corridors", "https://www.moneygram.com/us/en/help-center/faq/send-receive/us-federal-remittance-tax/what-is-the-u-s-federal-remittance-tax", {
    fees: [
      "MoneyGram’s fee varies by corridor, amount, funding method and payout method, plus an exchange-rate spread shown before you confirm.",
    ],
    limits: [
      "Limits vary by country, verification level and payment method: US online transfers commonly cap at 10,000 USD per transfer/30 days; UK starts around 7,600 GBP and can reach 40,000 GBP on select destinations.",
    ],
    tax: [US_REMITTANCE_TAX],
  }),
  "world-remit": entry("WorldRemit · FAQ & corridors", "https://www.worldremit.com/en/faq", {
    fees: [
      "WorldRemit charges a flat transfer fee (varying by corridor, funding method and payout method) plus an exchange-rate margin.",
      "Cash pickup recipients pay no WorldRemit fee; mobile-money cash-out agents may charge local withdrawal fees.",
    ],
    limits: [
      "Limits are set dynamically per corridor, funding method and payout partner (card funding typically caps around 8,000 GBP/EUR in the UK/EU, while bank funding supports higher amounts).",
    ],
    tax: ["WorldRemit notes no Indian tax is payable by recipients on personal family/friend remittances to India."],
    extraSources: [src("WorldRemit · India", "https://worldremit.com/en/India")],
  }),
  "taptap-send": entry("Taptap Send · Pricing & limits", "https://www.taptapsend.com/", {
    fees: [
      "Many corridors carry a zero transfer fee (monetized via the exchange-rate spread); other corridors carry a small upfront flat fee (commonly 1.99 USD, 0.99 GBP, 0.99–1.99 EUR or 5–7.39 AED).",
      "Taptap Send adds no card/bank funding charge on UAE transfers, though your card issuer may charge its own fee.",
    ],
    limits: [
      "Published per-transfer sending limits: US 10,000 USD (10,000/day, 24,000/14d; NM & OK capped at 999 USD), UK 99,000 GBP, Eurozone 160,000 EUR, Canada 3,500 CAD (9,500/day, 30,000/14d), Australia 250,000 AUD and UAE 37,000 AED.",
      "Destination country and mobile-wallet partner limits can be lower.",
    ],
  }),
  sendwave: entry("Sendwave · Support", "https://www.sendwave.com/en/support", {
    fees: ["Sendwave charges zero or a nominal upfront fee on most US, UK, Canadian and European corridors, earning revenue from the exchange-rate spread shown in the app."],
    limits: [
      "Limits are dynamic per user and visible in the app under Menu → My Limits.",
      "Canada entry limits start at 999 CAD/day and 2,999 CAD/month, scaling up to 2,999 CAD/day and 12,000 CAD/month with ID verification.",
    ],
  }),
  lemfi: entry("LemFi · Fees", "https://support.lemfi.com/hc/en-us/articles/45776845553809-What-fees-will-I-pay", {
    fees: ["LemFi advertises zero transfer fees on many core corridors (including Nigeria, Ghana, Kenya, India, Bangladesh, Philippines and Brazil) and zero wallet deposit fees, earning via the exchange-rate spread."],
    limits: ["Sending limits depend on your verification tier, sending country and payment rail and appear in the app under Profile Details → Account Limits."],
  }),
  aspora: entry("Aspora · Transfers", "https://www.aspora.com/help/us/transfers", {
    fees: ["Aspora advertises live mid-market exchange rates with a dynamic upfront transfer fee shown in-app (introductory zero-fee promos apply on first transfers; Aspora Plus offers fee-free credits)."],
    limits: [
      "Published single-transfer limits: up to 400,000 USD from the US, 400,000 GBP from the UK and 150,000 AED from the UAE (multiple transfers permitted; enhanced source-of-funds checks apply on large transfers).",
    ],
  }),
  xe: entry("Xe · Fees & limits", "https://help.xe.com/hc/en-gb/articles/360019908677-What-are-the-fees-for-sending-money", {
    fees: [
      "Xe often waives the transfer fee on larger transfers and most business transfers, earning via its exchange-rate margin; smaller personal transfers can carry a modest fee (e.g. US→India 1 USD below 1,000 USD, 0 USD at 1,000 USD+).",
    ],
    limits: [
      "Online single personal transfer limits: US 500,000 USD (3,000 USD min wire), UK 375,000 GBP, EU 375,000 EUR, Canada 600,000 CAD, Australia 750,000 AUD and New Zealand 750,000 NZD.",
      "Business accounts support US ACH up to 25,000 USD/day and wires up to 15 million USD equivalent/day subject to approval.",
    ],
    extraSources: [src("Xe · Transfer limits", "https://help.xe.com/hc/en-gb/articles/360020176218-What-are-the-limits-on-how-much-I-can-send")],
  }),
  ria: entry("Ria Money Transfer · Pricing & limits", "https://www.riamoneytransfer.com/en-us/send-money-to-india/", {
    fees: ["Ria’s fee depends on corridor, amount, funding method and payout method, plus an exchange-rate markup (bank funding is cheaper than debit/credit card or cash)."],
    limits: [
      "Online sending limits: US 30,000 USD per 30 days (495 USD cash-funded; US→India up to 49,999 USD/day; OK/AZ/NM 999.99 USD/day), UK 8,000 GBP/transfer, Canada 3,000 CAD/day, Australia 100,000 AUD/day and Eurozone 30,000 EUR/transfer.",
    ],
    tax: [US_REMITTANCE_TAX],
  }),
  paysend: entry("Paysend · Pricing", "https://paysend.com", {
    fees: ["Paysend charges a fixed flat fee per transfer (1.99 USD in the US, 1.00 GBP in the UK, 1.50 EUR in the Eurozone; some bank transfers are free) plus an exchange-rate spread."],
    limits: ["Sending limits are tiered by KYC level (Basic, Advance and Ultimate) and shown inside the app; initial unverified limits increase after photo ID and proof of address/source of funds."],
  }),
  instarem: entry("Instarem · Personal & business transfers", "https://www.instarem.com/", {
    fees: ["Instarem charges a transparent corridor- and method-dependent percentage or flat fee plus a near mid-market exchange rate shown upfront before confirmation."],
    limits: [
      "Minimum 1 unit of local currency. US ACH caps at 3,000 USD/transfer and 12,000 USD/month (cards 1,000 USD/transfer, 2,000 USD/month).",
      "Singapore PayNow caps at 200,000 SGD/day (cards 20,000 SGD/transfer); bank transfers from SG, AU, UK and EU carry no Instarem upper cap (cards 10,000 GBP/EUR or 20,000 AUD).",
    ],
  }),
  ofx: entry("OFX · Fee schedule", "https://ofx.com/en-us/legal/fee-schedule", {
    fees: [
      "OFX earns revenue primarily from an FX margin over the interbank rate. OFX transfer fee is 0 USD/GBP/NZD/SGD in the US, UK, NZ and Singapore.",
      "Australia charges 15 AUD below 10,000 AUD (0 AUD at 10,000 AUD+); Canada charges 15 CAD below 10,000 CAD (0 CAD at 10,000 CAD+). Intermediary bank wire fees may still apply.",
    ],
    limits: [
      "Minimum transfer amounts: 150 USD (US), 100 GBP (UK), 200 CAD (CA) and 250 AUD/NZD/SGD (AU/NZ/SG).",
      "OFX imposes no maximum transfer limit on freely traded major currencies (your bank’s outbound cap and local regulatory rules still apply).",
    ],
    tax: ["OFX’s fee schedule excludes any applicable taxes."],
  }),
  airwallex: entry("Airwallex · Fee schedule & limits", "https://www.airwallex.com/en-us/terms/fee-schedule", {
    fees: [
      "Airwallex charges a 0.50% FX margin on major currencies (0.40% for Singapore entities) and 1.00% on other currencies.",
      "US Explore local payouts cost 1 USD (EUR/SGD) or 2 USD (INR), waived on Grow/Accelerate plans; SWIFT transfers cost 15 USD (SHA) or 25 USD (OUR).",
    ],
    limits: [
      "No cap on standard deposits/collections. FX conversions run from 10 USD minimum up to 5,000,000 USD maximum per conversion; outbound payouts are bounded by available balance and local rail caps.",
    ],
    extraSources: [src("Airwallex · Transfer limits", "https://help.airwallex.com/hc/en-gb/articles/4411130663195-What-s-the-limit-for-transfers-and-deposits-on-my-account")],
  }),
  payoneer: entry("Payoneer · Pricing", "https://www.payoneer.com/pricing/", {
    fees: [
      "Local receiving accounts are generally free (non-local ~1%, min 1 USD); cross-currency withdrawals to a local bank cost up to 2% standard (1%–4% range by corridor/volume); same-currency withdrawal 1.50 USD.",
      "An annual 29.95 USD inactivity fee applies if annual receipts fall below 2,000 USD.",
    ],
    limits: ["No single universal transfer cap; transaction and monthly limits are dynamic per verified account and shown in your Payoneer dashboard."],
  }),
  // --- India Export-Collection & Outward Providers ---
  skydo: entry("Skydo · Pricing & terms", "https://www.skydo.com/send-money-to-india", {
    fees: ["Flat 19 USD (up to 2,000 USD), 29 USD (2,001–10,000 USD) or 0.30% (above 10,000 USD), plus 18% GST, with 0% FX markup (mid-market rate) and free automatic FIRA."],
    limits: [
      "Minimum transfer 50 USD (confirm smaller or non-USD receipts with support).",
      "Standard RBI PA-CB rails cap at ₹25 lakh per transaction; Skydo asks exporters to confirm high-value invoices beforehand and prohibits splitting invoices.",
    ],
    tax: ["18% GST applies on Skydo’s flat/percentage fee."],
  }),
  infinity: entry("Infinity · Bank transfer charges", "https://www.infinityapp.in/faqs/articles/what-infinity-charges-for-bank-transfer-payments", {
    fees: ["0.50% all-inclusive fee on bank transfers up to 50,000 USD (GST included), 0% FX markup and free automatic FIRA; QuickLinks card payments cost 5% (5 USD min)."],
    limits: ["Infinity advertises no upper cap on standard international bank collections; transfers above 50,000 USD use custom pricing."],
    tax: ["GST is included inside the published 0.50% bank-transfer fee."],
  }),
  mulya: entry("Mulya · Fees & limits", "https://support.mulya.co/all-about-mulya-fees/355SkxzLmGBVnEpM1FjVqN/what-is-the-fees-charged-by-mulya/q7nerJsqcrvzR4ymt9ChnA", {
    fees: ["1.00% all-inclusive fee (no extra GST added), 0% FX markup advertised and free FIRS/remittance documents within 24 hours."],
    limits: ["No minimum amount; up to 1,000,000 USD per single transaction (invoices over 10,000 USD do not need splitting) and no monthly or annual cap."],
    tax: ["No additional GST is billed on top of Mulya’s 1% all-inclusive fee."],
  }),
  payglocal: entry("PayGlocal · Multi-currency accounts", "https://payglocal.in/multi-currency-accounts", {
    fees: ["Multi-Currency Account tiers: 10 USD (up to 2,000 USD), 18 USD (2,001–7,500 USD) or 0.25% (above 7,500 USD), plus 18% GST, 0% FX markup and automated FIRA after invoice upload."],
    limits: ["Online tiers publish up to 25,000 USD per invoice (RBI PA-CB statutory cap ₹25 lakh/transaction); enterprise volumes above 25,000 USD use custom pricing."],
    tax: ["18% GST applies on PayGlocal’s fee."],
  }),
  winvesta: entry("Winvesta · Global Collections charges", "https://www.winvesta.in/faqs/global-collections-account/what-are-the-charges-for-the-global-collections-account", {
    fees: ["Standard USD tier (up to 2,000 USD/month): 3 USD + 0.99% (+ 18% GST on non-JPMC accounts); higher volumes use custom tiers down toward 0.20%, with 0% FX markup and free e-FIRA."],
    limits: [
      "No minimum balance and no upper cap on incoming collections (local clearing caps and RBI PA-CB rules still apply).",
      "Direct outgoing payouts are not permitted (INR withdrawal only), and funds must be repatriated within 9 months under FEMA.",
    ],
    tax: ["18% GST applies on non-JPMC account fees; JPMC account fees follow separate terms."],
  }),
  xflow: entry("Xflow · Pricing & compliance", "https://www.xflowpay.com/pricing", {
    fees: ["Starter: 12 USD up to 2,000 USD, then 0.60%. Growth: 20 USD up to 5,000 USD, then 0.40%. Scale (10,000 USD+ invoices): custom pricing. Percentage fee is applied via FX markup."],
    limits: ["Xflow publishes no upper transaction limit and explicitly supports single export invoices above 10,000 USD (and 500,000 USD+) without splitting."],
    tax: ["Xflow US does not bill Indian GST directly; check Xflow’s compliance FAQ regarding Reverse Charge Mechanism (RCM) GST on flat fees."],
    extraSources: [src("Xflow · Compliance FAQ", "https://www.xflowpay.com/blog/faqs-on-xflow-compliance")],
  }),
  payzoll: entry("PayZoll · Pricing & FAQ", "https://payzoll.finance/payzoll-vs-skydo", {
    fees: ["Published export collection fee: 10 USD flat below 1,000 USD, or 1.00% at 1,000 USD and above; corridor, partner-bank or GST charges can still apply."],
    limits: ["No static public min/max published; limits are set dynamically by KYC tier, account type and regulated banking partners inside the dashboard."],
    extraSources: [src("PayZoll · Account FAQ", "https://payzoll.finance/docs/faq/account")],
  }),
  dashx: entry("DashX · Pricing", "https://dashx.xyz/pricing", {
    fees: ["0.35% flat fee on fiat and USDC/USDT collections, 0% FX markup (mid-market), no GST added and free eFIRA on fiat receipts."],
    limits: ["No fixed numeric transaction cap published; governed by RBI/FEMA and AD Category-I partner-bank compliance limits."],
    tax: ["DashX states no GST is added on top of its 0.35% flat fee."],
  }),
  briskpe: entry("BRISKPE · Pricing", "https://www.briskpe.com/", {
    fees: ["16 USD (up to 2,000 USD), 25 USD (2,001–10,000 USD) or 0.25% (10,001–50,000 USD), plus applicable GST, with 0% FX markup and free e-FIRA; custom above 50,000 USD."],
    limits: ["Single export transactions are capped at ₹25 lakh equivalent under RBI PA-CB guidelines; published slabs apply up to 50,000 USD."],
    tax: ["Applicable GST (18%) is added to BRISKPE’s fee."],
  }),
  karbon: entry("Karbon · Inward remittance charges", "https://www.karboncard.com/faqs/what-are-the-charges-for-receving-an-inward-remittance", {
    fees: ["Fees depend on sender country, currency and payment rail (quoted per account; automated FIRA included)."],
    limits: ["No overall cumulative ceiling, though Karbon’s guide cites a 10,000 USD per-transaction cap under RBI’s OPGSP framework."],
  }),
  cashfree: entry("Cashfree · Global Collections", "https://cashfree.com/docs/payments/international-payments/global-collections/introduction", {
    fees: ["Global Collections bank-transfer pricing and FX are quoted per merchant account (separate from domestic gateway card fees)."],
    limits: ["Global Collections documentation specifies up to 10,000 USD per invoice/transaction across 17+ currencies, with RBI PA-CB capped at ₹25 lakh per transaction."],
  }),
  pingpong: entry("PingPong India · Charging standard", "https://in.pingpongx.com/manage-your-account/what-is-the-charging-standard", {
    fees: ["Free account opening and receiving; 1.00% standard withdrawal/supplier payment fee (regional rates vary) plus FX conversion margin."],
    limits: ["No universal platform withdrawal cap or minimum balance published; bounded by source marketplace, payment rail and RBI PA-CB ₹25 lakh rules."],
  }),
  razorpay: entry("Razorpay · MoneySaver Export Account", "https://razorpay.com/accept-international-payments/money-saver/", {
    fees: ["MoneySaver international bank transfers: ₹1,000 flat below ₹100,000, or 1.00% at ₹100,000 and above, plus 18% GST, with zero FX markup advertised and digital FIRC within 24 hours."],
    limits: ["Per-transaction international limits are account-specific (upgradable with sample invoices in Dashboard) up to the RBI PA-CB ceiling of ₹25 lakh per transaction."],
    tax: ["18% GST applies on Razorpay’s fee."],
  }),
  refrens: entry("Refrens · Receive international payments", "https://www.refrens.com/receive-international-payments-india", {
    fees: ["Bank/ACH/wire collections: up to 1.50%, capped at 60 USD, taxes included (separate FX conversion cost applies; card fees differ)."],
    limits: ["No standalone platform cap published; governed by the underlying payment rail, partner gateway and RBI/FEMA limits."],
    tax: ["Published bank/ACH/wire fee of up to 1.50% (max 60 USD) is stated as tax-inclusive."],
  }),
  salt: entry("Salt · International payments", "https://www.salt.pe/international-payments", {
    fees: ["Flat 1.75% fee (published as GST included), 0% FX markup advertised, zero subscription fee and free FIRA/FIRC within 24 hours."],
    limits: ["No fixed numeric transfer cap published; governed by entity type and RBI/FEMA inward remittance guidelines."],
    tax: ["Salt states GST is included in its flat 1.75% fee."],
  }),
  eximpe: entry("EximPe · Cross-border payments", "https://eximpe.com", {
    fees: ["Published pricing around 0.75% + 0.50 USD (varies by export/import volume), with transparent/near-market FX and automated e-FIRA."],
    limits: ["Governed by RBI PA-CB authorisation cap of ₹25 lakh per unit/transaction."],
  }),
  "toucan-payments": entry("Toucan Payments · CrossStream", "https://toucanpay.in", {
    fees: ["CrossStream export collections: flat 24 USD up to 3,000 USD, flat 25 USD for 3,000–12,000 USD, and 0.25% above 12,000 USD with automated e-FIRA (international cards start at 2.99%)."],
    limits: ["Governed by RBI PA-CB and AD-I partner bank rules (₹25 lakh PA-CB ceiling for online rails)."],
  }),
  hiwipay: entry("HiWiPay · EXIM & student remittances", "https://hiwipay.com", {
    fees: ["Mid-market-linked FX rates; outward student fees displayed upfront (promotional ₹0–₹1,000); EXIM export collection fees quoted per account with automated FIRA/e-BRC."],
    limits: ["Outward student remittances are capped by RBI’s LRS limit of 250,000 USD per financial year."],
    tax: ["Statutory Indian LRS TCS applies on outward transfers above the exemption threshold."],
  }),
  hopremit: entry("HOPRemit · Outward LRS", "https://moneyhop.co", {
    fees: ["Near-zero FX markup (~0.25% cited) plus an upfront flat transfer fee (around ₹1,200 depending on corridor/partner)."],
    limits: ["Outward personal/student transfers from India follow the RBI LRS cap of 250,000 USD per financial year."],
    tax: ["Indian LRS TCS slabs apply based on transfer purpose and annual threshold."],
  }),
  bookmyforex: entry("BookMyForex · Money transfer", "https://www.bookmyforex.com/money-transfer/", {
    fees: ["Live interbank rate with online rate locking; published guide cites ~₹320 + GST bank transfer fee plus ₹1,000–₹1,500 Nostro charges depending on currency/bank."],
    limits: ["Outward wire transfers follow the RBI LRS cap of 250,000 USD per financial year."],
    tax: ["18% GST on bank fees, slab-based FX conversion GST, and statutory Indian LRS TCS above ₹10 lakh/FY."],
  }),
  copperx: entry("Copperx Payouts", "https://copperx.io", {
    fees: ["Stablecoin-to-fiat payouts around 0.50% (for 50,000 USD+/month volumes; custom tiers available); Indian FIRC available at 9 USD per certificate."],
    limits: ["No fixed stablecoin volume cap advertised; fiat off-ramp rails follow banking partner and local compliance limits."],
  }),
  transfi: entry("TransFi · Cross-border rails", "https://www.transfi.com", {
    fees: ["Checkout baseline 0.50%–1.00% and custom enterprise pricing; live FX returned via dashboard/API."],
    limits: ["Dynamic by KYC tier and rail; merchant bank settlement minimum threshold is 3,000 USD."],
  }),
  // --- UAE & GCC ---
  "careem-pay": entry("Careem Pay · Send money FAQs", "https://www.careem.com/en-AE/send-money-faqs/", {
    fees: ["First two UAE→India transfers free, then 5 AED below 1,000 AED; Careem Plus members get zero transfer fees and exclusive rates (final fee and FX shown in-app)."],
    limits: ["Careem Pay help states a standard limit of 10,000 AED per transaction/day on standard corridors."],
  }),
  "al-ansari-exchange": entry("Al Ansari Exchange · Remittances", "https://alansariexchange.com/service/remittances/", {
    fees: ["Key Fact Statement lists 0 to 25.24 AED + 5% VAT for bank transfers to India, Pakistan, Sri Lanka, Bangladesh and Nepal; correspondent bank charges may apply on other corridors."],
    limits: ["Limits depend on profile verification level, funding method and UAE AML source-of-funds documentation."],
    tax: ["5% UAE VAT applies on Al Ansari Exchange’s remittance service fee."],
  }),
  "lulu-exchange": entry("LuLu Exchange · UAE money transfer", "https://luluexchange.com/services/money-transfer/", {
    fees: ["2025 UAE Rate Board lists 19.50 AED and 26.50 AED (including 5% VAT) across India INR bank-transfer brackets; promotional zero-fee offers periodically apply."],
    tax: ["Published 19.50 AED and 26.50 AED India bank-transfer brackets include 5% UAE VAT."],
  }),
  botim: entry("Botim Money · International transfers", "https://botim.me/international-transfer/", {
    fees: ["First eligible UAE→India transfer advertised at zero fee; subsequent transfers vary by amount, funding and payout method (typical range 4.99–15 AED) plus FX rate in-app."],
    limits: ["Transfer limits depend on KYC tier and corridor in-app; PayBy wallet balance caps around 20,000–25,000 AED."],
  }),
  "eand-money": entry("e& money · Send abroad", "https://www.eandmoney.com/en/send-abroad.html", {
    fees: ["Standard international transfer fee of 15 AED + 5% VAT (15.75 AED total) on public AED→INR examples; live FX and promotional waivers shown in-app."],
    limits: ["Max wallet balance 25,000 AED; single, daily and monthly international transfer limit 25,000 AED; max 5 transfers/day and 30 transfers/month."],
    tax: ["5% UAE VAT applies on the 15 AED transfer fee (15.75 AED total)."],
  }),
  wio: entry("Wio Bank · Fees & limits", "https://wio.io/pay-and-get-paid", {
    fees: ["Wio Business outbound foreign-currency SWIFT costs 52.50 AED (Essential plan) or 26.25 AED (Grow plan), before correspondent bank charges (OUR/SHA supported)."],
    limits: [
      "Wio Personal daily local + international transfer limit defaults up to 300,000 AED/day.",
      "Wio Business defaults to 750,000 AED/day (customizable up to 5,000,000 AED/day). New beneficiaries face a 12-hour (facial) or 24-hour (SMS OTP) cooling-off wait.",
    ],
    extraSources: [src("Wio Business · Limits", "https://desk.wio.io/support/solutions/articles/501000414617-wio-business-managing-transfers-beneficiaries-limits-payment-tracking-troubleshooting")],
  }),
  hubpay: entry("Hubpay · UAE SME payments", "https://hubpay.io", {
    fees: ["Zero minimum balance; Starter plan around 99 AED/month; flat international transfer fee around 26–50 AED + VAT depending on tier, plus institutional FX."],
    limits: ["High-volume SME and treasury limits set per KYB profile and tier."],
    tax: ["5% UAE VAT applies on domestic transfer service fees."],
  }),
  "stc-bank": entry("STC Bank · International transfers", "https://stcbank.com.sa", {
    fees: ["Western Union schedule (excl. 15% VAT): Pakistan free at 375 SAR+ (else 15 SAR); 15 SAR to IN, BD, PH, EG, NP, LK, ID, VN; 20 SAR to GCC/TR/CN/KE/ET/MA; 25 SAR rest of world + FX margin."],
    tax: ["15% Saudi VAT applies on the base remittance transfer fee."],
  }),
  "ooredoo-money": entry("Ooredoo Money Qatar", "https://www.ooredoo.qa", {
    fees: ["International transfer fees start from 20 QAR depending on partner (MoneyGram, Western Union, Thunes, local exchanges) and corridor, plus partner FX rate."],
    limits: ["Full Wallet limits: 25,000 QAR daily transfer/payment, 100,000 QAR monthly transfer/deposit and 30,000 QAR max wallet balance."],
  }),
  "beyon-money": entry("Beyon Money Bahrain", "https://www.beyonmoney.com", {
    fees: ["Dynamic per-corridor fee and rate previewed in-app, plus optional weekly unlimited-transfer bundles for select corridors."],
    limits: ["Published limits: 2,000 BHD daily, 5,000 BHD monthly and up to 10 international transactions per month."],
  }),
  "al-mulla-exchange": entry("Al Mulla Exchange Kuwait", "https://www.almullaexchange.com", {
    fees: ["Corridor- and method-dependent flat fee (around 1.250 KWD standard bank transfer to India) plus offered exchange rate."],
    limits: ["First transfer to a newly added beneficiary is capped at 1,000 KWD; regular remittance ceilings follow Central Bank of Kuwait AML tiers."],
  }),
  "al-muzaini": entry("Al Muzaini Exchange Kuwait", "https://www.muzaini.com", {
    limits: ["Central Bank of Kuwait cash cap is 3,000 KWD per transaction; amounts above 3,000 KWD require K-NET, local bank transfer or cheque."],
  }),
  walletii: entry("walletii by Ooredoo Oman", "https://www.walletii.om", {
    fees: ["Pakistan free via PRI Global at 78 OMR+; Group 2 (AE, SA, TR, EG, UK, etc.) 1.000 OMR + VAT; Group 3 (IN, BD, PH, LK, NP, ID, etc.) 2.000 OMR + VAT."],
    limits: ["Single and daily international remittance cap 1,000 OMR; monthly total outgoing cap 15,000 OMR; max wallet balance 1,000 OMR."],
    tax: ["5% Oman VAT applies on remittance transfer fees."],
  }),
  // --- South Asia & MENA Underdogs ---
  "elevate-pay": entry("Elevate Pay · Pricing", "https://www.elevatepay.co", {
    fees: ["Zero setup and monthly fee; free incoming US ACH from platforms; ~1.50 USD SEPA/PHP outbound fee plus competitive spot FX."],
    limits: ["SEPA outbound capped at 5,000 USD per transfer/day and 20,000 USD per month; local currency payout limits vary by country and KYC tier."],
  }),
  nsave: entry("nSave · Pricing", "https://www.nsave.com", {
    fees: ["Personal Essential 0 USD/month with free incoming USD ACH, EUR SEPA and GBP FPS; Business accounts carry a 200 USD one-time compliance application fee."],
    limits: ["Limits are assigned dynamically in-app by plan tier, residence country and risk profile."],
  }),
  "priyo-pay": entry("Priyo Pay · Fee schedule", "https://pay.priyo.com", {
    fees: ["0 USD/month; free incoming US ACH; 15 USD incoming domestic wire; 1.00% (min 0.99 USD) currency conversion to BDT/other currencies."],
    tax: ["Priyo Pay notes Bangladesh freelancers withdrawing service earnings are not eligible for the 2.5% Wage Earner Remittance cash incentive."],
  }),
  cenoa: entry("Cenoa · Pricing", "https://www.cenoa.com", {
    fees: ["0 USD opening/monthly fee; blended receiving and conversion fees typically 0.50%–1.00% (~0.99% cited, with periodic zero-fee promos)."],
  }),
  uption: entry("UPTION · Fees", "https://www.uption.com.tr", {
    fees: ["Free account opening and European SEPA IBAN; 1 EUR SEPA transfer, 1 GBP UK transfer; 19.90 TRY/month inactivity fee only after 6 inactive months with positive balance."],
  }),
  ruul: entry("Ruul · Pricing", "https://ruul.io", {
    fees: ["0 USD setup/monthly; 5.00% flat invoicing/payout commission (negotiable to 4.25%–4.50% around 25,000 USD/mo); optional +1.50% USDC payout or +3.50% Early Pay."],
  }),
  clearshift: entry("Clearshift · Pricing", "https://www.clearshiftinc.com", {
    fees: ["0% FX markup using official Bank of Israel/BFIX or ECB benchmark rates; individual fee is 0.59% or 180 ILS (whichever is higher), VAT included."],
    limits: ["Individual transfers are restricted to same-owner bank accounts abroad; no low retail cap published."],
    tax: ["Individual 0.59% (min 180 ILS) fee is published as VAT-inclusive."],
  }),
  "covercy-pay": entry("Covercy Pay · Pricing", "https://www.covercypay.com", {
    fees: ["Flat transfer fee (5 GBP, 9 EUR, 15 USD or 39 ILS) plus a 0.40%–1.00% FX markup locked for 60 seconds."],
    limits: ["Published minimums: 1,200 GBP, 1,400 EUR, 1,500 USD or 5,500 ILS per transfer."],
  }),
  // --- Europe, UK, CH, NA & Oceania ---
  "atlantic-money": entry("Atlantic Money · Fees & limits", "https://support.atlantic.money/", {
    fees: ["Flat 3 GBP (from UK) or 3 EUR (from EEA) per standard transfer at 0% FX markup (live mid-market rate). Optional express delivery costs extra."],
    limits: [
      "Up to 1,000,000 GBP or 1,000,000 EUR per transfer (USD/PLN 1M, CAD 200k).",
      "Rolling KYC tier caps: Getting Started 850/30d & 2,500/180d; Plus 30,000/30d & 80,000/180d; Advanced custom up to 1M.",
    ],
  }),
  transfergo: entry("TransferGo · Pricing & limits", "https://www.transfergo.com/en/pricing", {
    fees: ["Bank transfers start from 0.20% (often zero on select corridors) plus a variable FX markup (~0.50%–1.50% depending on speed and route)."],
    limits: ["No maximum sending limit on bank transfers (subject to your bank); card payments cap at 10,000 GBP (or equivalent) per transaction."],
    extraSources: [src("TransferGo · Sending limits", "https://support.transfergo.com/hc/en-gb/articles/4410787383058-Sending-limits")],
  }),
  orbitremit: entry("OrbitRemit · Pricing", "https://support.orbitremit.com/hc/en-us/articles/360015525917-How-much-does-it-cost-to-make-a-transfer", {
    fees: ["First transfer typically fee-free; standard flat fee 0–4 AUD/NZD (0 fee on transfers of 10,000 AUD/NZD or more and on select APAC corridors) plus upfront locked FX rate with no weekend surcharge."],
    limits: ["No maximum OrbitRemit bank-transfer cap from Australia or New Zealand (amounts above 10,000 AUD/NZD require source-of-funds checks; wallet/cash-pickup caps apply)."],
  }),
  profee: entry("Profee · Pricing & tiers", "https://www.profee.com", {
    fees: ["0% transfer fee on first transfer; subsequent corridor fees vary with ~0.50% standard FX markup (EEA card top-ups from ~1.75% + fixed fee)."],
    limits: ["Account tiers: Basic 1,000 EUR total; Plus 30,000 EUR/year (ID + residency); Premium 100,000 EUR/year (source of wealth)."],
  }),
  remitbee: entry("RemitBee · Fees & limits", "https://www.remitbee.com/our-fees", {
    fees: ["0 CAD fee on transfers of 500 CAD or more via EFT, Interac e-Transfer, Bill Pay or Balance (2.99 CAD below 500 CAD; debit card 2.99–8.99+ CAD), plus 0.30%–0.80% FX spread."],
    limits: [
      "Personal daily / monthly caps: L1 1k/3k CAD, L2 3k/25k CAD, L3 9k/60k CAD, L4 20k/200k CAD.",
      "Business accounts: up to 250,000 CAD/day and 1,000,000 CAD/month.",
    ],
    extraSources: [src("RemitBee · Limits", "https://www.remitbee.com/help/the-limits-and-restrictions-when-sending-money-abroad")],
  }),
  "sling-money": entry("Morse (formerly Sling Money) · Help", "https://help.morsemoney.com", {
    fees: ["Free P2P and local add-money; 0.10% fee on incoming virtual-account bank deposits; 0% FX markup on Morse Visa debit card spend (emerging mobile-money rails up to 4%)."],
    limits: ["USD virtual-account deposits up to 100,000 USD per deposit; virtual card 2,000 USD/day for first 30 days then 5,000 USD/day."],
  }),
  sokin: entry("Sokin · Pricing", "https://sokin.com/pricing", {
    fees: ["0 GBP/month; Sokin Direct free; UK local 1 GBP, SEPA Instant 1 EUR, CA 2 CAD, AU 2 AUD, SWIFT up to 10 units; FX markup from 0.30% major / 0.80% minor."],
    limits: ["No hard public transfer cap (assigned post-KYB); bulk payment uploads support up to 5,000 rows per batch."],
  }),
  verto: entry("Verto · Pricing", "https://www.verto.co/pricing", {
    fees: ["0 USD/month; 0 USD local-rail payouts; wholesale/near-mid-market FX via marketplace or 24-hour rate lock."],
    limits: ["No preset system transfer cap (tailored per business KYB profile); corporate card programs scale up to 500,000 USD/month."],
  }),
  currencyfair: entry("CurrencyFair · Pricing", "https://www.currencyfair.com/pricing/", {
    fees: ["Flat transfer-out fee of 3 EUR (2.50 GBP / 5 USD equivalent) plus an average FX margin around 0.53% above interbank."],
    limits: ["Dynamic by verification level and corridor; supports high-value property and business transfers with no low fixed cap."],
  }),
  "b-sharpe": entry("b-sharpe · Fees", "https://www.b-sharpe.com/en/compare-b-sharpe-fees/", {
    fees: ["0 CHF/month and no separate transfer fee; FX spread starts from 0.12% integrated into the exchange rate."],
    limits: ["No minimum and no structural maximum transfer limit (large transfers may require AML source-of-funds checks)."],
  }),
  alpian: entry("Alpian · Pricing", "https://www.alpian.com", {
    fees: ["0 CHF base account; 0.20% weekday FX fee (0.50% weekend) across CHF, EUR, USD and GBP, with free EUR SEPA transfers."],
  }),
  venn: entry("Venn · Pricing", "https://www.venn.ca/pricing", {
    fees: ["Plans: Essentials 0 CAD/mo (0.25%–0.45% FX), Plus 40 CAD/mo (0.35% FX), Pro 100 CAD/mo (0.25% FX). Free EFT/ACH/SEPA/FPS/Interac; SWIFT 6–10 CAD."],
  }),
  loop: entry("Loop Financial · Pricing", "https://support.bankonloop.com/collection/plans-and-pricing", {
    fees: ["Plans: Basic 0 CAD/mo, Plus 79 CAD/mo, Power 299 CAD/mo; FX markup 0.10%–0.50% over interbank (0% when spending from matched currency balance)."],
    limits: ["No maximum cap on incoming receivables; outgoing limits scale with verification and corporate profile."],
  }),
  "knightsbridge-fx": entry("Knightsbridge FX", "https://www.knightsbridgefx.com", {
    fees: ["0 CAD transfer and wire fees; cost is built into a tight CAD↔USD FX spread."],
    limits: ["2,000 CAD minimum per exchange; up to 40,000,000 CAD/year."],
  }),
  "flash-payments": entry("Flash Payments", "https://www.flash-payments.com", {
    fees: ["0 AUD transaction fee; cost is built into an upfront FX margin shown before confirmation."],
    limits: ["No preset minimum or maximum transfer caps."],
  }),
  bcremit: entry("BCRemit", "https://www.bcremit.com", {
    fees: ["First transfer typically free; standard bank/e-wallet fee around 2.99 GBP/USD and cash pickup around 3.99 GBP/USD, plus offered PHP exchange rate."],
  }),
  // --- APAC ---
  currenxie: entry("Currenxie · Pricing", "https://www.currenxie.com/en/pricing", {
    fees: ["0 USD/month; 8 USD one-time virtual account setup; incoming local 0.75 USD, outgoing local 3 USD, SWIFT 8 USD; FX from 0.10% (USD/HKD), 0.35% major and 0.50% INR/PHP/IDR/THB/VND."],
    limits: ["No hard transaction caps on incoming or outgoing business transfers (subject to compliance monitoring)."],
  }),
  statrys: entry("Statrys · Pricing", "https://statrys.com/pricing", {
    fees: ["0 monthly fee (HK accounts incur 88 HKD/month inactivity fee if under 5 qualifying outgoing payments); FX from 0.10% major currencies / 0.15% Asian currencies; SWIFT ~85 HKD / 20 SGD."],
    limits: ["No minimum initial deposit and no hard maximum transaction cap (large trades may require invoices/shipping docs)."],
  }),
  worldfirst: entry("WorldFirst · Pricing", "https://www.worldfirst.com/uk/pricing/", {
    fees: ["Free account opening, maintenance and marketplace receiving; FX markup capped at 0.50% on major pairs (0.30% intro promo); outbound fees vary by rail (~0.27–23 GBP)."],
    limits: ["No low fixed public transaction cap; high-volume B2B limits scale with business turnover and verification."],
  }),
  tazapay: entry("Tazapay · Transaction fees", "https://support.tazapay.com/transaction-fees", {
    fees: ["Local outbound payouts 2–5 USD; SWIFT outbound 5–35 USD; settlements 5 USD (<1,000 USD) or 0 USD (1,000 USD+); India FIRC ~4 USD; negotiated corridor FX spread."],
    limits: ["No global daily limit imposed by Tazapay; per-transaction caps depend on corridor, payment method and merchant tier."],
  }),
  straitsx: entry("StraitsX · Fee schedule", "https://support.straitsx.com/support/solutions/articles/157000365665-straitsx-personal-account-transaction-fee-schedule", {
    fees: ["Free SGD FAST and USD bank deposits/minting; XSGD withdrawal free (personal) or 1 SGD (business); personal USD bank withdrawal 40 USD."],
    limits: ["Minimum 10 SGD (XSGD) or 10 USD (XUSD); maximums follow your Singapore bank’s FAST limit and verification tier."],
  }),
  aspire: entry("Aspire · Pricing", "https://aspireapp.com", {
    fees: ["Basic 0 SGD/month (FX from ~0.46%); Premium 15 SGD/month includes 0% FX on the first 13,000 SGD/month and 5 free international transfers/month."],
  }),
  "coins-ph": entry("Coins.ph · Fees", "https://coins.ph", {
    fees: ["Coins Pro trading fees 0.05%–0.15% (periodic 0% USDT/USDC–PHP promos); PESONet bank payouts 0 PHP (personal) / 5 PHP (business); InstaPay 5–10 PHP."],
  }),
  flip: entry("Flip Globe", "https://flip.id", {
    fees: ["Powered by Wise Platform: real mid-market exchange rate with zero hidden FX markup; upfront transfer fees start from 20,000 IDR (first transfer often free)."],
    limits: ["Daily outbound cap up to 500,000,000 IDR (personal) and 10,000,000,000 IDR (Flip for Business)."],
  }),
  topremit: entry("Topremit", "https://topremit.com", {
    fees: ["Bank Indonesia licensed flat-fee transfers starting around 75,000 IDR on common international corridors, plus live rate shown upfront."],
  }),
  "sunway-money": entry("Sunway Money", "https://sunwaymoney.com", {
    fees: ["Flat 8 MYR standard remittance fee across 60+ countries (promotional 1 MYR fees on qualifying JPY/THB bands), plus live exchange rate."],
  }),
  pandaremit: entry("PandaRemit", "https://www.pandaremit.com", {
    fees: ["Corridor flat fees (e.g. ~5.99 AUD from Australia, ~9.99 SGD from Singapore; first transfer often fee-free) plus exchange rate shown upfront."],
  }),
  sentbe: entry("SentBe", "https://www.sentbe.com", {
    fees: ["Base South Korea outbound transfer fee around 5,000 KRW plus corridor FX spread shown before sending."],
    limits: ["South Korea statutory small-sum overseas remittance caps: 5,000 USD per transfer, 50,000 USD/year for foreign residents and 100,000 USD/year for Korean nationals."],
  }),
  wirebarley: entry("WireBarley", "https://www.wirebarley.com", {
    fees: ["Corridor- and method-dependent flat fees (US Business 0 USD at 5,000 USD+ / 4.99 USD below 5,000 USD; KR SWIFT 15,000 KRW below 5M KRW) plus offered FX rate."],
  }),
  deemoney: entry("DeeMoney Thailand", "https://www.deemoney.com", {
    fees: ["Personal outbound flat fee 125 THB + 7% VAT (133.75 THB; up to 150 THB on select routes); DeeBusiness 449 THB + 7% VAT."],
    tax: ["7% Thailand VAT applies on DeeMoney’s transfer fee."],
  }),
  // --- Africa ---
  nala: entry("NALA · US Terms", "https://www.nala.com/terms-of-service-usa", {
    fees: ["Corridor-dependent upfront fee (often zero above threshold promos such as >20 GBP in the UK) plus FX margin displayed before confirming."],
    limits: ["Up to 5,000 USD / 5,000 GBP / 5,000 EUR daily send limit (regional rolling caps e.g. 15,000 EUR/30d in EU, 200,000 GBP/year in UK); exact limits shown in-app."],
  }),
  flutterwave: entry("Flutterwave · Transfers & payouts pricing", "https://flutterwave.com/ng/support/pricing/pricing-for-transfers-and-payouts", {
    fees: ["Business local payouts follow country-specific rail tariffs (e.g. Ghana bank 10 GHS, mobile money 1.50%); Send App consumer transfers show corridor flat/promo fees plus FX margin upfront."],
    limits: ["Send App verified tiers reach up to 20,000 USD upper cap (subject to local wallet caps); Business API limits depend on merchant KYB tier."],
  }),
  "yellow-card": entry("Yellow Card · B2B API", "https://help.yellowcard.io/articles/8999093541-api-documentation", {
    fees: ["B2B only (retail app shut down Dec 31, 2025). Zero API setup fee; per-corridor collection, payout and stablecoin/FX pricing is custom-quoted via API."],
  }),
  raenest: entry("Raenest · Fees & limits", "https://help.raenest.com", {
    fees: ["USD ACH deposits 2 USD (<500 USD) / 4 USD (500 USD+); USD Wire 12 USD; USDT/USDC 1 USD (2 USD TRON); EUR/GBP 0.80% (min 3, max 10); conversion ~0.70% capped at 2.70 USD; local NGN payout free."],
    limits: ["Daily inflow / outflow caps by KYC tier: L1 10k/1.6k USD, L2 10k/2.8k, L3 10k/4k, L4 10k/8k, L5 20k/16k, L6 50k/40k USD; card spend up to 20,000 USD/day and 60,000 USD/month."],
  }),
  grey: entry("Grey · Fees & limits", "https://support.grey.co", {
    fees: ["0 USD monthly fee. Personal deposits: USD ACH/FedNow, EUR SEPA and GBP FPS 0.80% (min 2, max 10); USD Wire 20 USD; USDC BEP-20/Solana free. Business ACH 2 USD flat, Wire 15 USD."],
    limits: ["Personal limits are tiered in-app by country and KYC level; Grey Business supports up to 100,000 USD/transfer, 100,000 USD/day and 1,000,000 USD/month."],
  }),
  cleva: entry("Cleva · Pricing", "https://www.getcleva.com/pricing", {
    fees: ["0 USD monthly fee, 0 USD Upwork deposits and 0% FX conversion markup; USD ACH/FedNow 0.80% (min 2 USD, max 5 USD); Wire 10 USD; USDT/USDC 2 USD; GBP/EUR 0.80% (min 2, max 10)."],
    limits: [
      "Individual outbound cap: 3,000 USD per transfer; Tier 1 5k/day & 12k/month, Tier 2 8k/day & 20k/month, Tier 3 10k/day & 50k/month (Kenya is explicitly excluded).",
    ],
  }),
  afriex: entry("Afriex · Pricing", "https://www.afriex.com", {
    fees: ["Many standard transfers carry zero fee; a 1 USD flat fee applies on UK/EU-originated transfers and select US debit-card funding, plus live market FX rate."],
    limits: ["Standard verified personal daily limit is typically around 3,000 USD (higher limits available on request)."],
  }),
  eversend: entry("Eversend · Pricing", "https://eversend.co/pricing", {
    fees: ["FX conversion margin starts from 0.90%; outbound USD/EUR/GBP bank transfers 0.49% + flat (0.49 USD ACH, 0.99 EUR/GBP, 10 USD wire); local African payouts carry small flat rail fees."],
    limits: ["Virtual bank accounts carry a 50,000 USD / 50,000 EUR monthly transaction limit (higher via compliance review); virtual cards cap at 2,500 USD per transaction."],
  }),
  shyft: entry("Shyft · Fees", "https://www.shyft.co.za/fees", {
    fees: ["0 ZAR monthly fee (open to clients of any South African bank); outward SWIFT 14 USD / 10 GBP / 12 EUR / 18 AUD (lower to Standard Bank offshore); FX spread ~0.50%–0.60%."],
    limits: [
      "Per-transfer outward SWIFT caps: 75,000 USD, 55,000 GBP, 60,000 EUR or 90,000 AUD.",
      "South African annual exchange-control caps: 1,000,000 ZAR Single Discretionary Allowance (SDA) or up to 10,000,000 ZAR Foreign Investment Allowance (FIA) with SARS clearance.",
    ],
  }),
  futureforex: entry("Future Forex · FAQs", "https://futureforex.co.za/faqs", {
    fees: ["Transparent volume-tiered FX spread disclosed upfront (typically 30%–50% below traditional SA banks), with free SARS AIT tax clearance handling included."],
    limits: ["Minimum transfer typically 100,000 ZAR; annual personal allowances follow South African Reserve Bank SDA/FIA rules."],
  }),
  "mama-money": entry("Mama Money · FAQ & limits", "https://www.mamamoney.co.za/blog-posts/mama-money-limits-how-much-you-can-send", {
    fees: ["International transfer fees up to 5% or less (as low as 1% on select corridors) plus live exchange rate shown before sending."],
    limits: ["Standard: 25,000 ZAR/day and 25,000 ZAR/month. Upgraded SA ID: 50,000 ZAR/day and 100,000 ZAR/month. Upgraded non-SA ID: 25,000 ZAR/day and up to 75% of verified monthly income."],
  }),
  // --- LatAm ---
  global66: entry("Global66", "https://www.global66.com/enviar-dinero/MX/US/", {
    fees: ["0 monthly fee and free Global66-to-Global66 P2P; international transfers combine a volume-tiered FX spread and corridor fee shown upfront; Smart Card non-held FX ~2%."],
    limits: ["Up to 500,000 USD equivalent per transfer in Chile, Colombia, Peru and Mexico (~30,000 USD in Argentina); volumes over 20,000 USD trigger Source of Funds review."],
  }),
  arq: entry("ARQ · Costs & fees", "https://www.arqfinance.com/en-MX/help/articles/arq-costs-and-fees-mexico", {
    fees: ["Free local rails (SPEI, Pix, CO/AR bank transfers); standard US ACH route 3 USDc, EUR SEPA route 3 EURc, US Wire ~10 USD (waived on qualifying paid plans), plus in-app USDc/local FX rate."],
    limits: ["Limits are assigned dynamically in-app by country, verification level and risk profile."],
  }),
  "felix-pago": entry("Félix Pago", "https://www.felixpago.com", {
    fees: ["First transfer typically 0 USD promo; standard bank-deposit fee typically 2.99 USD flat plus exchange-rate markup shown in WhatsApp before confirmation."],
    limits: ["Mandatory photo ID verification at 3,000 USD or more; federal CTR reporting at 10,000 USD/day; bill payments capped around 200 USD per bill."],
  }),
  bitso: entry("Bitso · Fees", "https://bitso.com/fees", {
    fees: ["Volume-tiered maker/taker exchange fees; MXN SPEI deposits and withdrawals are free; crypto withdrawal fees depend on blockchain network; Bitso Business FX uses custom terms."],
    limits: ["Monthly fiat and crypto deposit/withdrawal limits depend on country (MX, AR, CO) and KYC tier (Levels 1–3) shown in-app."],
  }),
  blindpay: entry("BlindPay · Pricing & limits", "https://blindpay.com/pricing", {
    fees: ["Monthly platform subscription plans plus per-transaction rail fees and FX spread locked for 5 minutes via live API quotes."],
    limits: ["Default per-tier caps: KYC Standard 10,000 USD/tx; KYC Enhanced 50,000 USD/tx & 500,000 USD/month; KYB Standard 30,000 USD/tx (higher with documentation)."],
    extraSources: [src("BlindPay · Compliance & limits", "https://docs.blindpay.com/docs/compliance-faq-kyc-kyb-limits-and-rfis")],
  }),
  "mural-pay": entry("Mural Pay · Payout fees", "https://developers.muralpay.com/docs/get-payout-fees", {
    fees: ["Quote-driven via payout simulation API (~0.40% baseline configurable exchange fee plus custom partner/rail payout fees)."],
    limits: ["Custom-assigned per organization during sales-gated KYB onboarding."],
  }),
  dlocal: entry("dLocal Go · Costs", "https://helpcenter.dlocalgo.com/en/articles/7229153-what-costs-do-i-have", {
    fees: ["0 USD setup/monthly on dLocal Go; per-country merchant processing fees vary by local rail; settlement withdrawal 0 USD at 10 USD+ (1 USD below 10 USD). Enterprise payouts are custom."],
    limits: ["Governed by local central bank and payment-method caps (Pix, SPEI, PSE, OXXO, Rapipago) plus compliance checks."],
  }),
  higlobe: entry("Higlobe · Pricing", "https://www.higlobe.com/pricing", {
    fees: ["0 USD account, incoming ACH and local bank withdrawal fees (incoming US Wire 20 USD). Published FX spread: 0.00% MX (SPEI) and AR, 0.20% BR (Pix), 0.60% PH."],
    limits: ["No monthly volume cap on incoming business payments or local withdrawals; single withdrawal cap is 25,000 USD (15,000 USD in PH; >10,000 USD may hold up to 24h)."],
  }),
  grabrfi: entry("GrabrFi · Full schedule of fees", "https://helpcenter.grabrfi.com/en/support/solutions/articles/103000216668-full-schedule-of-fees", {
    fees: ["0 USD monthly, incoming ACH/RTP/FedNow and incoming USDC/USDT; US Wire 15 USD in / 0.50% (15–30 USD) out; SWIFT 20 USD; local currency bank withdrawals ~2–5 USD."],
    limits: ["Local currency withdrawals: 5,000 USD/tx & daily, 20,000 USD/month, 180,000 USD/year; local top-ups 2,000 USD/day, 15,000 USD/month; card up to 5,000 USD/day."],
    extraSources: [src("GrabrFi · Limits", "https://helpcenter.grabrfi.com/en/support/solutions/folders/103000078170")],
  }),
  husky: entry("Husky · Prices", "https://help.husky.io/hc/en-us/articles/360053702513-What-are-the-prices-at-Husky", {
    fees: ["Receive-and-convert SWIFT/Wire into BRL at commercial exchange rate: flat 10 USD up to 1,000 USD, or up to 1.00% above 1,000 USD (0 monthly fee)."],
    limits: ["Baseline initial limits expand via in-app request with service contracts or trade confirmations (commonly above 100,000 BRL/year)."],
    tax: ["0% Brazilian IOF applies to eligible PJ service exports; statutory IOF applies to personal/same-holder inflows."],
  }),
  "remessa-online": entry("Remessa Online · Costs & rates", "https://ajuda.remessaonline.com.br/hc/pt-br/articles/360019629454-Entenda-os-custos-e-taxas-da-sua-transfer%C3%AAncia-internacional-com-a-Remessa-Online", {
    fees: ["Commercial exchange rate plus regressive spread: personal (PF) typically 0.70%–1.20%, business (PJ) 0.50%–1.55%; external bank tariff waived for PJ transfers of 15,000 BRL or more."],
    limits: ["PF Simple registration sets rolling caps (commonly up to 180k BRL/day & 360k BRL/year); PF Complete expands with IRPF tax return; PJ limits match company revenue."],
    tax: ["Statutory Brazilian IOF applies by nature (0% for export of services; 0.38%–1.10% on other categories); full VET shown before confirmation."],
  }),
  techfx: entry("TechFX · Rates", "https://www.techfx.com.br/taxas-de-cambio-para-receber-do-exterior/", {
    fees: ["Flat 0.50% spread over commercial USD/EUR exchange rate for Brazilian PJ service exporters, with no fixed wire fees."],
    limits: ["Flexible PJ export limits matched to documented international service contracts and revenue."],
    tax: ["0% Brazilian IOF for qualifying PJ export-of-services inflows."],
  }),
  takenos: entry("Takenos · Fees", "https://help.takenos.com/es/articles/8904589-cuanto-cuesta-usar-takenos", {
    fees: ["0 USD incoming US ACH, EU SEPA, crypto and local Pix; US Wire 25 USD, SWIFT 35 USD; local ARS bank withdrawal 0%, USDT withdrawal 1%, USD bank withdrawal 3%."],
    limits: ["Default receiving cap 10,000 USD/month across currencies (expandable in-app with proof of funds); TakeCard spend up to 20,000 USD/week."],
  }),
  wallbit: entry("Wallbit · Fees & commissions", "https://www.wallbit.io/pricing", {
    fees: ["0 USD deposits (USD, EUR, USDC/USDT, SWIFT); outgoing ACH 1% (min 5 USD), Wire 1% (min 25 USD), SEPA 0.50% (min 10 USD), USDC 1% (min 10 USD); 2 USD/month inactivity fee after 3 inactive months if balance <500 USD."],
    limits: ["Classic tier starts conservatively (~500 USD/day, 1,000 USD/month) and expands with Pro/Max plans or income verification."],
  }),
  "vita-wallet": entry("Vita Wallet · Fees", "https://vitawallet.io/blog/finanzas/conoce-mas-sobre-las-comisiones-en-vita/", {
    fees: ["0% Vita-to-Vita P2P; international bank transfers 0.40%–4.00% reflected in the quote; local bank withdrawals ~1%."],
    limits: ["Default personal monthly outbound/withdrawal cap: 5,000 USD/month in CL, CO, MX and PE, or 2,500 USD/month in Argentina (expandable with source-of-funds documents)."],
  }),
  belo: entry("Belo · Help", "https://help.belo.app/", {
    fees: ["0 monthly fee and free $belotag P2P; direct Payoneer→Belo USDC transfer carries a 4.00% flat fee; crypto withdrawals pay dynamic network gas."],
    limits: ["Payoneer→Belo capped at 5,000 USD/day and 20,000 USD/month (max 5/day, 30/month); standard crypto swaps/withdrawals up to 5,000 USDT/day and 100,000 USDT/month."],
  }),
  // --- Indian Banks ---
  "hdfc-bank": entry("HDFC Bank · RemitNow & Foreign Remittances", "https://www.hdfc.bank.in", {
    fees: ["RemitNow outward LRS: ₹500 + GST (up to 500 USD) or ₹1,000 + GST (above 500 USD), plus SWIFT charges and card/FX conversion GST; retail inward remittances carry Nil base fee (FX GST applies)."],
    limits: ["RemitNow online outward transfers: 100 USD minimum up to 25,000 USD/day; overall personal outward remittances capped at RBI’s LRS ceiling of 250,000 USD per financial year."],
    tax: ["18% GST on bank transfer fees, slab-based GST on currency conversion, and statutory Indian LRS TCS on outward transfers above the annual exemption threshold."],
    delivery: { label: "Same working day (before 2:00 PM IST)", detail: "HDFC Bank says RemitNow outward transfers submitted before 2:00 PM IST are processed the same working day; requests after 2:00 PM IST process on the next working day." },
    paperwork: ["FEMA / LRS declaration, PAN and purpose-specific proof for outward transfers; e-FIRA / FIRC available on request for inward export receipts."],
  }),
  "icici-bank": entry("ICICI Bank · Money2India & Money2World", "https://www.icici.bank.in", {
    fees: ["Money2India US→India: 0 USD fee at 1,000 USD+ (4 USD below 1,000 USD) plus FX spread. Money2World outward LRS: ₹1,000 + GST + FX conversion GST + applicable TCS."],
    limits: ["Outward LRS capped at 250,000 USD per financial year (online Money2World up to 100,000 USD/tx; NRO repatriation up to 1,000,000 USD/FY)."],
    tax: ["18% GST on transfer fees, slab-based FX GST, and statutory Indian LRS TCS on outward remittances."],
    delivery: { label: "Hours to 2 working days", detail: "ICICI Bank says Money2India inward transfers arrive in hours to 2 business days depending on rail, and Money2World outward wires settle in 1–2 working days." },
    paperwork: ["Form A2 / LRS declaration and PAN for outward transfers; inward commercial export receipts support FIRC issuance via ICICI branch/trade desk."],
  }),
  "state-bank-of-india": entry("State Bank of India · FxOut & Foreign Remittances", "https://sbi.co.in", {
    fees: ["Outward FxOut / SWIFT wire: ~₹250–₹500 + GST plus SWIFT correspondent charges; inward personal remittance handling around ₹50–₹100 + GST plus FX margin."],
    limits: ["RBI LRS cap of 250,000 USD per financial year at branches; online YONO / Internet Banking outward transfers cap at 40,000 USD per transaction and per day."],
    tax: ["18% GST on bank charges, slab-based FX conversion GST, and statutory Indian LRS TCS on outward transfers."],
    delivery: { label: "1–2 business days (inward)", detail: "SBI says inward foreign remittances typically credit within 1–2 business days once SWIFT funds and purpose details clear." },
    paperwork: ["Form A2 and PAN required for outward LRS remittances; branch/trade desk issues FIRC for inward export remittances."],
  }),
  "idfc-first-bank": entry("IDFC FIRST Bank · Pay Abroad & Inward Remittance", "https://www.idfcfirst.bank.in", {
    fees: ["Online Pay Abroad outward transfers and inward SWIFT credits carry Nil IDFC FIRST Bank base transfer fee (FX markup, slab GST, LRS TCS and intermediary SWIFT deductions still apply)."],
    limits: ["Outward personal remittances follow RBI’s LRS cap of 250,000 USD per financial year."],
    tax: ["Slab-based FX conversion GST and statutory Indian LRS TCS apply on outward transfers."],
    delivery: { label: "1–3 working days", detail: "IDFC FIRST Bank says Pay Abroad outward international wire transfers typically settle in 1–3 working days." },
    paperwork: ["Digital Form A2 and PAN for outward transfers; inward disposal instructions and purpose code required to credit inward SWIFT receipts."],
  }),
  "canara-bank": entry("Canara Bank · Foreign Exchange & Remittances", "https://www.canarabank.bank.in", {
    fees: ["Inward remittances: Nil (personal) or ₹300 (corporate); outward SWIFT wire: ~₹1,000 (personal) or ₹2,000 (corporate) plus ₹500 SWIFT charge, FX margin, GST and TCS."],
    limits: ["Outward personal remittances follow RBI’s LRS cap of 250,000 USD per financial year."],
    tax: ["18% GST on service/SWIFT charges, slab-based FX GST, and statutory Indian LRS TCS on outward transfers."],
    paperwork: ["Form A2 / FEMA declaration and PAN for outward transfers; purpose proof for commercial inward receipts."],
  }),
  // --- Core On/Off-Ramps, Stablecoin & B2B Payment Infrastructure ---
  transak: entry("Transak · Pricing & Limits", "https://transak.com", {
    fees: ["0%–2.5% spread plus payment-method processing fee and blockchain gas fee displayed before confirmation."],
    limits: ["Tiered limits: Lite KYC 10–200 USD, Standard KYC up to 20,000–25,000 USD, Enhanced KYC 75,000 USD+."],
    delivery: { label: "Minutes to 1–2 business days", detail: "Transak says card and instant-bank crypto orders settle in minutes, while standard bank transfers settle in 1–2 business days." },
  }),
  moonpay: entry("MoonPay · Fees & Delivery", "https://www.moonpay.com", {
    fees: ["Dynamic processing fee by card/bank rail plus blockchain network gas fee shown upfront before purchase."],
    limits: ["Dynamic per-user limits by KYC tier and jurisdiction (e.g. Maine capped at 2,999 USD)."],
    delivery: { label: "Minutes to 5 business days", detail: "MoonPay says card orders arrive in minutes, UK Faster Payments / Brazil Pix within 1 business day, SEPA in 1–3 business days and US ACH in 4–5 business days." },
  }),
  "ramp-network": entry("Ramp Network · Fees & Limits", "https://rampnetwork.com", {
    fees: ["On-ramp: up to 3.9% by card or up to 1.4% by bank transfer. Off-ramp: ~4.5% card, ~2% US bank/SEPA and ~1% select local rails."],
    limits: ["Dynamic regional limits; US compliance thresholds require proof of address above 5,000 USD, source of wealth above 10,000 USD and source of funds above 20,000 USD."],
    delivery: { label: "2–5 minutes to 3 business days", detail: "Ramp Network says card and instant bank transfers settle in 2–5 minutes, while standard bank settlements take up to 3 business days." },
  }),
  banxa: entry("Banxa · Fiat-to-Crypto Ramp", "https://banxa.com", {
    fees: ["Bank transfers start around 1%+ with higher processing fees for credit/debit cards, shown upfront in the quote."],
    limits: ["Dynamic transaction and cumulative caps based on KYC tier and payment rail."],
    delivery: { label: "Minutes to 3 business days", detail: "Banxa says instant payment methods settle in minutes, whereas standard bank transfers take 1–3 business days." },
  }),
  mercuryo: entry("Mercuryo · Fees & Limits", "https://mercuryo.io", {
    fees: ["Buy fee up to 5.5% (minimum 1 EUR), sell fee up to 3.95% (minimum 3 EUR); optional Fast Track adds 2%."],
    limits: ["Fast Track no-KYC cap 700 EUR (unavailable in the US); verified accounts up to 2,000 EUR via Apple/Google Pay and 15,000 EUR via bank card."],
    delivery: { label: "Minutes to 60 minutes", detail: "Mercuryo says verified card and wallet conversions typically settle within minutes and up to 60 minutes." },
  }),
  "alchemy-pay": entry("Alchemy Pay · On/Off-Ramp", "https://alchemypay.org", {
    fees: ["Dynamic processing fee by payment method plus blockchain network gas fee shown in the checkout widget."],
    limits: ["Daily and monthly caps scale with personal KYC or corporate KYB tier."],
    delivery: { label: "Within 1 business day", detail: "Alchemy Pay says card and local-wallet transactions typically complete within minutes and standard bank rails within 1 business day." },
  }),
  guardarian: entry("Guardarian · Pricing", "https://guardarian.com", {
    fees: ["Upfront service fee, FX rate and blockchain network fee quoted with no hidden charges."],
    limits: ["Tiered limits from low-KYC starter thresholds up to higher verified bank-transfer volumes."],
    delivery: { label: "Within 20 minutes", detail: "Guardarian says standard crypto purchases and off-ramp conversions typically complete within 20 minutes." },
  }),
  stripe: entry("Stripe · Pricing & Payouts", "https://stripe.com", {
    fees: ["US standard online card pricing: 2.9% + 0.30 USD (international cards add 1.5% and currency conversion adds 1%); custom volume rates available."],
    limits: ["No fixed global maximum; reserve and risk limits are underwritten per merchant account."],
    delivery: { label: "T+2 business days (US standard)", detail: "Stripe says standard US payouts settle on a 2-business-day rolling schedule (first payout carries a 7–14 day risk hold)." },
  }),
  coinbase: entry("Coinbase · Fees & Limits", "https://www.coinbase.com", {
    fees: ["Simple trades carry a variable fee plus spread; Coinbase Advanced starts at 0.40% maker / 0.60% taker (volume-tiered downward); USDC conversions carry reduced/zero fees on select pairs."],
    limits: ["Dynamic deposit, trade and withdrawal limits based on account verification level, payment rail and history."],
    delivery: { label: "Instant (debit) to 1–3 business days", detail: "Coinbase says debit card purchases and instant cashouts settle immediately, while ACH and SEPA bank transfers settle in 1–3 business days." },
  }),
  bridge: entry("Bridge · Stablecoin APIs", "https://www.bridge.xyz", {
    fees: ["Fiat-to-fiat orchestration up to 1% FX plus network gas (enterprise volume pricing available)."],
    limits: ["US database-only KYC cap: 10,000 USD/tx and 100,000 USD lifetime; third-party virtual accounts 4,000 USD/tx; Same-Day ACH up to 1,000,000 USD; SEPA Instant up to 1,000,000 EUR."],
    delivery: { label: "20 seconds to 1–2 banking days", detail: "Bridge says on-chain stablecoin legs settle in ~20 seconds and fiat legs settle same-day to 1–2 banking days depending on rail." },
  }),
  nium: entry("Nium · Global Payouts", "https://www.nium.com", {
    fees: ["Custom enterprise B2B corridor payout fees and FX spreads negotiated per contract."],
    limits: ["Dynamic wallet, virtual-card and payout limits configured per KYB entity and local rail."],
    delivery: { label: "Real-time to local banking hours", detail: "Nium says payouts settle in real time across 100+ real-time markets and within standard local clearing hours elsewhere." },
  }),
  thunes: entry("Thunes · Direct Global Network", "https://www.thunes.com", {
    fees: ["Custom corridor B2B pricing and locked FX quotes delivered via Thunes API."],
    limits: ["Dynamic per-corridor and per-receiving-partner transaction limits."],
    delivery: { label: "Real-time / near-instant", detail: "Thunes says payouts across its 140+ country Direct Global Network settle in real time or near-instant." },
  }),
  rapyd: entry("Rapyd · Global Fintech Platform", "https://www.rapyd.net", {
    fees: ["Interchange++ acquiring plus negotiated markup, payout rail fee and FX spread."],
    limits: ["Risk-based underwritten merchant limits; minimum settlement payout balance is 100 USD."],
    delivery: { label: "2–10 business days", detail: "Rapyd says standard merchant bank settlements typically clear in 2–10 business days depending on country and risk tier." },
  }),
  bvnk: entry("BVNK · Stablecoin & Fiat Rails", "https://bvnk.com", {
    fees: ["Typically ~0.5%–1.0% processing plus FX spread and blockchain network fee (custom enterprise tiers)."],
    limits: ["No fixed API minimum/maximum; OTC desk trades start at 100,000 USD minimum."],
    delivery: { label: "Instant / T+0 to 1–3 business days", detail: "BVNK says stablecoin and local instant rails settle immediately (T+0), while international wires settle in 1–3 business days." },
  }),
  conduit: entry("Conduit · B2B FX & Stablecoins", "https://www.conduit.financial", {
    fees: ["Volume-based wholesale FX (around 10 bps on select ramps; 35 USD fixed fee on transfers under 10,000 USD)."],
    limits: ["Standard minimum 10,000 USD per transfer; transfers above 100,000 USD trigger enhanced compliance review."],
    delivery: { label: "2–8 hours (T+1 after hours)", detail: "Conduit says business cross-border transfers typically settle in 2–8 hours during banking hours, or T+1 after cut-off." },
  }),
  currencycloud: entry("Currencycloud · Wholesale B2B FX", "https://www.currencycloud.com", {
    fees: ["Negotiated wholesale B2B FX spreads and per-rail local/SWIFT payout fees."],
    limits: ["Default 500,000 GBP spot/forward limit per trade (expandable by credit/compliance approval)."],
    delivery: { label: "Corridor-dependent (Local vs. SWIFT)", detail: "Currencycloud says local rail payouts settle same-day to next business day, while SWIFT wires settle in 1–3 business days." },
  }),
  "checkout-com": entry("Checkout.com · Enterprise Payments", "https://www.checkout.com", {
    fees: ["Custom enterprise Interchange++ acquiring and push-to-card payout pricing."],
    limits: ["Underwritten per enterprise merchant agreement."],
    delivery: { label: "30 min–48h (card) / T+3 (acquiring)", detail: "Checkout.com says card payouts settle in 30 minutes to 48 hours and standard acquiring settlements clear around T+3 business days." },
  }),
  paxos: entry("Paxos · Regulated Settlement", "https://www.paxos.com", {
    fees: ["Custom institutional mint, burn and custody pricing."],
    limits: ["Dynamic limits based on institutional KYC/KYB onboarding tier."],
    delivery: { label: "Instant (internal ledger)", detail: "Paxos says internal ledger and stablecoin mint/burn settlements execute instantly 24/7; external bank wires follow banking hours." },
  }),
  "mastercard-move": entry("Mastercard Move", "https://www.mastercard.com", {
    fees: ["Network-level negotiated institutional fees passed through participating financial institutions."],
    delivery: { label: "Near real-time (seconds)", detail: "Mastercard Move says eligible card and account payouts deliver in near real-time (seconds to minutes)." },
  }),
  "visa-direct": entry("Visa Direct", "https://www.visa.com", {
    fees: ["Visa scheme/interchange fee plus participating acquirer or fintech markup."],
    delivery: { label: "Within 30 minutes (Fast Funds)", detail: "Visa Direct says Fast Funds-enabled card payouts make funds available within 30 minutes; non-Fast Funds cards settle in 1–2 business days." },
  }),
  ripple: entry("Ripple Payments", "https://ripple.com", {
    fees: ["Custom enterprise software and liquidity contract pricing."],
    delivery: { label: "3–5 seconds (XRPL) / Same-day fiat", detail: "Ripple says XRPL ledger settlement takes 3–5 seconds and fiat last-mile payouts settle same-day to next business day." },
  }),
  dtcpay: entry("dtcpay · Fiat & Stablecoin Accounts", "https://dtcpay.com", {
    fees: ["0% card FX fee when settling via stablecoins; SGD virtual-account fee waived at 100,000 SGD+ monthly volume (otherwise 100 SGD)."],
    limits: ["Monthly volume tiers assigned per KYC/KYB verification level."],
    delivery: { label: "Near-instant (deposits & swaps)", detail: "dtcpay says supported stablecoin swaps and local SGD deposits settle near-instantly." },
  }),
  "fomo-pay": entry("FOMO Pay · B2B Treasury", "https://www.fomopay.com", {
    fees: ["Custom B2B digital payment and FX settlement pricing."],
    delivery: { label: "24/7 USD Book Transfers", detail: "FOMO Pay supports 24/7 USD internal book transfers; external local and SWIFT wires follow correspondent banking hours." },
  }),
  "triple-a": entry("Triple-A · Crypto-to-Fiat", "https://triple-a.io", {
    fees: ["Custom merchant settlement fee with locked exchange rates and zero chargeback risk."],
    limits: ["Minimum fiat bank withdrawal is 3,000 USD."],
    delivery: { label: "Same-day or next business day", detail: "Triple-A says merchant fiat bank settlements typically clear same-day or on the next business day." },
  }),
  clickpesa: entry("ClickPesa · East Africa B2B", "https://clickpesa.com", {
    fees: ["Free signup and 0 monthly fee; channel-specific local mobile-money, ACH and RTGS payout fees."],
    limits: ["Pre-KYC cap 100,000 TZS; verified ACH 2,500–20,000,000 TZS; verified RTGS 11,900–1,000,000,000 TZS."],
    delivery: { label: "Same day to 1 working day", detail: "ClickPesa says local mobile-money and RTGS payouts settle same day and ACH payouts within 1 working day." },
  }),
  fonbnk: entry("Fonbnk · Emerging Market Rails", "https://fonbnk.com", {
    fees: ["Quote-driven API processing fee plus local mobile-money/bank rail fee and network gas."],
    limits: ["Unverified cap 1 USD (2 USD in Côte d’Ivoire); dynamic higher limits once Basic or Advanced KYC completes."],
    delivery: { label: "Near-real-time (crypto leg)", detail: "Fonbnk says verified mobile-money and stablecoin legs typically settle in near-real-time." },
  }),
  koywe: entry("Koywe · LatAm FX & Stablecoins", "https://www.koywe.com", {
    fees: ["Mid-market-linked FX for LatAm fiat↔stablecoin rails with zero SWIFT fees."],
    limits: ["Unverified cap 300 USD; verified accounts have no preset upper cap."],
    delivery: { label: "Instant to 2 hours", detail: "Koywe says Pix and SPEI transfers settle instantly and other LatAm bank payouts settle within 2 hours." },
  }),
  onafriq: entry("Onafriq · Pan-African Network", "https://onafriq.com", {
    fees: ["Custom B2B hub pricing negotiated per corridor and partner."],
    delivery: { label: "Real-time / near-real-time", detail: "Onafriq connects African mobile-money wallets and banks for real-time or near-real-time disbursements." },
  }),
  openpayd: entry("OpenPayd · Embedded Finance", "https://www.openpayd.com", {
    fees: ["Bespoke B2B pricing for virtual IBANs, FX and global payout rails."],
    delivery: { label: "Seconds to 5 business days", detail: "OpenPayd says UK FPS, SEPA Instant and Brazil Pix settle in seconds, while international SWIFT wires take 1–5 business days." },
  }),
  "banking-circle": entry("Banking Circle · Institutional Clearing", "https://www.bankingcircle.com", {
    fees: ["Custom institutional Master Services Agreement (~20 EUR OUR cross-border benchmark; 35 EUR / 30 GBP / 40 USD investigation queries)."],
    delivery: { label: "Under 10 seconds (SEPA Instant)", detail: "Banking Circle says SEPA Instant and internal clearing settle in under 10 seconds; SWIFT follows standard banking cut-offs." },
  }),
  unlimit: entry("Unlimit · Global Acquiring & Payouts", "https://www.unlimit.com", {
    fees: ["Custom acquiring and payout tariffs (select EU business accounts publish 9.50 EUR/month maintenance)."],
    delivery: { label: "1–3 business days", detail: "Unlimit says standard business settlements and international payouts typically clear in 1–3 business days." },
  }),
  "zero-hash": entry("Zero Hash · Stablecoin Infrastructure", "https://zerohash.com", {
    fees: ["Configurable RFQ bps spread plus network gas; USDC burn 5 bps (USDC mint, USDT, PYUSD and DAI mint/burn 0 bps)."],
    limits: ["Deposits above 500,000 USD trigger relationship-manager review."],
    delivery: { label: "Instant (stablecoins) / T+1 (fiat)", detail: "Zero Hash says on-chain stablecoin settlement is instant and fiat bank settlement clears T+1 by 12:00 PM EST." },
  }),
  "1money": entry("1Money · Enterprise Stablecoin Rails", "https://www.1money.com", {
    fees: ["0 USD platform, setup and gas fee; fiat ramps 0–15 bps, stablecoin swaps from 10 bps, US ACH 0.55 USD, SWIFT 10–25 USD."],
    limits: ["No minimum balance required; enterprise limits configured per KYB onboarding."],
    delivery: { label: "24/7/365 real-time", detail: "1Money operates 24/7/365 real-time stablecoin settlement with same-day to next-day local bank payouts." },
  }),
  sphere: entry("Sphere · Stablecoin Treasury", "https://spherepay.co", {
    fees: ["Usage-based or enterprise API pricing for fiat↔USDC/USDT/EURC rails."],
    limits: ["Corridor limits depend on rail and tier (e.g. MXN SPEI→USD supports 50 USD to 1,000,000 USD per transaction)."],
    delivery: { label: "Under 30 minutes", detail: "Sphere says automated fiat-to-stablecoin and cross-border payouts typically settle in under 30 minutes." },
  }),
  brale: entry("Brale · Stablecoin Issuance & Treasury", "https://brale.xyz", {
    fees: ["0 USD/month platform fee (custom stablecoin issuance 1,000 USD/month); 0 bps USD ACH/Wire mint and burn."],
    limits: ["Entry limits start around 50,000 USD per transaction (expandable with institutional review)."],
    delivery: { label: "24/7 real-time (Instant Treasury)", detail: "Brale Instant Treasury supports 24/7 real-time stablecoin minting/redemption; external bank wires follow Fedwire/ACH schedules." },
  }),
  // --- Established FX Brokers & Remitters ---
  "currencies-direct": entry("Currencies Direct · Transfers & Limits", "https://www.currenciesdirect.com", {
    fees: ["0 GBP transfer fee on standard personal transfers (revenue via FX spread; specialist business services like Batchpay may carry agreed fees)."],
    limits: ["Online transfers 10 GBP minimum to 500,000 GBP maximum; larger transfers arranged by phone with no strict platform cap."],
    delivery: { label: "Seconds to 3 working days", detail: "Currencies Direct says GBP and major European transfers can arrive same-day/hours, most major corridors within 24–48 hours, and up to 3 working days overall." },
  }),
  torfx: entry("TorFX · Transfers & Limits", "https://www.torfx.com", {
    fees: ["No upfront transfer fees or commissions on standard personal or regular overseas transfers (revenue via FX margin; SWIFT intermediary fees may apply)."],
    limits: ["Online minimum 100 GBP (Regular Overseas Payments 500–10,000 GBP/month); no maximum transfer limit (large transfers booked by phone)."],
    delivery: { label: "Same day to 2 working days", detail: "TorFX says most major-currency transfers arrive the same working day, and other currencies typically settle in 1–2 working days." },
  }),
  moneycorp: entry("Moneycorp · International Payments", "https://www.moneycorp.com", {
    fees: ["0 GBP online transfer fee on international payments accounts (revenue via FX spread; phone or regular payment plans may vary)."],
    limits: ["Online minimum 50 GBP / 50 USD / 50 EUR; no fixed maximum cap published (transfers of 10,000 GBP+ require source-of-funds checks)."],
    delivery: { label: "Same day to 2 working days", detail: "Moneycorp says local UK Faster Payments/SEPA can clear same day, major corridors in 1–2 working days and SWIFT in 1–5 business days." },
  }),
  transfermate: entry("TransferMate · Global Payments", "https://www.transfermate.com", {
    fees: ["0 USD fee for registered businesses on transfers above 5,000; individuals typically pay 10 EUR (or equivalent) plus FX margin."],
    delivery: { label: "1–5 business days", detail: "TransferMate says local inbound clearing takes 24–48 hours followed by same-day to 1–2 business days payout (3–5 business days for APMs)." },
  }),
  "equals-money": entry("Equals Money · Business Accounts", "https://equalsmoney.com", {
    fees: ["Tiered business plans with volume-based FX pricing; 0% card spend fee in 21 supported currencies (1.5% out-of-currency), 10 GBP+VAT physical card, 1.50 GBP ATM."],
    limits: ["Supports bulk uploads up to 10,000 payments per batch and customizable account/card limits by corporate tier."],
    delivery: { label: "Same day to 3 working days", detail: "Equals Money aims for same-day processing once funds arrive, delivering same-day to 3 working days via FPS, SEPA or SWIFT." },
  }),
  caxton: entry("Caxton · International Transfers", "https://www.caxton.io", {
    fees: ["Fee-free or low-cost international transfers priced via FX spread (0% spend fee on loaded card currencies; intermediary SWIFT fees may apply)."],
    limits: ["Online transfers 100 GBP to 100,000 GBP (larger by phone); personal travel card 10,000–12,000 GBP single load and 50,000 GBP/year cap."],
    delivery: { label: "2–3 working days", detail: "Caxton says standard international bank transfers settle in 2–3 working days; card loads arrive within minutes." },
  }),
  fairfx: entry("FairFX · Multi-Currency Accounts", "https://www.fairfx.com", {
    fees: ["0 GBP monthly fee, first card free, 0% spend fee in loaded currencies (2.25% on unsupported currencies), 1 GBP ATM withdrawal, 5 GBP refund fee."],
    limits: ["Custom daily, weekly, monthly and per-transaction limits configurable in-app."],
    delivery: { label: "Same to next working day", detail: "FairFX says international bank transfers across 140+ currencies support same-day and next-working-day delivery." },
  }),
  dahabshiil: entry("Dahabshiil · Money Transfers", "https://www.dahabshiil.com", {
    fees: ["Corridor-, amount- and payout-method-dependent fee shown upfront before confirming (introductory zero-fee promos frequently available)."],
    delivery: { label: "Immediate (cash) to 3 business days", detail: "Dahabshiil says over-the-counter cash pickups are usually immediate while mobile-wallet and bank payouts take up to 3 business days." },
  }),
  pangea: entry("Pangea Money Transfer", "https://pangeamoneytransfer.com", {
    fees: ["Fixed low corridor transfer fee displayed upfront plus FX margin (credit card funding carries extra fees; first transfer often fee-free)."],
    limits: ["Tiered limits: L1 1k/day (2k/30d, 12k/180d USD); L2 3k/day (10k/30d, 36k/180d USD); L3 6k/day (30k/30d, 60k/180d USD)."],
    delivery: { label: "Minutes (card) to 3–4 business days (bank)", detail: "Pangea says card-funded cash pickups, wallets and debit deposits arrive in minutes; bank-funded transfers take 3–4 business days." },
    tax: [US_REMITTANCE_TAX],
  }),
  "boss-money": entry("BOSS Money · Transfers", "https://www.bossrevolution.com/en-us/services/money-transfer", {
    fees: ["Corridor- and payment-method-dependent fee shown upfront in-app (new users often receive 0 USD fee on initial transfers; debit/ACH cheaper than credit card)."],
    limits: ["10 USD minimum to 5,000 USD maximum per transaction (lower caps may apply by country or cash pickup partner)."],
    delivery: { label: "Minutes to 1 business day", detail: "BOSS Money says most transfers arrive within minutes to 1 business day depending on payout rail and compliance checks." },
    tax: [US_REMITTANCE_TAX],
  }),
  talkremit: entry("TalkRemit · Transfers", "https://www.talkremit.com", {
    fees: ["Corridor-, amount- and payment-method-dependent fee and FX rate shown upfront via Quick Quote."],
    limits: ["Dynamic limits by destination country, payment rail and payout method (source-of-funds unlocks higher caps)."],
    delivery: { label: "Instant (5 min) to 3 business days", detail: "TalkRemit says mobile wallets and cash pickups arrive instantly (up to 5 minutes) and bank deposits arrive instant to 3 business days." },
  }),
  "kabayan-remit": entry("Kabayan Remit · Philippines Transfers", "https://www.kabayanremit.com", {
    fees: ["Flat transfer fees starting from 2.99 GBP (UK), 2.99 USD (US) or 3.99 CAD (Canada) plus upfront PHP exchange rate."],
    limits: ["Single-transfer max: UK 5,000 GBP, Canada 3,000 CAD (e-Transfer), US 300 USD starter (scales with verification)."],
    delivery: { label: "Within 1 hour to 2 banking days", detail: "Kabayan Remit says transfers up to 50,000 PHP (and major wallets/cash pickup) arrive within 1 hour; transfers over 50,000 PHP take 1–2 banking days." },
  }),
  "opal-transfer": entry("Opal Transfer · Pricing & Limits", "https://www.opaltransfer.com", {
    fees: ["Low upfront transfer fees shown on the calculator before sending (starting from 0.50 GBP on select routes)."],
    limits: ["Rolling 90-day UK/EU KYC tiers: ID up to 1,500 GBP; ID + address up to 5,000 GBP; ID + address + source of funds above 5,000 GBP."],
    delivery: { label: "Same to next business day", detail: "Opal Transfer says orders funded before daily cut-off process same business day and arrive same day or next business day across EEA/UK." },
  }),
  passto: entry("Passto · UK Remittances", "https://www.passto.co.uk", {
    fees: ["1.40 GBP to 15 GBP depending on destination and payout method (everyday transfers typically 1.40–2.50 GBP) shown upfront."],
    limits: ["Standard personal limits: 5,000 GBP daily, 10,000 GBP monthly and 50,000 GBP yearly."],
    delivery: { label: "Minutes to next working day", detail: "Passto says ~90% of transfers arrive instantly or within minutes (up to 1 hour), with remaining routes settling same or next working day." },
  }),
  paga: entry("Paga · Nigeria Wallets", "https://www.mypaga.com", {
    limits: ["Nigeria CBN wallet tiers: Level 1 50,000 NGN/day (300,000 NGN balance); Level 2 200,000 NGN/day (500,000 NGN balance); Level 3 up to 5,000,000 NGN/day."],
  }),
  bancoli: entry("Bancoli · Business Accounts", "https://bancoli.com", {
    fees: ["Free 0 USD/mo, Plus 29 USD/mo (waived at 20k USD stablecoins), Premium 199 USD/mo (waived at 250k USD), Enterprise custom; 0% FX markup on eligible 25+ currency payouts."],
    delivery: { label: "Near-instant to local clearing", detail: "Bancoli supports US ACH/RTP and stablecoin receipts plus local-rail payouts in 40+ currencies avoiding SWIFT delays." },
  }),
  multipass: entry("MultiPass · Corporate Accounts", "https://multipass.co", {
    fees: ["Tailored corporate pricing based on entity jurisdiction and turnover (optional priority onboarding available for an extra fee)."],
    limits: ["Customized during KYB onboarding based on business turnover and risk profile."],
  }),
  "ifx-payments": entry("IFX Payments · Corporate FX", "https://www.ifxpayments.com", {
    fees: ["Tailored volume-based corporate transfer fees and FX spreads negotiated per client."],
    limits: ["No batch size limits on mass payments; overall corporate limits tailored during onboarding."],
  }),
  lumon: entry("Lumon · Currency Transfers", "https://www.lumonpay.com", {
    fees: ["No upfront transfer fees on standard online or dealer transfers (revenue via FX margin; intermediary SWIFT fees may apply)."],
    limits: ["No rigid retail maximum transfer cap (designed for property and corporate transfers; large amounts require source-of-funds checks)."],
    delivery: { label: "1–3 business days", detail: "Lumon says international SWIFT bank transfers typically settle in 1–3 business days." },
  }),
  "sterling-fx": entry("Sterling FX · UK Currency", "https://www.sterlingfx.co.uk", {
    fees: ["Commission-free travel money pricing paid via UK debit card or open-banking bank transfer."],
    delivery: { label: "Next-day option (UK delivery)", detail: "Sterling FX offers insured next-day UK Royal Mail Special Delivery or London branch Click & Collect." },
  }),
  "key-currency": entry("Key Currency · International Transfers", "https://www.keycurrency.co.uk", {
    fees: ["No transfer fees on international money transfers (revenue via FX spread)."],
    limits: ["No upper maximum limit on how much you can send internationally."],
    delivery: { label: "1–3 business days", detail: "Key Currency says most international bank transfers arrive in 1–3 business days depending on currency and banking rails." },
  }),
  "smart-currency-exchange": entry("Smart Currency Exchange", "https://www.smartcurrencyexchange.com", {
    fees: ["No upfront transfer fees on standard or online portal transactions (revenue via transparent FX margin)."],
    delivery: { label: "Same day to 2 working days", detail: "Smart Currency Exchange says most transfers arrive in 1–2 working days, with same-day settlement often available before cut-offs." },
  }),
  "regency-fx": entry("Regency FX · Currency Transfers", "https://www.regencyfx.com", {
    delivery: { label: "Same day to 2 business days", detail: "Regency FX says GBP→EUR and GBP→USD sent before 2:00–2:30 PM arrive same day; AUD, CAD and NZD typically take 1–2 business days." },
  }),
  // --- Regional Underdogs ---
  easebuzz: entry("Easebuzz · Atlas Cross-Border", "https://easebuzz.in", {
    fees: ["PA-CB (Atlas) export collection pricing combines processing fee + upfront FX markup (~0.5%–3% indicative range by merchant agreement)."],
    delivery: { label: "Next business day (T+1)", detail: "Easebuzz says local-rail export collections convert and settle into Indian INR bank accounts typically by T+1." },
  }),
  pay10: entry("Pay10 · PA-CB Export Collections", "https://pay10.in", {
    fees: ["Zero setup fee; indicative platform fees start around 0.95% (customized international rates from 0.65%) + 18% GST."],
    limits: ["Up to ₹25 lakh per transaction under RBI PA-CB-E export rules; daily/monthly limits set post-onboarding."],
    tax: ["18% GST applies on Pay10’s platform fee."],
    delivery: { label: "AD-I bank clearing cycle", detail: "Pay10 provides real-time payment notifications and settles INR via AD Category-I bank InCA/OCA clearing after FEMA purpose-code matching." },
  }),
  "onramp-money": entry("Onramp.money · Fiat-Crypto Ramp", "https://onramp.money", {
    fees: ["Variable conversion and blockchain network fees by region and payment rail, displayed upfront before confirming."],
    delivery: { label: "Within minutes", detail: "Onramp.money says crypto dispatches within minutes after fiat payment confirmation." },
  }),
  onmeta: entry("Onmeta · Fiat-Crypto Ramp", "https://onmeta.in", {
    fees: ["Upfront breakdown of Onmeta processing fee, network gas fee and statutory 1% Indian TDS where applicable."],
    limits: ["Basic KYC default cap ₹20,000/day; higher limits unlocked via Enhanced Due Diligence."],
    tax: ["Statutory 1% Indian VDA TDS applies where required by law."],
    delivery: { label: "Under 60 seconds", detail: "Onmeta says UPI and local-rail ramp orders typically settle in under 60 seconds once fiat payment registers." },
  }),
  abound: entry("Abound · US to India", "https://www.joinabound.com", {
    fees: ["Standard free tier (often 0 USD fee promos on first transfer) or Abound Elite at 9.99 USD/month, with upfront USD→INR rate shown."],
    limits: ["Up to 9,500 USD per transaction (7,500–9,500 USD daily depending on verification and payment rail)."],
    tax: [US_REMITTANCE_TAX],
  }),
  rupeeflo: entry("Rupeeflo · NRI Banking & Transfers", "https://www.rupeeflo.com", {
    fees: ["Promotional first transfer advertised at mid-market rate without hidden FX markups; full corridor schedule shown in-app."],
    delivery: { label: "~5 days (NRI onboarding docs)", detail: "Rupeeflo ships notarised NRI onboarding documents to India in ~5 days (<7 days end-to-end)." },
  }),
  payhere: entry("PayHere · Sri Lanka Payments", "https://www.payhere.lk", {
    fees: ["LITE 0/mo + 3.30%/tx; PLUS 3,990 LKR/mo + 2.99%/tx; PREMIUM 9,990 LKR/mo + 2.69%/tx (+1.0% cross-border FX; HelaPay 1.99%)."],
    limits: ["LITE 50k LKR/tx (200k/mo); PLUS 250k LKR/tx (3M/mo); PREMIUM 1M LKR/tx (unlimited/mo)."],
  }),
  urpay: entry("urpay · Saudi International Transfers", "https://urpay.com.sa", {
    fees: ["Standard international transfer fee around 8 SAR (+ 15% VAT) with frequent zero-fee corridor promos; urpay Premium offers fee cashback."],
    tax: ["15% Saudi VAT applies on transfer fees."],
  }),
  tiqmo: entry("Tiqmo · GCC International Transfers", "https://tiqmo.com", {
    fees: ["Variable by corridor, payout method and active promotions, shown upfront in-app across 200+ countries."],
    limits: ["Dynamic wallet and remittance caps under SAMA/CBK EMI rules visible in-app."],
  }),
  "mobily-pay": entry("Mobily Pay · Saudi Remittances", "https://mobilypay.sa", {
    fees: ["Promotional 0 SAR fee on transfers of 1,000 SAR+; ~9 SAR (excl. 15% VAT) below 1,000 SAR via MoneyGram."],
    limits: ["Daily cap 30,000 SAR, monthly cap 100,000 SAR; monthly top-ups up to 20,000 SAR (cards) or 100,000 SAR (personal IBAN)."],
    tax: ["15% Saudi VAT applies on transfer fees."],
    delivery: { label: "Instant (cash) to 1–2 business days", detail: "Mobily Pay says MoneyGram cash pickup is available almost immediately; bank/wallet arrival depends on corridor." },
  }),
  d360: entry("D360 Bank · Saudi Digital Bank", "https://d360.com", {
    fees: ["Zero hidden fees with competitive/zero-fee international transfers via MoneyGram partnership and market FX rates."],
    delivery: { label: "Instant", detail: "D360 Bank advertises instant international transfers subject to destination bank or cash-pickup availability." },
  }),
  "bfc-pay": entry("BFC Pay · Bahrain & Forex", "https://bfcpay.com", {
    fees: ["Corridor- and payout-method-dependent service charges and live FX rates shown in-app before confirming."],
    limits: ["Bahrain wallet caps follow CBB tiered KYC rules in-app; India outward LRS via BFC Forex capped at 250,000 USD/FY."],
  }),
  thawani: entry("Thawani Pay · Oman", "https://thawani.om", {
    fees: ["Competitive upfront transfer fees and FX conversions displayed in-app before confirming."],
    limits: ["Tiered app limits (999 OMR referenced for card/wallet transfer caps; exact remittance caps shown in-app)."],
    delivery: { label: "Up to 2 working days (local)", detail: "Thawani says local Oman transfers take up to 2 working days; international delivery windows display per partner in-app." },
  }),
  okoora: entry("Okoora · Multi-Currency FX", "https://www.okoora.com", {
    fees: ["Custom business subscription plans (initial multi-currency accounts included up to tier quota) plus plan-based FX and transfer fees."],
    delivery: { label: "Near real-time to 3 business days", detail: "Okoora says local clearing rails settle near real-time and standard cross-border payouts settle within 3 business days." },
  }),
  mukuru: entry("Mukuru · Transfers & Limits", "https://www.mukuru.com", {
    fees: ["Corridor-, country- and payout-method-dependent fee and FX rate shown upfront on app, web or WhatsApp."],
    limits: ["South Africa tiers: Lite 2,000 ZAR/mo, Core 25,000 ZAR/mo, Max up to 1,000,000 ZAR/year; UK Core 4,000 GBP/mo."],
    delivery: { label: "Instant to 1 hour", detail: "Mukuru says cash pickup, Mukuru Card and mobile-wallet payouts are instant once paid; bank transfers take instant to 1 hour." },
  }),
  accrue: entry("Accrue · African Payments", "https://useaccrue.com", {
    fees: ["Accrue-to-Accrue P2P free; Accrue Business ACH & international wires 1%; Cashramp local payouts 1.5% (capped at 2.00 USD)."],
    delivery: { label: "Instant to 2 business days", detail: "Accrue says P2P/wallet transfers are instant, local bank/MoMo withdrawals take under 5 minutes and US ACH takes 1–2 business days." },
  }),
  valr: entry("VALR · Fees & Limits", "https://www.valr.com", {
    fees: ["Free crypto and ZAR EFT deposits (card 3.9%); first 30 standard ZAR withdrawals/mo free then 8.50 ZAR (Fast 30 ZAR); USD wire 0.10% (min 5 USD); EUR SEPA/wire 0.10% (min 3 EUR)."],
    limits: ["Semi-Verified & Fully-Verified: 0.01 BTC/day equivalent; Fully-Verified PLUS (with 2FA): 100 BTC/day equivalent."],
    delivery: { label: "Near-instant to same business day (ZAR)", detail: "VALR says Fast RTC ZAR withdrawals under 250k ZAR clear near-instantly (before 15:50 weekdays) and RTGS settles same business day." },
  }),
  fincra: entry("Fincra · B2B Global Payments", "https://fincra.com", {
    fees: ["Volume-dependent corporate pricing (framework examples cite ~0.5% + 45 USD SWIFT, 0.5% + 10 EUR SEPA, 0.5% + 10 GBP FPS)."],
    limits: ["No hard cap on compliant virtual-account balances; payout limits follow destination rails and merchant risk tier."],
    delivery: { label: "Instant to 3 business days", detail: "Fincra says local African bank and mobile-money payouts settle 24/7 instantly; SWIFT/SEPA settle T+1 to 3 business days." },
  }),
  leatherback: entry("Leatherback · Global Accounts", "https://leatherback.co", {
    fees: ["Free personal and business account setup; live transfer fees and FX spreads shown in-app before confirming."],
    delivery: { label: "Instant/same-day to 3 business days", detail: "Leatherback says domestic transfers settle instant or same-day and international cross-border wires settle in 1–3 business days." },
  }),
  nomad: entry("Nomad · Brazil USD Account", "https://www.nomadglobal.com", {
    fees: ["0 USD maintenance; BRL→USD commercial rate + conversion fee from 1% (+3.5% checking / +1.1% investment IOF/op); USD→BRL 8 USD fixed + from 1% + 0.38% op fee."],
    limits: ["BRL→USD 50–200,000 BRL/tx (checking) or 300–500,000 BRL/tx (investment); USD→BRL up to 100,000 USD/tx."],
    delivery: { label: "Same day to 3 US business days", detail: "Nomad says Fast ACH clears same US business day before 4:00 PM BRT; standard US ACH/Wire takes up to 3 US business days." },
  }),
  meru: entry("Meru · Fees", "https://getmeru.com", {
    fees: ["0 USD maintenance; LatAm local rails ~1% + 1–1.50 USD (Pix 0%); US/EU wires ~1.5% + 2–4 USD; stablecoins ~1% + 1 USD."],
  }),
  littio: entry("Littio · Global Account", "https://www.littio.co", {
    fees: ["0 USD maintenance/card fee and 0 USD conversion between USDc/EURc/COPm/MXNb; Global Account ACH/IBAN 2.99 USDc (0.6% above 4,999 USDc; waived on Pro); PSE/Nequi/Bre-B top-ups free."],
    delivery: { label: "Instant to 1–3 business days", detail: "Littio says internal transfers are instant while ACH and IBAN transfers follow standard 1–3 business day bank clearing." },
  }),
  "el-dorado": entry("El Dorado · Digital Dollar & P2P", "https://eldorado.io", {
    fees: ["El Dorado Pay internal free; Arbitrum deposit free (other chains 0.25%); USD ACH/Wire deposit 1.49%; ACH send 1.99 USD + 0.99%; Wire send 19.99 USD + 0.99%."],
    limits: ["Monthly KYC tiers: L2 10,000 USDT/mo, L3 250,000 USDT/mo, L4 1,000,000 USDT/mo."],
    delivery: { label: "Minutes (P2P/crypto) to 3 business days (ACH)", detail: "El Dorado says P2P escrow and TRC-20/Arbitrum settle in minutes, US wires in ~1 business day and US ACH in 1–3 business days." },
  }),
  utoppia: entry("Utoppia · USD Account Fees", "https://www.utoppia.com", {
    fees: ["0 USD/mo; free incoming ACH & USD card spend; incoming domestic wire 5 USD, SWIFT 32 USD; outgoing ACH 1 USD (Same-Day 3 USD); non-USD FX 1.49%; 3 USD/mo inactivity after 6 months if balance <500 USD."],
    delivery: { label: "24–48 hours (1–2 business days)", detail: "Utoppia says US ACH and platform payouts (Deel/Upwork/Payoneer) settle in 1–2 business days (Same-Day ACH under 24 hours)." },
  }),
  airtm: entry("Airtm · Digital Dollar Account", "https://www.airtm.com", {
    fees: ["0% fee on direct/manual crypto deposits, 0.5% crypto withdrawal fee; P2P and direct bank fees/FX shown upfront before confirming."],
    limits: ["New accounts (first 90 days): 2,500 USDC/day and 10,000 USDC/month; Enterprise API payouts have no upper per-tx cap."],
    delivery: { label: "Instant (API) to 3 business days", detail: "Airtm says API payouts are instant, direct crypto/P2P settle in minutes to hours, direct bank in 2–3 business days (intl wires up to 9 BD)." },
  }),
  astropay: entry("AstroPay · Wallet & Fees", "https://www.astropay.com", {
    fees: ["Corridor- and payment-method-dependent fees displayed inside the in-app Fees Schedule."],
    limits: ["Default loading, spending and transfer caps expand once full KYC completes (shown in-app)."],
  }),
  prex: entry("Prex · LatAm Cross-Border", "https://www.prexcard.com", {
    fees: ["0 USD issuance/maintenance; local Prex-to-Prex free; international Prex-to-Prex ~0.82–0.99 USD + taxes; international ATM ~3–5 USD + VAT."],
    limits: ["Argentina bank transfers ~3,000 USD/day & 4,000 USD/month; Uruguay intl Prex-to-Prex 1,000 USD/day & 3,000 USD/month."],
    delivery: { label: "Instant (Prex) to 48 business hours (bank)", detail: "Prex-to-Prex local and international transfers arrive instantly; external international bank transfers take ~48 business hours." },
  }),
  rextie: entry("Rextie · Peru USD↔PEN Exchange", "https://www.rextie.com", {
    fees: ["0 USD fixed service commission (revenue via real-time USD/PEN FX spread; interbank fees may apply outside same-bank transfers)."],
    delivery: { label: "10–15 minutes (same bank) to 24h", detail: "Rextie says direct same-bank USD↔PEN exchanges complete in 10–15 minutes and interbank transfers in up to 24 business hours." },
  }),
  moneymatch: entry("MoneyMatch · Malaysia FX", "https://moneymatch.co", {
    fees: ["Transparent corridor flat transfer fees and competitive FX spreads shown upfront in the MoneyMatch calculator."],
    limits: ["Corridor-specific minimum and maximum transaction caps displayed in the MoneyMatch order screen."],
    delivery: { label: "1–2 working days", detail: "MoneyMatch says international bank and supported wallet (Alipay/GrabPay) transfers typically settle within 1–2 working days." },
  }),
  merchantrade: entry("Merchantrade Money · Malaysia", "https://www.merchantrademoney.com", {
    fees: ["Card issuance 10 MYR, annual 10 MYR yr1 / 12 MYR yr2+; 0% spend fee in 20 currencies (1.75% otherwise); FPX/branch reload free (credit card 0.85%)."],
    limits: ["Standard Merchantrade Money e-wallet balance limit up to 30,000 MYR."],
    delivery: { label: "Almost immediate to 3 working days", detail: "Merchantrade says DuitNow is instant and overseas bank/e-wallet remittances are designed to arrive almost immediately (up to 3 working days)." },
  }),
  transfez: entry("Transfez · Indonesia Remittances", "https://transfez.com", {
    fees: ["Transparent fixed transfer fees per corridor displayed upfront in the Transfez app calculator across 70+ countries."],
    delivery: { label: "Same day (D+0) to 2 business days", detail: "Transfez says transfers funded before 4:00 PM GMT+7 often arrive same banking day (D+0) or within 1–2 business days." },
  }),
  wallex: entry("Wallex · APAC Business FX", "https://www.wallex.asia", {
    fees: ["Pay-as-you-go with 0 monthly subscription; near mid-market FX rates and volume-discounted transfer fees."],
    delivery: { label: "Same day (local) to multi-day (SWIFT)", detail: "Wallex delivers same-day across 20+ currencies via local rails before daily cut-off (ID, MY, PH, TH, VN); SWIFT takes multiple business days." },
  }),
  transwap: entry("TranSwap · Cross-Border FX", "https://www.transwap.com", {
    fees: ["Upfront exchange rate and transfer fee shown in each quote before confirmation (intermediary bank fees may apply)."],
    limits: ["Default rolling 12-month e-money limit of 30,000 SGD (or equivalent) unless higher institutional limits are agreed."],
  }),
  youtrip: entry("YouTrip · Multi-Currency Wallet", "https://www.you.co", {
    fees: ["0 SGD sign-up/annual fee and 0% overseas FX fee; PayNow/bank/debit/MC top-up free (Visa credit 1.5%); ATM free first 400 SGD/mo then 2%."],
    limits: ["Wallet balance cap 20,000 SGD; annual spend/top-up cap 100,000 SGD/365 days; overseas ATM cap 5,000 SGD/day."],
    delivery: { label: "Instant / same-day (YouTrip Send)", detail: "YouTrip Send payouts (such as DuitNow, GCash and UPI) typically arrive instantly or same-day." },
  }),
  xtransfer: entry("XTransfer · B2B Trade Collections", "https://www.xtransfer.com", {
    fees: ["0 USD account opening and 0 monthly maintenance fee; wholesale-linked FX rates and low settlement fees."],
    limits: ["Dynamic B2B trade limits scaled to verified commercial invoices and shipping documents."],
    delivery: { label: "1 second to 24 hours", detail: "XTransfer says local collection accounts and X-Net clearing settle as fast as 1 second and up to 24 hours." },
  }),
  "lianlian-global": entry("LianLian Global · Cross-Border Collections", "https://www.lianlianglobal.com", {
    fees: ["Volume-gradient collection fees and real-time FX quotes displayed in the merchant dashboard."],
    limits: ["Dynamic withdrawal minimums and transfer ceilings adjusted by verification tier and volume."],
    delivery: { label: "Same day to next business day", detail: "LianLian Global says local-currency withdrawals to same-name bank accounts process same day during working hours or next business day." },
  }),
  hanpass: entry("Hanpass · Overseas Remittance", "https://www.hanpass.com", {
    fees: ["Corridor- and method-dependent fees shown upfront (0 fee on select China Alipay/WeChat routes); pre-funded rails avoid intermediary bank charges."],
    limits: ["South Korea annual cap without supporting docs: 100,000 USD/year (Korean nationals) or 50,000 USD/year (foreign nationals)."],
    delivery: { label: "~3 minutes average", detail: "Hanpass says transfers arrive in ~3 minutes on average depending on destination bank/wallet and local banking hours." },
  }),
  moin: entry("MOIN · Korea Remittances", "https://www.themoin.com", {
    fees: ["Upfront low transfer fees bypassing SWIFT cable/intermediary fees, live FX refreshed every 10 minutes, plus student discounts."],
    delivery: { label: "Real-time to 1 business day", detail: "MOIN says major corridors (JP, EU, UK, SG) average ~30 minutes during banking hours and 1 business day overall." },
  }),
  "sbi-remit": entry("SBI Remit · Japan Remittances", "https://www.remit.co.jp", {
    fees: ["Corridor-, amount- and payout-method-dependent remittance fees (SHA option may incur intermediary bank deductions)."],
    limits: ["Individuals: max 1,000,000 JPY (or 10,000 USD equivalent) per transaction and 5,000,000 JPY cumulative per calendar year."],
    delivery: { label: "10 minutes to 2 business days", detail: "SBI Remit says fast payout rails arrive in 10 minutes to 1–3 hours; standard bank routes take 1–2 business days." },
  }),
  "smiles-remit": entry("Smiles Mobile Remittance", "https://www.smileswallet.com", {
    fees: ["Corridor- and method-dependent fees discountable with Smiles Points (periodic zero-fee promos)."],
    limits: ["Japan Type 2 caps: 1,000,000 JPY/tx, 2,000,000 JPY/90d, 5,000,000 JPY/365d (max 25 tx/30d)."],
    delivery: { label: "Real-time / within minutes", detail: "Smiles Mobile Remittance processes transfers in real time/minutes once wallet funds clear." },
  }),
  "kyodai-remittance": entry("Kyodai Remittance · Japan", "https://kyodairemittance.com", {
    fees: ["Corridor- and method-dependent remittance fees (Kyodai Remittance Plus transfers above 1M JPY carry a flat ~5,000 JPY fee)."],
    limits: ["Standard cap 1,000,000 JPY per transaction; Kyodai Remittance Plus allows up to 10,000,000 JPY for pre-approved purposes."],
    delivery: { label: "Same day / real-time", detail: "Kyodai Remittance processes verified funded transfers same day or real-time depending on destination partner." },
  }),
  yuh: entry("Yuh · Swiss Multi-Currency Account", "https://www.yuh.com", {
    fees: ["Free EUR SEPA and Swiss/Liechtenstein transfers; 4 CHF non-EUR SEPA; flat 0.95% FX markup across 13 currencies (intermediary fees may apply)."],
    limits: ["Card and ATM withdrawal limits: 1,000 CHF/day and 10,000 CHF/month."],
    delivery: { label: "1–3 business days (funding)", detail: "Yuh bank top-ups take 1–3 business days; SEPA and international transfers follow standard banking clearing windows." },
  }),
  "neon-ch": entry("neon · Swiss Bank (Wise-Powered)", "https://www.neon-free.ch", {
    fees: ["Built-in Wise integration at mid-market rate + transparent Wise fee (20% discount on neon global, 40% discount on neon metal)."],
    limits: ["Outgoing bank transfers up to 50,000 CHF/day; Instant Payments 10,000 CHF/tx and 30,000 CHF/day."],
    delivery: { label: "Hours to 1 business day", detail: "neon’s Wise-powered international transfers bypass intermediary banks and typically settle in hours to 1 business day." },
  }),
  qonto: entry("Qonto · European Business Account", "https://qonto.com", {
    fees: ["International local-rail FX transfers from 5 EUR minimum (or % fee, with 10%–50% discounts above 50,000 EUR) at mid-market FX via Wise/SWIFT."],
    limits: ["SEPA Instant and standard SEPA up to 100,000 EUR depending on plan configuration."],
    delivery: { label: "Under 10 seconds (SEPA) to 5 business days", detail: "Qonto says SEPA Instant clears in under 10 seconds, local-rail FX ~90% within 24 hours (up to 3 BD) and SWIFT up to 5 business days." },
  }),
  finom: entry("Finom · European Business Account", "https://finom.co", {
    fees: ["Incoming international ~5 EUR; local USD FedACH / GBP FPS ~5 EUR; outgoing SWIFT fixed + % by plan (OUR option ~35 EUR)."],
    limits: ["No arbitrary FX cap (subject to AML); US FedACH local transfers support up to 1,000,000 USD per transaction."],
    delivery: { label: "Same day to 5 business days", detail: "Finom says SEPA clears same-day/Instant, local USD/GBP same or next business day and SWIFT in hours to 5 business days." },
  }),
  "zen-com": entry("ZEN.COM · Multi-Currency Accounts", "https://www.zen.com", {
    fees: ["Tiered personal and business plans with free top-up/SEPA/SWIFT allowances followed by flat per-rail transfer fees."],
    limits: ["Card transfers: Mastercard up to 25,000 USD/tx & 50,000 USD/mo; Visa up to 25,000 USD/tx, 50,000 USD/day & 200,000 USD/30d."],
    delivery: { label: "Instant to 5 working days", detail: "ZEN.COM says SEPA Express clears in <=5 min, GBP FPS <=2h, PLN/RON Express 5–20 min, SWIFT 1–3 working days and non-EEA cards <=5 working days." },
  }),
  walutomat: entry("Walutomat · Poland FX Exchange", "https://www.walutomat.pl", {
    fees: ["Transparent % FX commission; up to 5 free PLN/EUR SEPA transfers/month then 1 PLN; non-SEPA/USD/GBP 9 PLN; non-IBAN countries 100 PLN."],
    limits: ["PayPal deposits capped at 10,000 EUR/tx and 100,000 EUR/month; bank limits follow verification and AML tiers."],
    delivery: { label: "Immediate to 3 business days", detail: "Walutomat says BLIK/PLN is immediate, SEPA Express same/next BD, standard SEPA 1–2 BD and USD/GBP/CHF 1–3 business days." },
  }),
  "fin-do": entry("Fin.do · Card-to-Card Transfers", "https://www.fin.do", {
    fees: ["Upfront transfer fee plus direct multi-currency conversion rate shown on the calculation screen before confirming."],
    limits: ["Unverified: 1,500 USD/card/day, 7k/card/mo, 35k/mo total; Verified: 2,500 USD/card/day, 10k/card/mo, 50k/mo total (receiving unlimited)."],
    delivery: { label: "Seconds to a few minutes", detail: "Fin.do says >90% of card-to-card transfers arrive in seconds to minutes (occasionally 1–2 business days depending on card issuer)." },
  }),
  mercury: entry("Mercury · US Business Banking", "https://mercury.com", {
    fees: ["0 USD/month standard plan (35 USD/mo optional paid tier), 0 minimum balance, free domestic ACH, free domestic wires and free USD international wires (FX fee applies on non-USD wires)."],
    limits: ["Dynamic ACH and wire limits shown in dashboard (Same-Day ACH eligible under 1,000,000 USD)."],
    delivery: { label: "Seconds (RTP) to 5 business days (intl wire)", detail: "Mercury says RTP settles in seconds, domestic wire same day, ACH 0–1 business day and international wires 1–5 business days." },
  }),
  relay: entry("Relay · US Business Banking", "https://relayfi.com", {
    fees: ["0 USD/month standard plan; ~5 USD domestic/incoming wires; invoice payments 2.9% + 0.30 USD (card) or 0.50%–1.00% max 10 USD (Plaid)."],
    limits: ["Up to 50 debit cards with customizable spend limits; dynamic ACH/wire caps visible in dashboard."],
    delivery: { label: "Immediate (internal) to 3+ business days", detail: "Relay says internal transfers are immediate, domestic wires same day, ACH 1–3 business days and international wires same-day (SEPA/FPS) to multi-day (SWIFT)." },
  }),
};

/** Published delivery windows for existing providers (each sourced from the provider's own site). */
const PROVIDER_DELIVERY: Record<string, ProviderDeliveryFact> = {
  wise: { label: "Seconds to 2 working days", detail: "Wise says over half of transfers arrive in under 20 seconds and most arrive within 24 hours; bank-funded or exotic corridors take 1–2 working days.", sources: [WISE_FEES] },
  remitly: { label: "Minutes (Express) to 3–5 business days", detail: "Remitly offers Express delivery (minutes via debit/credit card) and Economy delivery (3–5 business days via bank account).", sources: [src("Remitly · Delivery speeds", "https://remitly.com/us/en/money-transfer/large-amounts")] },
  xoom: { label: "Minutes to 1–3 business days", detail: "Xoom says card and PayPal-funded transfers to eligible banks, wallets or cash pickup arrive in minutes; bank-funded transfers can take 1–3 business days.", sources: [src("Xoom · Transfer speeds", "https://www.xoom.com/legal/xoom-transfer-fees")] },
  paypal: { label: "Minutes (wallet) to 1–3 business days", detail: "PayPal wallet-to-wallet transfers post in minutes; withdrawals to a linked bank account typically take 1–3 business days.", sources: [src("PayPal · Consumer fees", "https://www.paypal.com/us/digital-wallet/paypal-consumer-fees")] },
  revolut: { label: "Seconds to 3–5 business days", detail: "Revolut-to-Revolut and local instant transfers (FPS/SEPA Instant) arrive in seconds; international SWIFT bank transfers take 1–5 business days.", sources: [src("Revolut · Outbound transfers", "https://help.revolut.com/help/transfers/outbound-transfers/are-there-any-transfer-limits-on-sending-money-to-a-bank-account/transfer-limits-to-send-money/")] },
  "western-union": { label: "Minutes (cash/card) to 1–5 business days", detail: "Western Union cash pickup and card-funded payouts often arrive in minutes; bank-account transfers take 1–5 business days depending on destination.", sources: [src("Western Union · Terms", "https://www.westernunion.com/us/en/transfer-limits.html")] },
  moneygram: { label: "Minutes (cash/wallet) to 1–3 business days", detail: "MoneyGram cash pickup and debit-funded payouts often arrive in minutes; bank-funded transfers typically settle within 1–3 business days.", sources: [src("MoneyGram · FAQ", "https://www.moneygram.com/us/en/help-center/faq/send-receive/us-federal-remittance-tax/what-is-the-u-s-federal-remittance-tax")] },
  "world-remit": { label: "Minutes to 1–2 business days", detail: "WorldRemit mobile-money and cash-pickup transfers usually arrive within minutes; bank deposits typically settle within 1–2 business days.", sources: [src("WorldRemit · FAQ", "https://www.worldremit.com/en/faq")] },
  "taptap-send": { label: "Seconds to minutes", detail: "Taptap Send says over 90% of card-funded transfers to mobile wallets and supported banks arrive within minutes.", sources: [src("Taptap Send", "https://www.taptapsend.com/")] },
  sendwave: { label: "Seconds to minutes", detail: "Sendwave says most debit-card transfers to mobile-money wallets and partner banks arrive within seconds to minutes.", sources: [src("Sendwave · Support", "https://www.sendwave.com/en/support")] },
  lemfi: { label: "Minutes", detail: "LemFi says most transfers to supported banks and mobile wallets arrive within minutes once funded.", sources: [src("LemFi · Support", "https://support.lemfi.com/hc/en-us/articles/45776845553809-What-fees-will-I-pay")] },
  aspora: { label: "Minutes to 1 business day", detail: "Aspora says instant-funded transfers to Indian banks often arrive in minutes, while standard bank transfers settle within 1 business day.", sources: [src("Aspora · Transfers", "https://www.aspora.com/help/us/transfers")] },
  xe: { label: "Minutes to 1–4 business days", detail: "Xe says card-funded transfers often arrive within minutes and bank-funded transfers typically settle in 1–4 business days.", sources: [src("Xe · Fees & timing", "https://help.xe.com/hc/en-gb/articles/360019908677-What-are-the-fees-for-sending-money")] },
  ria: { label: "Minutes (card/cash) to 1–4 business days", detail: "Ria says debit/credit card and cash-pickup transfers typically deliver in minutes to hours, while bank-funded transfers take 1–4 business days.", sources: [src("Ria Money Transfer", "https://www.riamoneytransfer.com/en-us/send-money-to-india/")] },
  paysend: { label: "Minutes to 1–3 business days", detail: "Paysend card-to-card transfers typically arrive in minutes; bank-account transfers settle in 1–3 business days.", sources: [src("Paysend", "https://paysend.com")] },
  instarem: { label: "Instant to 1–2 business days", detail: "Instarem says many local-rail corridors settle within minutes to same day; standard international transfers take 1–2 business days.", sources: [src("Instarem", "https://www.instarem.com/")] },
  ofx: { label: "1–2 business days", detail: "OFX says major-currency bank transfers typically arrive within 1–2 business days once OFX receives your funds.", sources: [src("OFX · Fee schedule", "https://ofx.com/en-us/legal/fee-schedule")] },
  airwallex: { label: "Same day to 1–3 business days", detail: "Airwallex local-rail payouts often settle same-day or within 1 business day; SWIFT wires take 1–3 business days.", sources: [src("Airwallex · Fee schedule", "https://www.airwallex.com/en-us/terms/fee-schedule")] },
  payoneer: { label: "1–3 business days", detail: "Payoneer says local bank withdrawals typically arrive in 1–2 business days (up to 3–5 business days for select corridors).", sources: [src("Payoneer · Pricing", "https://www.payoneer.com/pricing/")] },
  skydo: { label: "Within 24–48 hours", detail: "Skydo says local-rail USD/GBP/EUR/CAD/AUD export collections typically settle into your Indian bank account within 24–48 hours with instant FIRA.", sources: [src("Skydo", "https://www.skydo.com/send-money-to-india")] },
  infinity: { label: "Within 24 hours", detail: "Infinity says verified international bank-transfer export receipts typically settle into Indian bank accounts within 24 hours with automatic FIRA.", sources: [src("Infinity", "https://www.infinityapp.in/faqs/articles/what-infinity-charges-for-bank-transfer-payments")] },
  mulya: { label: "24–48 hours", detail: "Mulya says international bank collections settle in INR within 24–48 hours and issues FIRS within 24 hours.", sources: [src("Mulya", "https://support.mulya.co/all-about-mulya-fees/355SkxzLmGBVnEpM1FjVqN/what-is-the-fees-charged-by-mulya/q7nerJsqcrvzR4ymt9ChnA")] },
  payglocal: { label: "1–2 business days", detail: "PayGlocal says multi-currency account export receipts settle in INR within 1–2 business days after invoice upload.", sources: [src("PayGlocal", "https://payglocal.in/multi-currency-accounts")] },
  winvesta: { label: "1–2 business days", detail: "Winvesta says local-rail withdrawals from Global Collections Accounts to Indian banks settle in 1–2 business days.", sources: [src("Winvesta", "https://www.winvesta.in/faqs/global-collections-account/what-are-the-charges-for-the-global-collections-account")] },
  xflow: { label: "1 business day", detail: "Xflow says USD ACH and local export collections typically settle into your Indian bank account in 1 business day.", sources: [src("Xflow", "https://www.xflowpay.com/pricing")] },
  payzoll: { label: "1–2 business days", detail: "PayZoll says verified international export collections settle to your Indian bank account within 1–2 business days.", sources: [src("PayZoll", "https://payzoll.finance/payzoll-vs-skydo")] },
  dashx: { label: "Within 24 hours", detail: "DashX says fiat and stablecoin export collections settle to Indian bank accounts within 24 hours with free eFIRA.", sources: [src("DashX", "https://dashx.xyz/pricing")] },
  briskpe: { label: "24–48 hours", detail: "BRISKPE says export collections typically settle into Indian bank accounts within 24–48 hours.", sources: [src("BRISKPE", "https://www.briskpe.com/")] },
  razorpay: { label: "1–2 business days", detail: "Razorpay MoneySaver settles inward export bank transfers within 1–2 business days and issues digital FIRC within 24 hours.", sources: [src("Razorpay MoneySaver", "https://razorpay.com/accept-international-payments/money-saver/")] },
  salt: { label: "1–2 business days", detail: "Salt says inward international business transfers settle in 1–2 business days with free FIRA/FIRC within 24 hours.", sources: [src("Salt", "https://www.salt.pe/international-payments")] },
  eximpe: { label: "1–2 business days", detail: "EximPe settles PA-CB export collections in 1–2 business days with automated e-FIRA.", sources: [src("EximPe", "https://eximpe.com")] },
  "toucan-payments": { label: "1–2 business days", detail: "Toucan CrossStream settles export collections within 1–2 business days with automated e-FIRA.", sources: [src("Toucan Payments", "https://toucanpay.in")] },
  "careem-pay": { label: "Minutes to 1 working day", detail: "Careem Pay says UAE→India transfers often arrive within minutes (up to 1 working day depending on receiving bank).", sources: [src("Careem Pay", "https://www.careem.com/en-AE/send-money-faqs/")] },
  "al-ansari-exchange": { label: "Same day to 2 working days", detail: "Al Ansari Exchange says instant corridors arrive within minutes to same day; standard international bank credits take 1–2 working days.", sources: [src("Al Ansari Exchange", "https://alansariexchange.com/service/remittances/")] },
  "lulu-exchange": { label: "Same day to 2 working days", detail: "LuLu Exchange says UAE bank transfers to South Asia commonly settle same day to 2 working days.", sources: [src("LuLu Exchange", "https://luluexchange.com/services/money-transfer/")] },
  botim: { label: "Minutes to 1 business day", detail: "Botim Money says supported bank and wallet transfers from the UAE arrive in minutes to 1 business day.", sources: [src("Botim Money", "https://botim.me/international-transfer/")] },
  "eand-money": { label: "Minutes to 2 business days", detail: "e& money says instant cash/wallet transfers arrive in minutes and bank-account credits settle within 1–2 business days.", sources: [src("e& money", "https://www.eandmoney.com/en/send-abroad.html")] },
  wio: { label: "1–3 business days (SWIFT)", detail: "Wio Bank says outbound foreign-currency SWIFT transfers typically settle in 1–3 business days.", sources: [src("Wio Bank", "https://wio.io/pay-and-get-paid")] },
  "stc-bank": { label: "Minutes to 2 business days", detail: "STC Bank Western Union transfers arrive in minutes for cash/wallets and 1–2 business days for bank accounts.", sources: [src("STC Bank", "https://stcbank.com.sa")] },
  "atlantic-money": { label: "2 business days (Standard)", detail: "Atlantic Money says Standard (£3 / €3) transfers settle in 2 business days; optional Express settles faster for an extra fee.", sources: [src("Atlantic Money", "https://support.atlantic.money/")] },
  transfergo: { label: "30 minutes to 1 business day", detail: "TransferGo offers 30-minute Express delivery and Standard next-business-day bank delivery.", sources: [src("TransferGo", "https://www.transfergo.com/en/pricing")] },
  orbitremit: { label: "Same day to 2 business days", detail: "OrbitRemit says once your AUD/NZD deposit clears, most APAC bank payouts arrive within 1–2 business days.", sources: [src("OrbitRemit", "https://support.orbitremit.com/hc/en-us/articles/360015525917-How-much-does-it-cost-to-make-a-transfer")] },
  remitbee: { label: "Minutes to 2 business days", detail: "RemitBee says Interac e-Transfer and Balance-funded transfers often arrive in minutes to 1 business day; EFT takes 1–3 business days.", sources: [src("RemitBee", "https://www.remitbee.com/our-fees")] },
  currencyfair: { label: "1–2 business days", detail: "CurrencyFair says standard bank transfers typically arrive within 1–2 business days after funds clear.", sources: [src("CurrencyFair", "https://www.currencyfair.com/pricing/")] },
  "b-sharpe": { label: "Same day to 1 business day", detail: "b-sharpe says CHF/EUR exchanges funded before cut-off typically settle same day or on the next business day.", sources: [src("b-sharpe", "https://www.b-sharpe.com/en/compare-b-sharpe-fees/")] },
  currenxie: { label: "Same day to 2 business days", detail: "Currenxie local-rail payouts settle same day to 1 business day; SWIFT transfers take 1–3 business days.", sources: [src("Currenxie", "https://www.currenxie.com/en/pricing")] },
  statrys: { label: "Same day to 2 business days", detail: "Statrys local HK/SG/EU payouts settle same day to 1 business day; SWIFT wires settle in 1–3 business days.", sources: [src("Statrys", "https://statrys.com/pricing")] },
  worldfirst: { label: "Same day to 2 business days", detail: "WorldFirst says same-day local payouts are available on major corridors; SWIFT payouts take 1–3 business days.", sources: [src("WorldFirst", "https://www.worldfirst.com/uk/pricing/")] },
  flip: { label: "Minutes to 1 business day", detail: "Flip Globe (powered by Wise Platform) settles most Asian and European corridors in minutes to 1 business day.", sources: [src("Flip Globe", "https://flip.id")] },
  "sunway-money": { label: "Same day to 2 business days", detail: "Sunway Money says FPX-funded transfers to major APAC corridors typically arrive same day to 2 business days.", sources: [src("Sunway Money", "https://sunwaymoney.com")] },
  sentbe: { label: "Minutes to 1 business day", detail: "SentBe says Express payouts to supported Asian banks and wallets arrive in minutes to 1 business day.", sources: [src("SentBe", "https://www.sentbe.com")] },
  deemoney: { label: "1 working day (DeeNext)", detail: "DeeMoney says its DeeNext bank-transfer service typically delivers to destination banks within 1 working day.", sources: [src("DeeMoney", "https://www.deemoney.com")] },
  nala: { label: "Seconds to minutes", detail: "NALA says transfers to African and South Asian mobile wallets and supported banks typically arrive in seconds to minutes.", sources: [src("NALA", "https://www.nala.com/terms-of-service-usa")] },
  raenest: { label: "Minutes (local) / 1–2 days (ACH)", detail: "Raenest says incoming US ACH clears in 1–2 business days and local NGN/KES/GHS payouts settle within minutes.", sources: [src("Raenest", "https://help.raenest.com")] },
  grey: { label: "Minutes (local) / 1–3 days (ACH)", detail: "Grey says incoming USD/GBP/EUR bank deposits clear in 1–3 business days and local payouts settle in minutes.", sources: [src("Grey", "https://support.grey.co")] },
  cleva: { label: "Minutes (NGN) / 1–2 days (ACH)", detail: "Cleva says incoming US ACH clears in 1–2 business days and NGN bank withdrawals settle within minutes.", sources: [src("Cleva", "https://www.getcleva.com/pricing")] },
  shyft: { label: "1–3 business days (SWIFT)", detail: "Shyft outward international SWIFT transfers typically settle in 1–3 business days.", sources: [src("Shyft", "https://www.shyft.co.za/fees")] },
  global66: { label: "Instant (P2P) to 1–2 business days", detail: "Global66-to-Global66 transfers are instant; international bank payouts settle same day to 2 business days.", sources: [src("Global66", "https://www.global66.com/enviar-dinero/MX/US/")] },
  arq: { label: "Minutes (SPEI/Pix) to 1–2 days (ACH)", detail: "ARQ local SPEI/Pix conversions settle in minutes; US ACH and EUR SEPA transfers settle in 1–2 business days.", sources: [src("ARQ", "https://www.arqfinance.com/en-MX/help/articles/arq-costs-and-fees-mexico")] },
  higlobe: { label: "Minutes (SPEI/Pix) to 1–2 days (ACH)", detail: "Higlobe says local MXN SPEI and BRL Pix withdrawals arrive in minutes (transfers >10,000 USD may hold up to 24h).", sources: [src("Higlobe", "https://www.higlobe.com/pricing")] },
  husky: { label: "1–2 business days", detail: "Husky says incoming USD/EUR/GBP transfers typically convert and settle to your Brazilian BRL bank account within 1–2 business days.", sources: [src("Husky", "https://help.husky.io/hc/en-us/articles/360053702513-What-are-the-prices-at-Husky")] },
  "remessa-online": { label: "1–2 business days", detail: "Remessa Online says verified BRL international sends and receipts typically settle within 1–2 business days.", sources: [src("Remessa Online", "https://ajuda.remessaonline.com.br/hc/pt-br/articles/360019629454-Entenda-os-custos-e-taxas-da-sua-transfer%C3%AAncia-internacional-com-a-Remessa-Online")] },
  techfx: { label: "Same day to 1 business day", detail: "TechFX says PJ export wire receipts settled before cut-off credit your Brazilian bank account same day or next business day.", sources: [src("TechFX", "https://www.techfx.com.br/taxas-de-cambio-para-receber-do-exterior/")] },
};

const FACT_ALIASES: Record<string, string> = {
  worldremit: "world-remit",
  "xoom-paypal": "xoom",
  morse: "sling-money",
  dolarapp: "arq",
  geegpay: "raenest",
  vault: "venn",
  stcpay: "stc-bank",
  vance: "aspora",
  vertofx: "verto",
};

/** Statements for a provider on a route, or null when Railor has read none for it. */
export function providerFacts(slug: string, route: { from: string; to: string }): ProviderFacts | null {
  const raw = slug.replace(/^market:/, "").toLowerCase();
  const key = FACT_ALIASES[raw] ?? raw;
  if (key === "wise" || key === "wise-business") {
    const from = route.from.toUpperCase();
    const to = route.to.toUpperCase();
    const limitLines = [...new Set([from, to])].flatMap((code) => (WISE_LIMITS[code] ? [WISE_LIMITS[code]!] : []));
    const indiaTax = to === "INR" || from === "INR";
    return {
      reviewedAt: REVIEWED_AT,
      fees: {
        lines: [
          "Wise’s fee is worked out as a percentage of the amount you send, plus a fixed fee. The percentage varies by the currency you send, the currency the recipient gets and how you pay. Some ways to pay are free and others carry a fee.",
          "Wise publishes the percentage for each currency on its pricing page; the figure in this price is the one the quote used. Automatic high-value discounts apply above 20,000 GBP / 25,000 USD equivalent per calendar month.",
        ],
        sources: [WISE_FEES, WISE_PRICING],
      },
      limits: {
        lines: [
          "Wise has limits on how much you can send. They depend on the currencies you send to and from, and how you pay.",
          ...limitLines.map((item) => item.line),
        ],
        sources: [WISE_PRICING, ...limitLines.map((item) => item.source)],
      },
      ...(indiaTax ? {
        tax: {
          lines: ["Wise Business India adds 18% GST on conversion and e-FIRC fees for Indian business collections."],
          sources: [WISE_IN_BIZ],
        },
      } : {}),
      delivery: PROVIDER_DELIVERY.wise,
    };
  }
  const base = STATIC_FACTS[key];
  const delivery = base?.delivery ?? PROVIDER_DELIVERY[key];
  if (!base && !delivery) return null;
  if (!base) return { reviewedAt: REVIEWED_AT, delivery };
  return delivery && !base.delivery ? { ...base, delivery } : base;
}

/** The provider's own words are never replaced by Railor's placeholder: these are the placeholders. */
export const isPlaceholder = (text: string | null | undefined): boolean => !text || /unconfirmed|not verified|no verified|not supplied|confirm (at|with)|must be confirmed|no unlimited/i.test(text);
