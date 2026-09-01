/**
 * Named rails for the 11 of the V5-25 countries that had zero or incomplete
 * rail coverage (SA, JP, SE, NO, TR, KR, TH, VN, MY, CL, PE). Every name below
 * was verified live via Parallel.ai search this session against an official
 * central-bank/operator or reputable-secondary source — not carried over from
 * the user's own suggested list unverified. Two corrections that verification
 * caught: Norway's domestic instant rail is "Straks" (2013, "Straks 2.0" in
 * 2020), not TIPS/SCT Inst (those are the separate EUR cross-border bridge);
 * Korea's retail real-time interbank network is KFTC-operated, not a single
 * branded product the way PromptPay/DuitNow are — named literally rather than
 * inventing a brand that doesn't exist. Japan's BOJ-NET (large-value RTGS)
 * did not turn up a confirming source in this pass and is deliberately left
 * out rather than guessed — Zengin alone is what's verified.
 *
 *   pnpm --filter @railor/database v5-25-country-rails
 */
import "../dev-env.js";
import { getDb } from "../client.js";
import * as s from "../schema.js";

interface RailSpec {
  code: string;
  name: string;
  countryCode: string;
  category: (typeof s.paymentMethodEnum.enumValues)[number];
  description: string;
}

const RAILS: RailSpec[] = [
  { code: "SARIE", name: "SARIE", countryCode: "SA", category: "bank_transfer_local", description: "Saudi Arabia's RTGS backbone for SAR-denominated interbank settlement, operated by SAMA since 1997." },
  { code: "SARIE_INSTANT", name: "Sarie Instant Payments", countryCode: "SA", category: "bank_transfer_local", description: "SAMA's real-time retail instant-payment system, operated by Saudi Payments (a SAMA subsidiary), launched under the same 'Sarie' brand as the RTGS system." },
  { code: "ZENGIN", name: "Zengin System", countryCode: "JP", category: "bank_transfer_local", description: "Japan's domestic interbank credit-transfer and clearing network, operated by Zengin-net since 1973; covers nearly all private banks." },
  { code: "RIX", name: "RIX", countryCode: "SE", category: "bank_transfer_local", description: "Sveriges Riksbank's central payment system for interbank settlement in Sweden." },
  { code: "RIX_INST", name: "RIX-INST", countryCode: "SE", category: "bank_transfer_local", description: "Riksbank's instant-settlement variant of RIX." },
  { code: "SWISH", name: "Swish", countryCode: "SE", category: "wallet_transfer", description: "Sweden's dominant bank-backed instant P2P/consumer payment app, settling over RIX-INST." },
  { code: "STRAKS", name: "Straks", countryCode: "NO", category: "bank_transfer_local", description: "Norway's own real-time domestic (NOK) account-to-account clearing system, launched 2013 and upgraded to Straks 2.0 in 2020 — distinct from SEPA Instant/TIPS, which Norwegian banks use separately for EUR transfers." },
  { code: "NBO", name: "Norges Bank Settlement System (NBO)", countryCode: "NO", category: "bank_transfer_local", description: "Norway's central-bank settlement system for large-value and time-critical interbank transfers." },
  { code: "FAST_TR", name: "FAST", countryCode: "TR", category: "bank_transfer_local", description: "Turkey's Instant and Continuous Transfer of Funds System, operated under TCMB oversight; instant-payment limit raised to 300,000 TL in August 2026." },
  { code: "EFT_TR", name: "EFT (Turkey)", countryCode: "TR", category: "bank_transfer_local", description: "Turkey's Electronic Fund Transfer System (TCMB), the country's established (non-instant) interbank transfer system." },
  { code: "BOK_WIRE_PLUS", name: "BOK-Wire+", countryCode: "KR", category: "bank_transfer_local", description: "The Bank of Korea's large-value hybrid RTGS settlement system; completed ISO 20022 adoption in 2026." },
  { code: "KFTC_INTERBANK", name: "KFTC interbank real-time transfer network", countryCode: "KR", category: "bank_transfer_local", description: "South Korea's retail interbank real-time transfer network, operated by the Korea Financial Telecommunications & Clearings Institute (KFTC) — not a single consumer brand the way PromptPay/DuitNow are, but the shared rail underneath Korean banking-app transfers." },
  { code: "PROMPTPAY", name: "PromptPay", countryCode: "TH", category: "bank_transfer_local", description: "Thailand's national real-time account-to-account payment rail, operated by National ITMX (NITMX)." },
  { code: "BAHTNET", name: "BAHTNET", countryCode: "TH", category: "bank_transfer_local", description: "Bank of Thailand's large-value RTGS system." },
  { code: "PROMPTBIZ", name: "PromptBiz", countryCode: "TH", category: "bank_transfer_local", description: "Thailand's newer B2B-focused instant payment rail, alongside PromptPay and BAHTNET." },
  { code: "NAPAS247", name: "NAPAS 247", countryCode: "VN", category: "bank_transfer_local", description: "Vietnam's real-time interbank transfer rail, operated by NAPAS (National Payment Corporation of Vietnam) under the State Bank of Vietnam." },
  { code: "DUITNOW", name: "DuitNow", countryCode: "MY", category: "bank_transfer_local", description: "Malaysia's real-time payment rail (proxy/account-based), operated by PayNet." },
  { code: "RENTAS", name: "RENTAS", countryCode: "MY", category: "bank_transfer_local", description: "Malaysia's Real-time Electronic Transfer of Funds and Securities system — the country's RTGS, operated by PayNet under Bank Negara Malaysia oversight." },
  { code: "IBG", name: "Interbank GIRO (IBG)", countryCode: "MY", category: "bank_transfer_local", description: "Malaysia's batch interbank funds-transfer system, operated by PayNet." },
  { code: "TEF", name: "Transferencias en Línea (TEF)", countryCode: "CL", category: "bank_transfer_local", description: "Chile's real-time retail payment system, built in 2008; Banco Central de Chile is actively working on further interoperability standards for it as of 2026." },
  { code: "CCE_PE", name: "Cámara de Compensación Electrónica (CCE)", countryCode: "PE", category: "bank_transfer_local", description: "Peru's automated clearing house for retail/low-value payments, settled through the central bank's RTGS on a net deferred basis; recently added DNI-based instant interoperable payments (BCRP Circular 0017-2026)." },
  { code: "LBTR", name: "Sistema LBTR", countryCode: "PE", category: "bank_transfer_local", description: "Peru's Real-Time Gross Settlement system (Sistema de Liquidación Bruta en Tiempo Real), operated by BCRP for interbank transfers." },
];

async function main() {
  const db = await getDb();
  const result = await db
    .insert(s.namedRails)
    .values(RAILS.map((r) => ({ code: r.code, name: r.name, countryCode: r.countryCode, category: r.category, description: r.description })))
    .onConflictDoNothing({ target: s.namedRails.code })
    .returning({ code: s.namedRails.code });
  console.log(`inserted ${result.length}/${RAILS.length} new named rails: ${result.map((r) => r.code).join(", ")}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
