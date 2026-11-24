-- The last "where did the missing money go" investigation for an invoice, kept
-- so reopening the invoice shows it without asking the model again. The
-- receipt_key names the credits it was run for; it is stale once they change.
CREATE TABLE "freelancer_settlement_analyses" (
 "organization_id" uuid NOT NULL,
 "invoice_id" uuid NOT NULL,
 "receipt_key" text NOT NULL,
 "report" jsonb NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "freelancer_settlement_analyses_pk" PRIMARY KEY ("organization_id", "invoice_id"),
 CONSTRAINT "freelancer_settlement_analyses_invoice_fk" FOREIGN KEY ("organization_id", "invoice_id") REFERENCES "freelancer_invoices"("organization_id", "id") ON DELETE CASCADE
);
