-- Rate updates are chosen as daily, weekly or smart (only when the best price
-- moves) instead of a percentage target, and people who are not signed in can ask
-- for them with an email address that they confirm from their own inbox.
ALTER TABLE "rate_alerts" ADD COLUMN "frequency" text DEFAULT 'weekly' NOT NULL;
--> statement-breakpoint
ALTER TABLE "rate_alerts" ADD CONSTRAINT "rate_alerts_frequency_check" CHECK ("frequency" in ('daily','weekly','smart'));
--> statement-breakpoint
CREATE TABLE "email_subscriptions" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "email" text NOT NULL,
 "source_currency" text NOT NULL,
 "destination_currency" text NOT NULL,
 "amount" numeric(18, 2) NOT NULL,
 "frequency" text DEFAULT 'weekly' NOT NULL,
 "confirm_token" text NOT NULL,
 "unsubscribe_token" text NOT NULL,
 "confirmed_at" timestamptz,
 "unsubscribed_at" timestamptz,
 "last_confirm_sent_at" timestamptz,
 "last_sent_at" timestamptz,
 "last_amount" numeric(20, 4),
 "created_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "email_subscriptions_frequency_check" CHECK ("frequency" in ('daily','weekly','smart'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "email_subscriptions_confirm_idx" ON "email_subscriptions" ("confirm_token");
--> statement-breakpoint
CREATE UNIQUE INDEX "email_subscriptions_unsubscribe_idx" ON "email_subscriptions" ("unsubscribe_token");
--> statement-breakpoint
CREATE INDEX "email_subscriptions_pair_idx" ON "email_subscriptions" ("email", "source_currency", "destination_currency");
--> statement-breakpoint
CREATE INDEX "email_subscriptions_due_idx" ON "email_subscriptions" ("confirmed_at", "unsubscribed_at", "last_sent_at");
