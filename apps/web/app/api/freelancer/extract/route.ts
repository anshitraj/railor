import { NextResponse } from "next/server";
import { extractInvoiceDocument, MAX_INVOICE_BYTES, validateInvoiceFile } from "@railor/core";
import { InvoiceError } from "../../../../lib/freelancer";
import { freelancerSession, invoiceHttpError, limitedBody } from "../../../../lib/freelancer-http";
import { consumeLimit } from "../../../../lib/rate-limit";
import { getSession } from "../../../../lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 35;
export async function POST(request: Request) {
  try {
    const { org } = await freelancerSession(request, true);
    if ((await getSession())?.user.email === "demo@railor.dev") throw new InvoiceError("The public demo is shared. Create your own workspace before uploading private documents.", 403);
    const body = await limitedBody(request, MAX_INVOICE_BYTES + 65_536);
    const type = request.headers.get("content-type") ?? "";
    if (!type.startsWith("multipart/form-data;")) throw new InvoiceError("Choose an invoice or receipt file.");
    let data: FormData;
    try { data = await new Response(body, { headers: { "Content-Type": type } }).formData(); } catch { throw new InvoiceError("The upload could not be read."); }
    if (data.get("consent") !== "true") throw new InvoiceError("Consent is required to send this document to Google Gemini.");
    const kind = data.get("kind");
    if (kind !== "invoice" && kind !== "receipt") throw new InvoiceError("Choose invoice or receipt extraction.");
    const file = data.get("file");
    if (!(file instanceof File)) throw new InvoiceError("Choose a PDF, PNG or JPEG file.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    try { validateInvoiceFile(bytes, file.type); } catch (error) { throw new InvoiceError((error as Error).message); }
    if (!process.env.GEMINI_API_KEY?.trim()) throw new InvoiceError("AI extraction is not configured. Enter details manually below.", 503);
    if (!(await consumeLimit("invoice-ai", org, 12, 3_600_000))) throw new InvoiceError("This workspace has used its 12 document extractions for this hour. Enter details manually or try later.", 429);
    try {
      const proposal = await extractInvoiceDocument(bytes, file.type, kind);
      return NextResponse.json({ proposal, extraction: "gemini", requiresReview: true }, { headers: { "Cache-Control": "private, no-store" } });
    } catch { throw new InvoiceError("Gemini could not read this document. Enter the details manually; no invoice or payment was saved.", 502); }
  } catch (error) { return invoiceHttpError(error); }
}
