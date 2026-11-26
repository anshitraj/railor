import { describe, expect, it } from "vitest";
import { assessCustomerProfile, CustomerContext, unconfirmedAssessment } from "../customer-profiles.js";
import { KYC_REVIEWED_AT, PROVIDER_KYC, kycFor, withKycFacts } from "../public-pricing/provider-kyc.js";

/** A provider's KYC page must be on the provider's own domain, never a third party's summary. */
const OWN_DOMAINS: Record<string, string[]> = {
  wise: ["wise.com"], remitly: ["remitly.com"], xoom: ["xoom.com"], paypal: ["paypal.com"], revolut: ["revolut.com"],
  "western-union": ["westernunion.com"], moneygram: ["moneygram.com"], "world-remit": ["worldremit.com"], "taptap-send": ["taptapsend.com"],
  sendwave: ["sendwave.com"], lemfi: ["lemfi.com"], aspora: ["aspora.com"], xe: ["xe.com"], ria: ["riamoneytransfer.com"],
  paysend: ["paysend.com"], instarem: ["instarem.com"], ofx: ["ofx.com"], airwallex: ["airwallex.com"], payoneer: ["payoneer.com"],
  circle: ["circle.com"], skydo: ["skydo.com"], infinity: ["infinityapp.in"], mulya: ["mulya.co"], payglocal: ["payglocal.in"],
  winvesta: ["winvesta.in"], xflow: ["xflowpay.com"], payzoll: ["payzoll.finance"], dashx: ["dashx.xyz"], briskpe: ["briskpe.com"],
  karbon: ["karboncard.com"], cashfree: ["cashfree.com"], pingpong: ["pingpongx.com"], razorpay: ["razorpay.com"], refrens: ["refrens.com"],
  salt: ["salt.pe"], "careem-pay": ["careem.com"], "al-ansari-exchange": ["alansariexchange.com"], "lulu-exchange": ["luluexchange.com"],
  botim: ["botim.me"], "eand-money": ["eandmoney.com"], wio: ["wio.io"], hubpay: ["hubpay.io"], "stc-bank": ["stcbank.com.sa"],
  "ooredoo-money": ["ooredoo.qa", "ooredoomoney.qa"], "beyon-money": ["beyonmoney.com"], "al-mulla-exchange": ["almullaexchange.com"],
  "al-muzaini": ["muzaini.com"], walletii: ["walletii.om"], eximpe: ["eximpe.com"], "toucan-payments": ["toucanpay.in"],
  hiwipay: ["hiwipay.com"], hopremit: ["moneyhop.co"], bookmyforex: ["bookmyforex.com"], copperx: ["copperx.io"], transfi: ["transfi.com"],
  "elevate-pay": ["elevatepay.co"], nsave: ["nsave.com"], "priyo-pay": ["priyo.com"], cenoa: ["cenoa.com"], uption: ["uption.com.tr"],
  ruul: ["ruul.io"], clearshift: ["clearshiftinc.com"], "covercy-pay": ["covercypay.com"], "atlantic-money": ["atlantic.money"],
  transfergo: ["transfergo.com"], orbitremit: ["orbitremit.com"], profee: ["profee.com"], remitbee: ["remitbee.com"],
  "sling-money": ["morsemoney.com"], sokin: ["sokin.com"], verto: ["verto.co"], currencyfair: ["currencyfair.com"],
  "b-sharpe": ["b-sharpe.com"], alpian: ["alpian.com"], venn: ["venn.ca"], loop: ["bankonloop.com"],
  "knightsbridge-fx": ["knightsbridgefx.com"], "flash-payments": ["flash-payments.com"], bcremit: ["bcremit.com"],
  currenxie: ["currenxie.com"], statrys: ["statrys.com"], worldfirst: ["worldfirst.com"], tazapay: ["tazapay.com"],
  straitsx: ["straitsx.com"], aspire: ["aspireapp.com"], "coins-ph": ["coins.ph"], flip: ["flip.id"], topremit: ["topremit.com"],
  "sunway-money": ["sunwaymoney.com"], pandaremit: ["pandaremit.com"], sentbe: ["sentbe.com"], wirebarley: ["wirebarley.com"],
  deemoney: ["deemoney.com"], nala: ["nala.com"], flutterwave: ["flutterwave.com"], "yellow-card": ["yellowcard.io"],
  raenest: ["raenest.com"], grey: ["grey.co"], cleva: ["getcleva.com"], afriex: ["afriex.com"], eversend: ["eversend.co"],
  shyft: ["shyft.co.za"], futureforex: ["futureforex.co.za"], "mama-money": ["mamamoney.co.za"], global66: ["global66.com"],
  arq: ["arqfinance.com"], "felix-pago": ["felixpago.com"], bitso: ["bitso.com"], blindpay: ["blindpay.com"],
  "mural-pay": ["muralpay.com"], dlocal: ["dlocalgo.com", "dlocal.com"], higlobe: ["higlobe.com"], grabrfi: ["grabrfi.com"],
  husky: ["husky.io"], "remessa-online": ["remessaonline.com.br"], techfx: ["techfx.com.br"], takenos: ["takenos.com"],
  wallbit: ["wallbit.io"], "vita-wallet": ["vitawallet.io"], belo: ["belo.app"],
  "hdfc-bank": ["hdfc.bank.in", "hdfcbank.com"], "icici-bank": ["icici.bank.in", "icicibank.com"],
  "state-bank-of-india": ["sbi.co.in", "sbi.bank.in"], "idfc-first-bank": ["idfcfirst.bank.in", "idfcfirstbank.com"],
  "canara-bank": ["canarabank.bank.in", "canarabank.com"],
  transak: ["transak.com"], moonpay: ["moonpay.com"], "ramp-network": ["rampnetwork.com", "ramp.network"],
  banxa: ["banxa.com"], mercuryo: ["mercuryo.io"], "alchemy-pay": ["alchemypay.org"], guardarian: ["guardarian.com"],
  stripe: ["stripe.com"], coinbase: ["coinbase.com"], bridge: ["bridge.xyz"], nium: ["nium.com"], thunes: ["thunes.com"],
  rapyd: ["rapyd.net"], bvnk: ["bvnk.com"], conduit: ["conduit.financial", "conduitpay.com"],
  currencycloud: ["currencycloud.com"], "checkout-com": ["checkout.com"], paxos: ["paxos.com"],
  "mastercard-move": ["mastercard.com"], "visa-direct": ["visa.com"], ripple: ["ripple.com"], dtcpay: ["dtcpay.com"],
  "fomo-pay": ["fomopay.com"], "triple-a": ["triple-a.io"], clickpesa: ["clickpesa.com"], fonbnk: ["fonbnk.com"],
  koywe: ["koywe.com"], onafriq: ["onafriq.com"], openpayd: ["openpayd.com"], "banking-circle": ["bankingcircle.com"],
  unlimit: ["unlimit.com"], "zero-hash": ["zerohash.com"], "1money": ["1money.com"], sphere: ["spherepay.co"], brale: ["brale.xyz"],
  "currencies-direct": ["currenciesdirect.com"], torfx: ["torfx.com"], moneycorp: ["moneycorp.com"],
  transfermate: ["transfermate.com"], "equals-money": ["equalsmoney.com"], caxton: ["caxton.io"], fairfx: ["fairfx.com"],
  dahabshiil: ["dahabshiil.com"], pangea: ["pangeamoneytransfer.com"], "boss-money": ["bossrevolution.com", "bossmoney.com"],
  talkremit: ["talkremit.com"], "kabayan-remit": ["kabayanremit.com"], "opal-transfer": ["opaltransfer.com"],
  passto: ["passto.co.uk"], paga: ["mypaga.com"], bancoli: ["bancoli.com"], multipass: ["multipass.co"],
  "ifx-payments": ["ifxpayments.com"], lumon: ["lumonpay.com"], "sterling-fx": ["sterlingfx.co.uk"],
  "key-currency": ["keycurrency.co.uk"], "smart-currency-exchange": ["smartcurrencyexchange.com"], "regency-fx": ["regencyfx.com"],
  easebuzz: ["easebuzz.in"], pay10: ["pay10.in", "pay10.com"], "onramp-money": ["onramp.money"], onmeta: ["onmeta.in"],
  abound: ["joinabound.com"], remit2any: ["remit2any.com"], rupeeflo: ["rupeeflo.com"], payhere: ["payhere.lk"],
  "mobily-pay": ["mobilypay.sa"], d360: ["d360.com"], "bfc-pay": ["bfcpay.com", "bfc.com.bh", "bfcforex.com"],
  thawani: ["thawani.om"], neema: ["getneema.com"], okoora: ["okoora.com"], "chipper-cash": ["chippercash.com"],
  mukuru: ["mukuru.com"], accrue: ["useaccrue.com"], valr: ["valr.com"], fincra: ["fincra.com"],
  leatherback: ["leatherback.co"], nomad: ["nomadglobal.com"], littio: ["littio.co"], "el-dorado": ["eldorado.io"],
  utoppia: ["utoppia.com"], airtm: ["airtm.com"], astropay: ["astropay.com"], prex: ["prexcard.com"],
  rextie: ["rextie.com"], moneymatch: ["moneymatch.co"], merchantrade: ["merchantrademoney.com"],
  wallex: ["wallex.asia"], transwap: ["transwap.com"], youtrip: ["you.co"], xtransfer: ["xtransfer.com"],
  hanpass: ["hanpass.com", "hanpass.com.au"], moin: ["themoin.com"], "sbi-remit": ["remit.co.jp"],
  "smiles-remit": ["smileswallet.com"], "kyodai-remittance": ["kyodairemittance.com", "riamoneytransfer.com"],
  yuh: ["yuh.com"], "neon-ch": ["neon-free.ch"], qonto: ["qonto.com"], finom: ["finom.co"],
  "zen-com": ["zen.com"], walutomat: ["walutomat.pl", "walutomat.com"], "fin-do": ["fin.do"],
  mercury: ["mercury.com"], relay: ["relayfi.com"],
};
const onOwnDomain = (slug: string, url: string) => {
  const { protocol, hostname } = new URL(url);
  return protocol === "https:" && OWN_DOMAINS[slug]!.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
};

