ALTER TABLE decisions ADD COLUMN mode text NOT NULL DEFAULT 'optimize';--> statement-breakpoint
ALTER TABLE decisions ADD COLUMN proposed_executor text;--> statement-breakpoint
ALTER TABLE decisions ADD COLUMN created_by uuid REFERENCES users(id);--> statement-breakpoint
ALTER TABLE decisions ADD CONSTRAINT decisions_mode_check CHECK (mode IN ('enforce', 'optimize'));--> statement-breakpoint
ALTER TABLE decisions ADD CONSTRAINT decisions_executor_check CHECK ((mode = 'enforce' AND proposed_executor IS NOT NULL) OR (mode = 'optimize' AND proposed_executor IS NULL));--> statement-breakpoint
ALTER TABLE decision_candidates ADD COLUMN policy_evaluation jsonb NOT NULL DEFAULT '{}';--> statement-breakpoint
CREATE TABLE decision_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  decision_id uuid NOT NULL REFERENCES decisions(id),
  decision_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired','revoked')),
  requested_by uuid REFERENCES users(id),
  reviewed_by uuid REFERENCES users(id),
  comment text NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX decision_approvals_decision_idx ON decision_approvals(decision_id);--> statement-breakpoint
CREATE INDEX decision_approvals_org_idx ON decision_approvals(organization_id,status);--> statement-breakpoint
CREATE TABLE product_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id),
  kind text NOT NULL,
  target_id text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX product_events_org_idx ON product_events(organization_id,created_at);
