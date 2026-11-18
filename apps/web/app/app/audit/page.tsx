import { requireSession } from "../../../lib/auth";
import { CompanyGate } from "../../../components/app/company-gate";
import { PaymentAudit } from "../../../components/app/payment-audit";
import { ProductHeader } from "../../../components/app/product-ui";
import { isCompanyWorkspace } from "../../../lib/workspace-profile";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment audit" };

export default async function AuditPage() {
  const session = await requireSession();
  if (!session.organization) return null;
  if (!isCompanyWorkspace(session.organization.building)) return <div className="product-page"><CompanyGate feature="Payment audit" next="/app/audit" /></div>;
  return (
    <div className="product-page space-y-7">
      <ProductHeader eyebrow="Company" title="Payment audit" description="Match your provider’s payout report to your bank statement. See what arrived short, what’s missing and what was paid twice — in currency and basis points." />
      <PaymentAudit />
    </div>
  );
}
