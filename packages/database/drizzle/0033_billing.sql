-- Card (Dodo Payments) and USDC (ArcPay) checkouts for plans and wallet
-- top-ups. One row per checkout Railor opened; the provider's own records are
-- the source of truth, and a row only turns "paid" after Railor reads the
-- payment back from the provider. The paid transition is a conditional update,
-- so a webhook and a status poll racing each other credit the workspace once.
CREATE TABLE "billing_checkouts" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
 "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
 "provider" text NOT NULL,
 "purpose" text NOT NULL,
 "plan" text,
 "amount_cents" integer NOT NULL,
 "status" text DEFAULT 'pending' NOT NULL,
 "test_mode" boolean DEFAULT false NOT NULL,
 "provider_session_id" text,
 "provider_payment_id" text,
 "provider_subscription_id" text,
 "checkout_url" text,
 "failure_reason" text,
 "paid_at" timestamptz,
 "last_checked_at" timestamptz,
 "created_at" timestamptz DEFAULT now() NOT NULL,
 "updated_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "billing_checkouts_provider_check" CHECK ("provider" in ('dodo','arcpay')),
 CONSTRAINT "billing_checkouts_purpose_check" CHECK ("purpose" in ('plan','top_up')),
 CONSTRAINT "billing_checkouts_plan_check" CHECK (("purpose" = 'plan') = ("plan" is not null) and ("plan" is null or "plan" in ('plus','pro','business'))),
 CONSTRAINT "billing_checkouts_status_check" CHECK ("status" in ('pending','paid','failed')),
 CONSTRAINT "billing_checkouts_amount_check" CHECK ("amount_cents" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_checkouts_session_idx" ON "billing_checkouts" ("provider","provider_session_id") WHERE "provider_session_id" is not null;
--> statement-breakpoint
CREATE INDEX "billing_checkouts_org_idx" ON "billing_checkouts" ("organization_id","created_at");
--> statement-breakpoint
-- A workspace's card subscription as the provider last reported it, so renewals
-- and cancellations find their workspace and the plans page can say when the
-- plan renews or ends.
CREATE TABLE "billing_subscriptions" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
 "provider" text NOT NULL,
 "provider_subscription_id" text NOT NULL,
 "provider_customer_id" text,
 "plan" text NOT NULL,
 "status" text NOT NULL,
 "current_period_end" timestamptz,
 "cancel_at_period_end" boolean DEFAULT false NOT NULL,
 "test_mode" boolean DEFAULT false NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL,
 "updated_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "billing_subscriptions_provider_check" CHECK ("provider" in ('dodo')),
 CONSTRAINT "billing_subscriptions_plan_check" CHECK ("plan" in ('plus','pro','business'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_subscriptions_provider_idx" ON "billing_subscriptions" ("provider","provider_subscription_id");
--> statement-breakpoint
CREATE INDEX "billing_subscriptions_org_idx" ON "billing_subscriptions" ("organization_id","updated_at");
