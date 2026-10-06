-- One address can independently request the same provider for multiple workspaces.
DROP INDEX IF EXISTS feature_interest_feature_email_provider_idx;
--> statement-breakpoint
CREATE UNIQUE INDEX feature_interest_feature_email_provider_idx ON feature_interest(feature, email, coalesce(provider_requested, ''), coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid));
