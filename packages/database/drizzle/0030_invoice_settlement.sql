-- Quote-to-credit settlement for freelancer invoices.
-- A route check stores the prices Railor showed for an invoice and the one
-- the user chose; a receipt keeps the check it was expected under, the
-- charges taken from it, and the exchange-rate movement around it.
CREATE TABLE "freelancer_route_checks" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
 "invoice_id" uuid NOT NULL,
 "payment_method" text NOT NULL,
 "amount" numeric(20, 4) NOT NULL,
 "currency" text NOT NULL,
 "settlement_currency" text NOT NULL,
 "reference_rate" numeric(20, 8),
 "reference_source" text,
 "candidates" jsonb NOT NULL,
 "chosen_slug" text,
 "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL,
 "chosen_at" timestamptz,
 CONSTRAINT "freelancer_route_checks_invoice_fk" FOREIGN KEY ("organization_id", "invoice_id") REFERENCES "freelancer_invoices"("organization_id", "id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "freelancer_route_checks_invoice_idx" ON "freelancer_route_checks" ("organization_id", "invoice_id", "created_at");
--> statement-breakpoint
ALTER TABLE "freelancer_receipts" ADD COLUMN "route_check_id" uuid REFERENCES "freelancer_route_checks"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "freelancer_receipts" ADD COLUMN "quote_slug" text;
--> statement-breakpoint
ALTER TABLE "freelancer_receipts" ADD COLUMN "deductions" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "freelancer_receipts" ADD COLUMN "fx" jsonb;
