import { NextResponse } from "next/server";
import { z } from "zod";
import { InvoiceDraft, ReceiptDraft } from "@railor/core";
import { findInvoice, invoiceCsv, invoiceReceipts, listInvoices, recordInvoiceReceipt, routeInvoice, saveInvoice, InvoiceError } from "../../../lib/freelancer";
import { freelancerSession, invoiceHttpError, limitedBody } from "../../../lib/freelancer-http";
import { consumeLimit } from "../../../lib/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), draft: InvoiceDraft }),
  z.object({ action: z.literal("route"), id: z.string().uuid() }),
  z.object({ action: z.literal("receipt"), id: z.string().uuid(), draft: ReceiptDraft }),
]);
export async function GET(request: Request) {
  try {
    const { org } = await freelancerSession(request, false);
    const params = new URL(request.url).searchParams;
    if (params.has("id")) {
      const id = z.string().uuid().parse(params.get("id"));
      if (params.get("format") === "csv") return new Response(await invoiceCsv(org, id), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="invoice-${id}.csv"`, "Cache-Control": "private, no-store" } });
      await findInvoice(org, id);
      return NextResponse.json({ receipts: await invoiceReceipts(org, id) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json({ invoices: await listInvoices(org) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return invoiceHttpError(error); }
}
export async function POST(request: Request) {
  try {
    const { org, user } = await freelancerSession(request, true);
    const bytes = await limitedBody(request, 16_384);
    let input: unknown;
    try { input = JSON.parse(bytes.toString("utf8")); } catch { throw new InvoiceError("Enter valid invoice details."); }
    const body = Body.parse(input);
    if (!(await consumeLimit("freelancer", org, 60, 3_600_000))) throw new InvoiceError("Too many invoice requests. Try again later.", 429);
    if (body.action === "save") return NextResponse.json({ invoice: await saveInvoice(org, user, body.draft) }, { status: 201 });
    if (body.action === "receipt") return NextResponse.json({ receipt: await recordInvoiceReceipt(org, user, body.id, body.draft) });
    return NextResponse.json({ routing: await routeInvoice(org, body.id) });
  } catch (error) { return invoiceHttpError(error); }
}
