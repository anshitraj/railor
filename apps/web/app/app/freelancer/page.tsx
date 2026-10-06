import { redirect } from "next/navigation";
import { getSession } from "../../../lib/auth";
import { listInvoices } from "../../../lib/freelancer";
import { getReferenceOptions } from "../../../lib/reference";
import { FreelancerWorkspace } from "../../../components/app/freelancer-workspace";
export const dynamic = "force-dynamic";
export const metadata = { title: "Freelancer · Get paid" };
export default async function FreelancerPage() {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const [invoices, options] = await Promise.all([listInvoices(session.organization.id), getReferenceOptions()]);
  const country = session.organization.entityCountry ?? "IN";
  return <FreelancerWorkspace initialInvoices={invoices} countries={options.countries.map((c) => ({ value: c.value, label: c.label }))} currencies={options.currencies.map((c) => ({ value: c.value, label: c.label }))} country={country} settlementCurrency={options.currencyByCountry[country] ?? "INR"} canWrite={["owner", "admin", "member"].includes(session.role ?? "")} aiEnabled={Boolean(process.env.GEMINI_API_KEY?.trim())} sharedDemo={session.user.email === "demo@railor.dev"} />;
}
