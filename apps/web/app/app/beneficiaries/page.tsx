import { redirect } from "next/navigation";
import { getSession } from "../../../lib/auth";
import { BeneficiariesUnavailable } from "../../../components/app/payments/beneficiaries-unavailable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Beneficiaries unavailable" };

export default async function BeneficiariesPage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  return <BeneficiariesUnavailable />;
}
