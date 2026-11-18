import { requireSession } from "../../../lib/auth";
import { CompanyGate } from "../../../components/app/company-gate";
import { PayrollPricing } from "../../../components/app/payroll-pricing";
import { ProductHeader } from "../../../components/app/product-ui";
import { getReferenceOptions } from "../../../lib/reference";
import { isCompanyWorkspace } from "../../../lib/workspace-profile";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payroll pricing" };

export default async function PayrollPage() {
  const session = await requireSession();
  if (!session.organization) return null;
  if (!isCompanyWorkspace(session.organization.building)) return <div className="product-page"><CompanyGate feature="Payroll pricing" next="/app/payroll" /></div>;
  const options = await getReferenceOptions();
  const home = options.currencyByCountry[session.organization.entityCountry ?? ""] ?? "USD";
  return (
    <div className="product-page space-y-7">
      <ProductHeader eyebrow="Company" title="Payroll pricing" description="Upload your payroll sheet and Railor prices every payout: the cheapest way to pay each person, what arrives, and how much the priciest option would cost you." />
      <PayrollPricing defaultCurrency={home} />
    </div>
  );
}
