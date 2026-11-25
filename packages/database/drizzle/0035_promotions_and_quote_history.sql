-- One recorded quote per provider, corridor, amount, customer profile and UTC
-- day: what the provider showed when Railor priced that transfer for that kind
-- of customer (a business price can differ from a personal one). History charts read only
-- these rows, so a day Railor didn't price stays empty rather than invented.
-- A later quote on the same day replaces the earlier one.
CREATE TABLE "quote_snapshots" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "observed_on" date NOT NULL,
 "source_currency" text NOT NULL,
 "destination_currency" text NOT NULL,
 "amount" numeric(18, 2) NOT NULL,
 "profile" text DEFAULT 'personal' NOT NULL,
 "provider_slug" text NOT NULL,
 "provider_name" text NOT NULL,
 "category" text,
 "basis" text NOT NULL,
 "rate" numeric(24, 10),
 "fee" numeric(18, 2),
 "fee_currency" text,
 "recipient_amount" numeric(20, 2) NOT NULL,
 "mid_market_rate" numeric(24, 10),
 "source_url" text,
 "observed_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "quote_snapshots_amount_check" CHECK ("amount" > 0),
 CONSTRAINT "quote_snapshots_recipient_check" CHECK ("recipient_amount" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "quote_snapshots_day_idx" ON "quote_snapshots" ("source_currency","destination_currency","amount","profile","provider_slug","observed_on");
--> statement-breakpoint
CREATE INDEX "quote_snapshots_pair_idx" ON "quote_snapshots" ("source_currency","destination_currency","profile","observed_on");
--> statement-breakpoint
-- Offers a provider publishes (a fee-free first transfer, a better rate for new
-- customers). Entered by an operator with the provider's own page as the
-- source; shown beside that provider's price, never folded into it.
CREATE TABLE "provider_offers" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "provider_slug" text NOT NULL,
 "kind" text NOT NULL,
 "headline" text NOT NULL,
 "terms" text NOT NULL,
 "source_url" text NOT NULL,
 "source_currency" text,
 "destination_currency" text,
 "profiles" text[],
 "new_customers_only" boolean DEFAULT true NOT NULL,
 "starts_at" timestamptz,
 "ends_at" timestamptz,
 "active" boolean DEFAULT true NOT NULL,
 "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL,
 "updated_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "provider_offers_kind_check" CHECK ("kind" in ('fee_free','better_rate','bonus','other')),
 CONSTRAINT "provider_offers_source_check" CHECK ("source_url" like 'https://%'),
 CONSTRAINT "provider_offers_window_check" CHECK ("ends_at" is null or "starts_at" is null or "ends_at" > "starts_at")
);
--> statement-breakpoint
CREATE INDEX "provider_offers_provider_idx" ON "provider_offers" ("provider_slug","active");
--> statement-breakpoint
-- Discount codes for Railor's own plans and wallet top-ups. Railor checks the
-- code; for card checkouts the same code also exists at Dodo Payments (its id is
-- kept here) so Dodo charges the discounted price. A redemption is recorded when
-- the discounted checkout is paid, once per checkout.
CREATE TABLE "discount_codes" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "code" text NOT NULL,
 "description" text,
 "kind" text NOT NULL,
 "percent_bps" integer,
 "amount_off_cents" integer,
 "applies_to" text DEFAULT 'plan' NOT NULL,
 "plans" text[],
 "cycles" integer DEFAULT 1 NOT NULL,
 "max_redemptions" integer,
 "starts_at" timestamptz,
 "ends_at" timestamptz,
 "active" boolean DEFAULT true NOT NULL,
 "dodo_discount_id" text,
 "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL,
 "updated_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "discount_codes_code_check" CHECK ("code" ~ '^[A-Z0-9_-]{3,16}$'),
 CONSTRAINT "discount_codes_kind_check" CHECK (("kind" = 'percent' and "percent_bps" between 100 and 10000 and "amount_off_cents" is null) or ("kind" = 'amount' and "amount_off_cents" > 0 and "percent_bps" is null)),
 CONSTRAINT "discount_codes_applies_check" CHECK ("applies_to" in ('plan','top_up','any')),
 CONSTRAINT "discount_codes_cycles_check" CHECK ("cycles" between 1 and 24),
 CONSTRAINT "discount_codes_limit_check" CHECK ("max_redemptions" is null or "max_redemptions" > 0),
 CONSTRAINT "discount_codes_window_check" CHECK ("ends_at" is null or "starts_at" is null or "ends_at" > "starts_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "discount_codes_code_idx" ON "discount_codes" ("code");
--> statement-breakpoint
CREATE TABLE "discount_redemptions" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "discount_code_id" uuid NOT NULL REFERENCES "discount_codes"("id") ON DELETE CASCADE,
 "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
 "checkout_id" uuid NOT NULL REFERENCES "billing_checkouts"("id") ON DELETE CASCADE,
 "discount_cents" integer NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "discount_redemptions_checkout_idx" ON "discount_redemptions" ("checkout_id");
--> statement-breakpoint
CREATE INDEX "discount_redemptions_code_idx" ON "discount_redemptions" ("discount_code_id","organization_id");
--> statement-breakpoint
-- What the person is charged after a discount; null means the full price.
ALTER TABLE "billing_checkouts" ADD COLUMN "discount_code_id" uuid REFERENCES "discount_codes"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "billing_checkouts" ADD COLUMN "charge_cents" integer;
--> statement-breakpoint
ALTER TABLE "billing_checkouts" ADD CONSTRAINT "billing_checkouts_charge_check" CHECK ("charge_cents" is null or ("charge_cents" >= 0 and "charge_cents" <= "amount_cents"));
