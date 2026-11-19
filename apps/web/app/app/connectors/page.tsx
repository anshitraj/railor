import { redirect } from "next/navigation";

/** The self-hosted runtime is no longer offered; old links go to the developer page. */
export default function ConnectorsPage() {
  redirect("/app/developers");
}
