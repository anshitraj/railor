import { redirect } from "next/navigation";
import { getSession } from "../../../lib/auth";
import { listInvoices } from "../../../lib/freelancer";
import { getReferenceOptions } from "../../../lib/reference";
import { FreelancerWorkspace } from "../../../components/app/freelancer-workspace";
export const dynamic = "force-dynamic";
export const metadata = { title: "Freelancer · Get paid" };
const METHODS = new Set(["local_bank", "wire", "card", "transfer_service"]);
type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function FreelancerPage({ searchParams }: { searchParams: Search }) {
  const session = await getSession();
  if (!session?.organization) redirect("/login");
  const [invoices, options, params] = await Promise.all([listInvoices(session.organization.id), getReferenceOptions(), searchParams]);
  const country = session.organization.entityCountry ?? "IN";
  // Context carried over from the public price check. Each value is checked; anything odd is dropped.
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string).trim() : "");
  const amount = /^\d{1,9}(\.\d{1,2})?$/.test(one("amount")) && Number(one("amount")) > 0 ? one("amount") : undefined;
  const currency = options.currencies.some((c) => c.value === one("currency").toUpperCase()) ? one("currency").toUpperCase() : undefined;
  const method = METHODS.has(one("method")) ? (one("method") as "local_bank" | "wire" | "card" | "transfer_service") : undefined;
  const prefill = one("from") === "prices" && (amount || currency || method) ? { amount, currency, paymentMethod: method } : null;
  return <FreelancerWorkspace initialInvoices={invoices} countries={options.countries.map((c) => ({ value: c.value, label: c.label }))} currencies={options.currencies.map((c) => ({ value: c.value, label: c.label }))} country={country} settlementCurrency={options.currencyByCountry[country] ?? "INR"} canWrite={["owner", "admin", "member"].includes(session.role ?? "")} aiEnabled={Boolean(process.env.GEMINI_API_KEY?.trim())} sharedDemo={session.user.email === "demo@railor.dev"} prefill={prefill} />;
}
