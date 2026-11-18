import { NextResponse } from "next/server";
import { extractPayslipDocument, MAX_INVOICE_BYTES, validateInvoiceFile } from "@railor/core";
import { getSession } from "../../../../lib/auth";
import { InvoiceError } from "../../../../lib/freelancer";
import { limitedBody } from "../../../../lib/freelancer-http";
import { consumeLimit } from "../../../../lib/rate-limit";
import { isCompanyWorkspace } from "../../../../lib/workspace-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 35;

const headers = { "Cache-Control": "private, no-store" };

/**
 * Reads one payslip for payroll pricing, on the invoice-extraction pattern:
 * explicit consent, the shared demo blocked, the file checked by its bytes,
 * then sent once to Google Gemini with no search tools or grounding. The file
 * is never stored and nothing from it is logged. Only the net pay, its
 * currency and the country come back, as a proposal the person reviews.
 */
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new InvoiceError("Open payroll pricing from Railor.", 403);
    const session = await getSession();
    if (!session?.organization) throw new InvoiceError("Sign in to a workspace first.", 401);
    if (!isCompanyWorkspace(session.organization.building)) throw new InvoiceError("Payslip import is part of the company workspace. Switch your workspace to Company to use it.", 403);
    if (!["owner", "admin", "member"].includes(session.role ?? "")) throw new InvoiceError("Your workspace role can price payroll but can’t upload documents.", 403);
    if (session.user.email === "demo@railor.dev") throw new InvoiceError("The public demo is shared. Create your own workspace before importing payslips.", 403);
    const body = await limitedBody(request, MAX_INVOICE_BYTES + 65_536);
    const type = request.headers.get("content-type") ?? "";
    if (!type.startsWith("multipart/form-data;")) throw new InvoiceError("Choose a payslip file.");
    let data: FormData;
    try { data = await new Response(body, { headers: { "Content-Type": type } }).formData(); } catch { throw new InvoiceError("The upload could not be read."); }
    if (data.get("consent") !== "true") throw new InvoiceError("Consent is required to send this payslip to Google Gemini.");
    const file = data.get("file");
    if (!(file instanceof File)) throw new InvoiceError("Choose a PDF, PNG or JPEG payslip.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    try { validateInvoiceFile(bytes, file.type); } catch (error) { throw new InvoiceError((error as Error).message); }
    if (!process.env.GEMINI_API_KEY?.trim()) throw new InvoiceError("Payslip reading isn’t set up. Add each net pay to a sheet instead.", 503);
    if (!(await consumeLimit("payslip-ai", session.organization.id, 30, 3_600_000))) throw new InvoiceError("This workspace has read 30 payslips this hour. Add the rest to a sheet, or try again later.", 429);
    try {
      const proposal = await extractPayslipDocument(bytes, file.type);
      return NextResponse.json({ proposal, extraction: "gemini", requiresReview: true }, { headers });
    } catch { throw new InvoiceError("Gemini couldn’t read this payslip. Nothing was saved; add its net pay to a sheet instead.", 502); }
  } catch (error) {
    if (error instanceof InvoiceError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    return NextResponse.json({ error: "Railor couldn’t read this payslip right now. Try again shortly." }, { status: 503, headers });
  }
}
