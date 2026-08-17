import { NextResponse } from "next/server";
import { signOut } from "../../../../lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
