ALTER TABLE discovery_jobs DROP CONSTRAINT IF EXISTS discovery_jobs_kind_check;
--> statement-breakpoint
ALTER TABLE discovery_jobs ADD CONSTRAINT discovery_jobs_kind_check CHECK (kind IN ('corridor','provider','company'));
--> statement-breakpoint
ALTER TABLE named_rails ADD COLUMN IF NOT EXISTS source_url text;
--> statement-breakpoint
ALTER TABLE named_rails ADD COLUMN IF NOT EXISTS source_quote text;
--> statement-breakpoint
ALTER TABLE named_rails ADD COLUMN IF NOT EXISTS verified_at timestamptz;
