CREATE TABLE "freelancer_invoices" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
 "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
 "invoice_number" text NOT NULL, "client_name" text NOT NULL,
 "client_country" text NOT NULL, "account_country" text NOT NULL,
 "currency" text NOT NULL, "amount" numeric(20,4) NOT NULL CHECK (amount > 0),
 "settlement_currency" text NOT NULL, "due_date" text,
 "profile" text NOT NULL CHECK (profile IN ('freelancer','sole_proprietor')),
 "purpose" text NOT NULL CHECK (purpose IN ('services','goods')),
 "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "freelancer_invoices_number_idx" ON "freelancer_invoices" ("organization_id", "invoice_number");
--> statement-breakpoint
CREATE UNIQUE INDEX "freelancer_invoices_owner_idx" ON "freelancer_invoices" ("organization_id", "id");
--> statement-breakpoint
CREATE INDEX "freelancer_invoices_recent_idx" ON "freelancer_invoices" ("organization_id", "created_at");
--> statement-breakpoint
CREATE TABLE "freelancer_receipts" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
 "invoice_id" uuid NOT NULL,
 "recorded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
 "reference" text NOT NULL, "provider_name" text NOT NULL,
 "source_amount" numeric(20,4) NOT NULL CHECK (source_amount > 0), "source_currency" text NOT NULL,
 "settlement_amount" numeric(20,4) NOT NULL CHECK (settlement_amount > 0), "settlement_currency" text NOT NULL,
 "received_date" text NOT NULL, "request_id" uuid NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL,
 FOREIGN KEY ("organization_id", "invoice_id") REFERENCES "freelancer_invoices"("organization_id", "id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "freelancer_receipts_reference_idx" ON "freelancer_receipts" ("organization_id", "reference");
--> statement-breakpoint
CREATE UNIQUE INDEX "freelancer_receipts_retry_idx" ON "freelancer_receipts" ("organization_id", "request_id");
--> statement-breakpoint
CREATE INDEX "freelancer_receipts_invoice_idx" ON "freelancer_receipts" ("organization_id", "invoice_id");