const person = { profile: "personal", country: "US", direction: "send", purpose: "personal" } as const;
const request = { sourceCurrency: "USD", destinationCurrency: "INR", amount: 1000, amountUsd: 1000, referenceRate: 90 };

describe("published KYC facts", () => {
  it("names a first-party page for every document list and every approval time", () => {
    for (const [slug, entries] of Object.entries(PROVIDER_KYC)) {
      expect(OWN_DOMAINS[slug], `${slug} needs its own domain listed in this test`).toBeDefined();
      for (const entry of entries) {
        expect(onOwnDomain(slug, entry.documentsUrl), `${slug} documents: ${entry.documentsUrl}`).toBe(true);
        if (entry.approvalTime) {
          expect(onOwnDomain(slug, entry.approvalTime.url), `${slug} time: ${entry.approvalTime.url}`).toBe(true);
          expect(entry.approvalTime.label.length).toBeGreaterThan(2);
          expect(entry.approvalTime.detail.length).toBeGreaterThan(20);
        }
      }
    }
  });

  it("never leaves an entry with neither a document list nor a note saying why", () => {
    for (const [slug, entries] of Object.entries(PROVIDER_KYC)) {
      for (const entry of entries) expect(entry.documents.length > 0 || Boolean(entry.documentsNote), `${slug}: ${entry.scope}`).toBe(true);
    }
  });

  it("covers the providers a comparison commonly shows", () => {
    for (const slug of ["wise", "remitly", "xoom", "revolut", "western-union", "moneygram", "world-remit", "taptap-send", "skydo", "payzoll", "xflow", "airwallex", "payoneer"]) {
      expect(PROVIDER_KYC[slug], slug).toBeDefined();
    }
  });
});

