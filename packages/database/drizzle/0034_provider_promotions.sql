CREATE TABLE "provider_promotions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider_slug" text NOT NULL REFERENCES "providers"("slug") ON DELETE CASCADE,
  "source_currency" text NOT NULL,
  "destination_currency" text NOT NULL,
  "payment_reference" text NOT NULL UNIQUE,
  "paid_usd_cents" integer NOT NULL CHECK ("paid_usd_cents" > 0),
  "confirmed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "confirmed_at" timestamptz NOT NULL DEFAULT now(),
  "ends_at" timestamptz NOT NULL CHECK ("ends_at" > "confirmed_at"),
  "revoked_at" timestamptz,
  CONSTRAINT "provider_promotions_distinct_currencies" CHECK ("source_currency" <> "destination_currency"),
  CONSTRAINT "provider_promotions_reference_present" CHECK (length(btrim("payment_reference")) > 0)
);
--> statement-breakpoint
CREATE INDEX "provider_promotions_pair_idx" ON "provider_promotions" ("source_currency", "destination_currency", "ends_at");
