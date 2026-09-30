import "server-only";
import { ZodError } from "zod";
import { PaymentError, type PaymentDeps } from "@railor/core";
import { buildFetchQuote } from "./decisions";

/** Dependencies the core payment service needs from the web app (credential-backed live quotes). */
export function paymentDeps(organizationId: string): PaymentDeps {
  return { fetchQuote: buildFetchQuote(organizationId, true) };
}

/** One mapping from any payment-path failure to an HTTP status + stable code + human sentence. */
export function describePaymentError(error: unknown): { status: number; code: string; message: string; fields?: Record<string, string> } {
  if (error instanceof PaymentError) return { status: error.status, code: error.code, message: error.message };
  if (error instanceof ZodError) {
    const fields = Object.fromEntries(error.issues.map((i) => [i.path.join("."), i.message]));
    return { status: 400, code: "invalid_request", message: error.issues[0]?.message ?? "Invalid request.", fields };
  }
  console.error(error);
  return { status: 500, code: "internal_error", message: "Something went wrong on Railor's side. Nothing was sent." };
}
