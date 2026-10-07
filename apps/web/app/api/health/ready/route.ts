import { NextResponse } from "next/server";
import { ensureMigrated, getDb } from "@railor/database";
import { sql } from "drizzle-orm";
import { appOrigin, paymentLink } from "../../../../lib/security";
import { smtpConfigured } from "../../../../lib/mail";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    appOrigin(); paymentLink();
    if (process.env.NODE_ENV === "production" && (!process.env.DATABASE_URL || process.env.AUTH_EMAIL_TRANSPORT !== "smtp" || !smtpConfigured())) throw new Error("Production configuration incomplete");
    await ensureMigrated();
    await (await getDb()).execute(sql`select 1`);
    return NextResponse.json({ status: "ready" });
  } catch {
    return NextResponse.json({ status: "not_ready" }, { status: 503 });
  }
}