describe("kycFor", () => {
  it("gives a sender's own check when you send", () => {
    const kyc = kycFor("wise", person)!;
    expect(kyc).toMatchObject({ appliesTo: "you", match: "general", reviewedAt: KYC_REVIEWED_AT });
    expect(kyc.documents.join(" ")).toContain("passport");
    expect(kyc.approvalTime?.label).toBe("10 minutes to 2 working days");
  });

  it("says the sender verifies, not you, when a personal recipient reads a transfer service's rules", () => {
    expect(kycFor("remitly", { ...person, country: "IN", direction: "receive" })).toMatchObject({ appliesTo: "sender" });
  });

  it("prefers the page written for the reader's country", () => {
    expect(kycFor("taptap-send", person)).toMatchObject({ match: "country" });
    expect(kycFor("taptap-send", person)!.documents.join(" ")).toContain("US passport card");
    expect(kycFor("taptap-send", { ...person, country: "AE" })!.documents.join(" ")).toContain("Emirates ID");
    expect(kycFor("taptap-send", { ...person, country: "DE" })!.scope).toContain("Europe");
    // A country the provider wrote nothing for still gets a page, flagged as another country's.
    expect(kycFor("taptap-send", { ...person, country: "JP" })).toMatchObject({ match: "other_country" });
  });

  it("matches business receiving accounts in India to the account holder", () => {
    const business = { profile: "business", country: "IN", direction: "receive", purpose: "services" } as const;
    expect(kycFor("skydo", business)).toMatchObject({ appliesTo: "you", match: "country" });
    expect(kycFor("skydo", { ...business, profile: "freelancer" })).toMatchObject({ appliesTo: "you" });
    expect(kycFor("wise", business)).toMatchObject({ appliesTo: "you", match: "country" });
    expect(kycFor("wise", { ...business, profile: "freelancer" })!.documentsNote).toContain("personal PAN");
  });

  it("reports a provider that publishes no turnaround as null, never a guess", () => {
    expect(kycFor("western-union", person)).toMatchObject({ approvalTime: null });
    expect(kycFor("refrens", { profile: "business", country: "IN", direction: "receive" })).toMatchObject({ approvalTime: null });
    expect(kycFor("razorpay", { profile: "business", country: "IN", direction: "receive" })?.approvalTime?.label).toContain("1–2 business days");
  });

  it("covers expanded regional, UAE, Africa, LatAm, and APAC providers with strict profile gating", () => {
    expect(Object.keys(PROVIDER_KYC).length).toBeGreaterThanOrEqual(95);
    expect(kycFor("careem-pay", { profile: "personal", country: "AE", direction: "send" })?.approvalTime?.label).toBe("Up to 3 working days");
    expect(kycFor("aspora", { profile: "personal", country: "US", direction: "send" })?.documents.join(" ")).toContain("SSN");
    expect(kycFor("atlantic-money", { profile: "personal", country: "GB", direction: "send" })?.approvalTime?.label).toBe("Within 1 business day");
    expect(kycFor("higlobe", { profile: "freelancer", country: "MX", direction: "receive" })?.documents.join(" ")).toContain("INE");
    expect(kycFor("raenest", { profile: "freelancer", country: "NG", direction: "receive" })?.match).toBe("country");
    expect(kycFor("yellow-card", person)).toBeNull();
    expect(kycFor("yellow-card", { profile: "business", country: "NG", direction: "receive" })).not.toBeNull();
    expect(kycFor("morse", person)).toEqual(kycFor("sling-money", person));
  });

  it("covers Indian banks, core universe rails, established FX brokers and regional underdogs", () => {
    expect(Object.keys(PROVIDER_KYC).length).toBeGreaterThanOrEqual(200);
    expect(kycFor("hdfc-bank", { profile: "personal", country: "IN", direction: "send" })?.documents.join(" ")).toContain("PAN");
    expect(kycFor("icici-bank", { profile: "personal", country: "IN", direction: "send" })?.approvalTime).toBeNull();
    expect(kycFor("transak", person)?.approvalTime?.label).toContain("30 seconds");
    expect(kycFor("bridge", { profile: "business", country: "US", direction: "send" })?.documents.join(" ")).toContain("UBO");
    expect(kycFor("nium", { profile: "business", country: "SG", direction: "send" })?.approvalTime?.label).toContain("Real-time");
    expect(kycFor("currencies-direct", { profile: "personal", country: "GB", direction: "send" })?.approvalTime?.label).toBe("Minutes to 24 hours");
    expect(kycFor("mercury", { profile: "business", country: "US", direction: "send" })?.documents.join(" ")).toContain("EIN");
    expect(kycFor("qonto", { profile: "business", country: "FR", direction: "send" })?.approvalTime?.label).toBe("Within 1 business day");
  });

  it("returns nothing for providers Railor has no published facts for, and for the wrong profile", () => {
    expect(kycFor("market:not-a-provider", person)).toBeNull();
    expect(kycFor("airwallex", person)).toBeNull();
  });

  it("accepts market-feed slugs and the WorldRemit spelling", () => {
    expect(kycFor("market:remitly", person)).not.toBeNull();
    expect(kycFor("worldremit", person)).toEqual(kycFor("world-remit", person));
  });
});

