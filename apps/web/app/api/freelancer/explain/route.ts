import { NextResponse } from "next/server";
import { z } from "zod";
import { InvoiceError, investigateInvoice } from "../../../../lib/freelancer";
import { freelancerSession, invoiceHttpError, limitedBody } from "../../../../lib/freelancer-http";
import { consumeLimit } from "../../../../lib/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Gemini searches, Railor fetches the cited pages, then the strongest model reads them: well under a minute, but allow for a slow day.
export const maxDuration = 120;

/** "Where did the missing money go?" for one invoice. Sends amounts, currencies and country codes to Gemini; no names, no files. */
export async function POST(request: Request) {
  try {
    const { org } = await freelancerSession(request, true);
    const bytes = await limitedBody(request, 2_048);
    let input: unknown;
    try { input = JSON.parse(bytes.toString("utf8")); } catch { throw new InvoiceError("Choose an invoice to investigate."); }
    const { id } = z.object({ id: z.string().uuid() }).parse(input);
    if (!(await consumeLimit("shortfall", org, 12, 3_600_000))) throw new InvoiceError("This workspace has investigated 12 invoices this hour. Try again later.", 429);
    return NextResponse.json({ report: await investigateInvoice(org, id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return invoiceHttpError(error); }
}
