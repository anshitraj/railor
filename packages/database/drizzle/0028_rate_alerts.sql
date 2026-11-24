-- Rate alerts: email a person when a saved pair's best complete price reaches
-- their target. One alert per saved transfer per person; deleting the saved
-- transfer deletes the alert. target_amount is in the destination currency.
CREATE TABLE "rate_alerts" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
 "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
 "saved_search_id" uuid NOT NULL REFERENCES "saved_searches"("id") ON DELETE CASCADE,
 -- The price check the alert repeats, resolved when it was set.
 "input" jsonb NOT NULL,
 "target_amount" numeric(20, 4) NOT NULL,
 "baseline_amount" numeric(20, 4),
 "active" boolean DEFAULT true NOT NULL,
 "last_checked_at" timestamptz,
 "last_best_amount" numeric(20, 4),
 "last_best_provider" text,
 "last_met" boolean DEFAULT false NOT NULL,
 "last_notified_at" timestamptz,
 "unsubscribe_token" text NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL,
 "updated_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "rate_alerts_target_check" CHECK (target_amount > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "rate_alerts_pair_user_idx" ON "rate_alerts" ("saved_search_id", "user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "rate_alerts_unsubscribe_idx" ON "rate_alerts" ("unsubscribe_token");
--> statement-breakpoint
CREATE INDEX "rate_alerts_due_idx" ON "rate_alerts" ("active", "last_checked_at");
