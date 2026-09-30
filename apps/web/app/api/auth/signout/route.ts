import { NextResponse } from "next/server";
import { signOut } from "../../../../lib/auth";
import { appOrigin, safeReturnPath } from "../../../../lib/security";

export const runtime = "nodejs";

/** Signs out, then returns home — or to a same-origin `next` path (e.g. switching accounts to accept an invite). */
export async function POST(request: Request) {
  await signOut();
  let next = "/";
  try {
    const form = await request.formData();
    next = safeReturnPath(form.get("next"), "/");
  } catch {
    /* no body: go home */
  }
  return NextResponse.redirect(new URL(next, appOrigin()), { status: 303 });
}
