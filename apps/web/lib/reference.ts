import { loadReferenceData } from "@railor/core";
import { ensureMigrated } from "@railor/database";
import type { PickerOption } from "@railor/ui";

export interface ReferenceOptions {
  countries: PickerOption[];
  currencies: PickerOption[];
  assets: PickerOption[];
  networks: PickerOption[];
  customerTypes: PickerOption[];
  products: PickerOption[];
  methods: PickerOption[];
  /** Specific named rails (UPI, CHAPS, SEPA_ICT_DE, ...) — independent of `methods`' generic buckets. */
  namedRails: PickerOption[];
}

const PRODUCTS: PickerOption[] = [
  { value: "off_ramp", label: "Off-ramp", popularity: 90 },
  { value: "on_ramp", label: "On-ramp", popularity: 85 },
  { value: "payout", label: "Payouts", popularity: 95 },
  { value: "collection", label: "Collections", popularity: 60 },
  { value: "virtual_account", label: "Virtual accounts", popularity: 70 },
  { value: "card_issuing", label: "Card issuing", popularity: 65 },
  { value: "card_funding", label: "Card funding", popularity: 40 },
  { value: "wallet", label: "Wallets", popularity: 45 },
  { value: "treasury", label: "Treasury", popularity: 40 },
];

const METHODS: PickerOption[] = [
  { value: "bank_transfer_local", label: "Local bank transfer", popularity: 95 },
  { value: "bank_transfer_swift", label: "SWIFT", popularity: 70 },
  { value: "sepa", label: "SEPA", popularity: 65 },
  { value: "faster_payments", label: "Faster Payments", popularity: 55 },
  { value: "ach", label: "ACH", popularity: 60 },
  { value: "wire", label: "Wire", popularity: 50 },
  { value: "card", label: "Card", popularity: 40 },
  { value: "wallet_transfer", label: "Mobile wallet", popularity: 35 },
  { value: "cash_pickup", label: "Cash pickup", popularity: 25 },
];

/** Picker data for every SmartPicker in the product, ordered by likelihood. */
export async function getReferenceOptions(): Promise<ReferenceOptions> {
  await ensureMigrated();
  const { countries, currencies, assets, chains, namedRails } = await loadReferenceData();

  return {
    countries: countries.map((c) => ({
      value: c.code,
      label: c.name,
      sublabel: c.region,
      emoji: c.flag,
      popularity: c.popularity,
    })),
    currencies: currencies.map((c) => ({
      value: c.code,
      label: `${c.code} — ${c.name}`,
      emoji: c.symbol ?? undefined,
      popularity: c.popularity,
    })),
    assets: assets.map((a) => ({
      value: a.symbol,
      label: a.symbol,
      sublabel: a.name,
      popularity: a.popularity,
    })),
    networks: chains.map((c) => ({
      value: c.slug,
      label: c.name,
      popularity: c.popularity,
    })),
    customerTypes: [
      { value: "business", label: "Business", popularity: 100 },
      { value: "individual", label: "Individual", popularity: 60 },
    ],
    products: PRODUCTS,
    methods: METHODS,
    namedRails: namedRails.map((r) => ({
      value: r.code,
      label: `${r.name} (${r.countryCode})`,
    })),
  };
}

export const FIELD_LABELS: Record<string, string> = {
  entityCountry: "Entity jurisdiction",
  customerType: "Customer type",
  sourceCountry: "Source country",
  destinationCountry: "Destination country",
  sourceAsset: "Asset",
  sourceNetwork: "Network",
  destinationCurrency: "Destination currency",
  paymentMethod: "Rail",
  /** Deliberately distinct from `paymentMethod`'s label ("Rail") — this is the specific named one. */
  namedRail: "Named rail",
  sourceNamedRail: "Source named rail",
  product: "Product",
  amount: "Amount",
};

export function optionsByField(ref: ReferenceOptions): Record<string, PickerOption[]> {
  return {
    entityCountry: ref.countries,
    sourceCountry: ref.countries,
    destinationCountry: ref.countries,
    destinationCurrency: ref.currencies,
    sourceAsset: ref.assets,
    sourceNetwork: ref.networks,
    customerType: ref.customerTypes,
    product: ref.products,
    paymentMethod: ref.methods,
    namedRail: ref.namedRails,
    sourceNamedRail: ref.namedRails,
  };
}
