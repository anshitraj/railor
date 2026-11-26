-- Rate alerts also send a scheduled price update (weekly or daily by plan) and a
-- "price moved" update. These two columns remember the last update and the best
-- price it showed. Both are nullable: an existing alert starts counting from its
-- next check instead of receiving a backlog.
ALTER TABLE "rate_alerts" ADD COLUMN "last_digest_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "rate_alerts" ADD COLUMN "last_digest_amount" numeric(20, 4);
