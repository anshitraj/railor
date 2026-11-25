import { notFound, redirect } from "next/navigation";
import { getBillingCheckout, getDb } from "@railor/database";
import { getSession } from "../../../../lib/auth";
import { refreshCheckout } from "../../../../lib/billing/service";
import { checkoutView } from "../../../../lib/billing/view";
import { CheckoutStatus } from "../../../../components/app/billing/checkout-status";
import styles from "../../../../components/app/billing/checkout-status.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment" };

/** Where the card checkout sends people back to, and where a USDC payment is watched from. */
export default async function BillingReturnPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const { checkout: id } = await searchParams;
  const db = await getDb();
  const found = id ? await getBillingCheckout(db, id) : null;
  if (!found || found.organizationId !== session.organization.id) notFound();
  const checkout = await refreshCheckout(found);
  return <div className={styles.page}><CheckoutStatus id={checkout.id} initial={await checkoutView(checkout, db)} /></div>;
}
