-- Prepaid Railor credit. The balance is the sum of completed ledger entries;
-- there is no mutable balance column. Amounts are signed integer US cents.
CREATE TABLE "wallet_entries" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 "seq" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
 "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
 "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
 "kind" text NOT NULL,
 "status" text DEFAULT 'completed' NOT NULL,
 "amount_cents" integer NOT NULL,
 "currency" text DEFAULT 'USD' NOT NULL,
 "label" text NOT NULL,
 "reference" text,
 "idempotency_key" text NOT NULL,
 "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "wallet_entries_kind_check" CHECK (kind in ('signup_credit','top_up','promo_credit','usage','refund','adjustment')),
 CONSTRAINT "wallet_entries_status_check" CHECK (status in ('completed','pending','failed')),
 CONSTRAINT "wallet_entries_currency_check" CHECK (currency = 'USD'),
 CONSTRAINT "wallet_entries_sign_check" CHECK (amount_cents <> 0 and (kind = 'adjustment' or (kind = 'usage' and amount_cents < 0) or (kind <> 'usage' and amount_cents > 0)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_entries_idempotency_idx" ON "wallet_entries" ("organization_id", "idempotency_key");
--> statement-breakpoint
-- One signup credit per workspace, and one per person across all their workspaces.
CREATE UNIQUE INDEX "wallet_entries_signup_org_idx" ON "wallet_entries" ("organization_id") WHERE kind = 'signup_credit';
--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_entries_signup_user_idx" ON "wallet_entries" ("user_id") WHERE kind = 'signup_credit';
--> statement-breakpoint
CREATE INDEX "wallet_entries_history_idx" ON "wallet_entries" ("organization_id", "created_at", "seq");
--> statement-breakpoint
-- Append-only: the only update allowed is a deleted user's ON DELETE SET NULL.
CREATE FUNCTION "wallet_entries_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id IS NULL AND (to_jsonb(NEW) - 'user_id') = (to_jsonb(OLD) - 'user_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'wallet_entries is append-only; record a new entry instead';
END
$$;
--> statement-breakpoint
CREATE TRIGGER "wallet_entries_no_update" BEFORE UPDATE ON "wallet_entries" FOR EACH ROW EXECUTE FUNCTION "wallet_entries_append_only"();
--> statement-breakpoint
CREATE TABLE "wallet_promo_codes" (
 "code" text PRIMARY KEY,
 "amount_cents" integer NOT NULL,
 "label" text NOT NULL,
 "max_redemptions" integer,
 "starts_at" timestamptz,
 "expires_at" timestamptz,
 "active" boolean DEFAULT true NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "wallet_promo_codes_code_check" CHECK (code = upper(code) and code ~ '^[A-Z0-9-]{3,32}$'),
 CONSTRAINT "wallet_promo_codes_amount_check" CHECK (amount_cents > 0)
);
--> statement-breakpoint
CREATE TABLE "wallet_settings" (
 "organization_id" uuid PRIMARY KEY REFERENCES "organizations"("id") ON DELETE CASCADE,
 "auto_reload_enabled" boolean DEFAULT false NOT NULL,
 "auto_reload_threshold_cents" integer DEFAULT 500 NOT NULL,
 "auto_reload_amount_cents" integer DEFAULT 2000 NOT NULL,
 "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
 "updated_at" timestamptz DEFAULT now() NOT NULL
);
