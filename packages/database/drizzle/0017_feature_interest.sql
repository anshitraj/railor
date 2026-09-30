CREATE TABLE feature_interest (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 feature text NOT NULL,
 email text NOT NULL,
 user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX feature_interest_feature_email_idx ON feature_interest(feature, email);