describe("withKycFacts", () => {
  const context = CustomerContext.parse(person);

  it("replaces the generic placeholder with the provider's documents and adds its source", () => {
    const out = withKycFacts(unconfirmedAssessment(), "remitly", context);
    expect(out.verification.join(" ")).toContain("driver’s license");
    expect(out.verification.join(" ")).not.toContain("Confirm legal form");
    expect(out.kyc?.approvalTime?.label).toBe("Often within minutes");
    expect(out.sources.map((source) => source.url)).toContain("https://remitly.com/us/en/money-transfer/large-amounts");
  });

  it("keeps a provider-specific document list that is already there", () => {
    const specific = { ...unconfirmedAssessment(), verification: ["Company: business PAN and two director PAN cards."] };
    const out = withKycFacts(specific, "infinity", CustomerContext.parse({ profile: "business", country: "IN", direction: "receive", purpose: "services" }));
    expect(out.verification).toEqual(["Company: business PAN and two director PAN cards."]);
    expect(out.kyc?.approvalTime?.label).toBe("Within 1 working day");
  });

  it("leaves an unsupported route alone", () => {
    const unsupported = { ...unconfirmedAssessment(), status: "not_supported" as const };
    expect(withKycFacts(unsupported, "wise", context)).toBe(unsupported);
  });

  it("is applied to every assessment", () => {
    const wise = assessCustomerProfile("wise", context, request);
    expect(wise.kyc).toMatchObject({ appliesTo: "you" });
    expect(assessCustomerProfile("market:not-a-provider", context, request).kyc).toBeUndefined();
  });
});
