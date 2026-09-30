import Link from "next/link";
import { redirect } from "next/navigation";
import { listBeneficiaries } from "@railor/core";
import { getSession } from "../../../lib/auth";
import { getIntentOptions } from "../../../lib/reference";
import { ProductHeader } from "../../../components/app/product-ui";
import { BeneficiaryList } from "../../../components/app/payments/beneficiary-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Beneficiaries" };

export default async function BeneficiariesPage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const [beneficiaries, options] = await Promise.all([listBeneficiaries(session.organization.id), getIntentOptions()]);
  return (
    <div className="product-page space-y-6">
      <Link href="/app/payments" className="product-quiet-link">
        ← Payments
      </Link>
      <ProductHeader
        eyebrow="Money movement / recipients"
        title="Beneficiaries"
        description="The accounts you pay. Details are validated (IBAN checksums, ABA routing numbers, address formats), encrypted at rest and registered with each provider only when a payment first needs it."
        value={beneficiaries.length}
        valueLabel="saved"
      />
      <BeneficiaryList
        beneficiaries={beneficiaries.map((b) => ({ id: b.id, label: b.label, holderName: b.holderName, country: b.country, currency: b.currency, method: b.method, displayHint: b.displayHint }))}
        countries={options.countries}
        currencies={options.currencies}
        canEdit={session.role !== "viewer"}
      />
    </div>
  );
}
