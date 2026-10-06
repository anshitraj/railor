ALTER TABLE feature_interest ADD COLUMN IF NOT EXISTS provider_requested text;
--> statement-breakpoint
DROP INDEX IF EXISTS feature_interest_feature_email_idx;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS feature_interest_feature_email_provider_idx ON feature_interest(feature, email, coalesce(provider_requested, ''));
