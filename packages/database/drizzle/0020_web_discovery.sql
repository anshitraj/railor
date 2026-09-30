CREATE TABLE discovery_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK (kind IN ('corridor','provider')),
 query jsonb NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
 requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
 summary jsonb NOT NULL DEFAULT '{}'::jsonb,
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz,
 finished_at timestamptz
);
--> statement-breakpoint
CREATE INDEX discovery_jobs_status_idx ON discovery_jobs(status, created_at);
--> statement-breakpoint
CREATE TABLE provider_candidates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL,
 domain text NOT NULL,
 website_url text NOT NULL,
 evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
 corridor jsonb NOT NULL DEFAULT '{}'::jsonb,
 job_id uuid REFERENCES discovery_jobs(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
 provider_id uuid REFERENCES providers(id) ON DELETE SET NULL,
 reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 review_note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX provider_candidates_domain_idx ON provider_candidates(domain);
--> statement-breakpoint
CREATE INDEX provider_candidates_status_idx ON provider_candidates(status, last_seen_at);
