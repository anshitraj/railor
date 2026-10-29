import { redirect } from "next/navigation";
import { requireSession } from "../../../lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workspace" };

/** The standalone self-reported checklist is no longer part of workspace setup. */
export default async function ReadinessPage() {
  await requireSession();
  redirect("/app");
}
