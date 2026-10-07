import { redirect } from "next/navigation";

export const metadata = { title: "Public remittance pricing providers" };

export default function PricingProvidersPage() {
  redirect("/providers");
}
