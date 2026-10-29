import { redirect } from "next/navigation";
import { getSession } from "../../../../lib/auth";
import { BeneficiariesUnavailable } from "../../../../components/app/payments/beneficiaries-unavailable";

export const dynamic = "force-dynamic";
export const metadata = { title: "New payments unavailable" };

export default async function NewPaymentPage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  return <BeneficiariesUnavailable />;
}
