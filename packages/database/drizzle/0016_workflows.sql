CREATE TABLE discovery_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 fingerprint text NOT NULL, query jsonb NOT NULL, candidate jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','investigate','dismissed')),
 comment text NOT NULL DEFAULT '', reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz,
 discovered_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX discovery_reviews_dedupe_idx ON discovery_reviews(organization_id, fingerprint);
--> statement-breakpoint
CREATE TABLE connector_installations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 name text NOT NULL, token_hash text NOT NULL, revoked_at timestamptz, last_seen_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX connector_installations_token_idx ON connector_installations(token_hash);
--> statement-breakpoint
CREATE TABLE connector_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 installation_id uuid NOT NULL REFERENCES connector_installations(id), decision_id uuid NOT NULL REFERENCES decisions(id),
 decision_hash text NOT NULL, idempotency_key text NOT NULL, request_hash text NOT NULL, payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','claimed','succeeded','failed','unknown','blocked')),
 result jsonb, expires_at timestamptz NOT NULL, claimed_at timestamptz, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX connector_jobs_key_idx ON connector_jobs(organization_id,idempotency_key);
--> statement-breakpoint
CREATE UNIQUE INDEX connector_jobs_decision_idx ON connector_jobs(decision_id);
--> statement-breakpoint
CREATE INDEX connector_jobs_queue_idx ON connector_jobs(installation_id,status);
--> statement-breakpoint
CREATE TABLE decision_monitor_checks (
 decision_id uuid PRIMARY KEY REFERENCES decisions(id) ON DELETE CASCADE,
 checked_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE decision_candidates ADD COLUMN dependency_snapshot jsonb NOT NULL DEFAULT '{}';
--> statement-breakpoint
CREATE INDEX connector_jobs_org_recent_idx ON connector_jobs(organization_id, completed_at);
