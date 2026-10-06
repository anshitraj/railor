import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { InvoiceError } from "./freelancer";
import { getSession } from "./auth";

export async function freelancerSession(request: Request, write: boolean) {
  if (write && request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) throw new InvoiceError("Open this form from Railor.", 403);
  const session = await getSession();
  if (!session?.organization) throw new InvoiceError("Sign in to a workspace first.", 401);
  if (write && !["owner", "admin", "member"].includes(session.role ?? "")) throw new InvoiceError("Your workspace role can view invoices but cannot change them.", 403);
  return { org: session.organization.id, user: session.user.id };
}
export async function limitedBody(request: Request, max: number) {
  if (Number(request.headers.get("content-length")) > max) throw new InvoiceError("The upload is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new InvoiceError("A request body is required.");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); throw new InvoiceError("The upload is too large.", 413); }
    chunks.push(value);
  }
  return Buffer.concat(chunks, size);
}
export function invoiceHttpError(error: unknown) {
  if (error instanceof InvoiceError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 600) }, { status: 400 });
  const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  if (code === "23505") return NextResponse.json({ error: "This invoice number or receipt reference is already saved. Use the existing record." }, { status: 409 });
  return NextResponse.json({ error: "Railor could not complete this request. Retry shortly; your saved invoices are safe." }, { status: 503 });
}
