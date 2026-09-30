ALTER TABLE provider_connections ADD COLUMN environment text NOT NULL DEFAULT 'sandbox';
--> statement-breakpoint
ALTER TABLE provider_connections ADD CONSTRAINT provider_connections_environment_check CHECK (environment IN ('sandbox','production'));
--> statement-breakpoint
ALTER TABLE provider_connections ADD COLUMN last_checked_at timestamptz;
--> statement-breakpoint
ALTER TABLE provider_connections ADD COLUMN last_check_detail text;
--> statement-breakpoint
CREATE UNIQUE INDEX provider_connections_org_provider_env_idx ON provider_connections(organization_id, provider_id, environment);
--> statement-breakpoint
CREATE TABLE beneficiaries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 label text NOT NULL,
 holder_type text NOT NULL CHECK (holder_type IN ('business','individual')),
 holder_name text NOT NULL,
 country text NOT NULL,
 currency text NOT NULL,
 method text NOT NULL CHECK (method IN ('bank_us','iban','gb','clabe','pix','crypto_address')),
 network text,
 display_hint text NOT NULL,
 encrypted_details text NOT NULL,
 fingerprint text NOT NULL,
 created_by uuid REFERENCES users(id),
 archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX beneficiaries_org_fingerprint_idx ON beneficiaries(organization_id, fingerprint) WHERE archived_at IS NULL;
--> statement-breakpoint
CREATE TABLE beneficiary_provider_refs (
 beneficiary_id uuid NOT NULL REFERENCES beneficiaries(id) ON DELETE CASCADE,
 provider_slug text NOT NULL,
 connection_id uuid NOT NULL,
 provider_ref text NOT NULL,
 status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (beneficiary_id, connection_id)
);
--> statement-breakpoint
CREATE TABLE payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 mode text NOT NULL CHECK (mode IN ('test','live')),
 status text NOT NULL CHECK (status IN ('requires_approval','ready','blocked','submitting','awaiting_funds','processing','completed','failed','returned','cancelled','unknown')),
 intent jsonb NOT NULL,
 amount numeric(24,8) NOT NULL,
 source_currency text NOT NULL,
 destination_currency text NOT NULL,
 destination_country text NOT NULL,
 beneficiary_id uuid NOT NULL REFERENCES beneficiaries(id),
 decision_id uuid REFERENCES decisions(id),
 pinned_provider text,
 route_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
 selected_provider text,
 provider_reference text,
 recipient_amount numeric(24,8),
 fee_amount numeric(24,8),
 fee_currency text,
 deposit_instructions jsonb,
 failure_code text,
 failure_message text,
 reference text,
 idempotency_key text,
 request_hash text,
 created_by uuid REFERENCES users(id),
 submitted_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 submitted_at timestamptz,
 completed_at timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX payments_org_idempotency_idx ON payments(organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
--> statement-breakpoint
CREATE INDEX payments_org_created_idx ON payments(organization_id, created_at);
--> statement-breakpoint
CREATE INDEX payments_open_idx ON payments(status) WHERE status IN ('submitting','awaiting_funds','processing','unknown');
--> statement-breakpoint
CREATE TABLE payment_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 attempt_number integer NOT NULL,
 provider_slug text NOT NULL,
 environment text NOT NULL,
 executor text NOT NULL,
 connection_id uuid,
 idempotency_key uuid NOT NULL,
 status text NOT NULL CHECK (status IN ('pending','accepted','rejected','unknown','completed','failed','returned','cancelled')),
 provider_reference text,
 provider_status text,
 error_code text,
 error_message text,
 request_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 response_snapshot jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX payment_attempts_number_idx ON payment_attempts(payment_id, attempt_number);
--> statement-breakpoint
CREATE UNIQUE INDEX payment_attempts_idempotency_idx ON payment_attempts(idempotency_key);
--> statement-breakpoint
CREATE INDEX payment_attempts_reference_idx ON payment_attempts(provider_slug, provider_reference);
--> statement-breakpoint
CREATE TABLE payment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 type text NOT NULL,
 from_status text,
 to_status text,
 source text NOT NULL CHECK (source IN ('user','api','provider_webhook','reconciler','system','admin')),
 actor_id uuid REFERENCES users(id),
 detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX payment_events_payment_idx ON payment_events(payment_id, created_at);
--> statement-breakpoint
CREATE TABLE org_payment_settings (
 organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 live_enabled boolean NOT NULL DEFAULT false,
 live_enabled_by uuid REFERENCES users(id),
 live_enabled_at timestamptz,
 live_note text,
 max_payment_amount numeric(24,8),
 daily_payment_amount numeric(24,8),
 routing_preset text NOT NULL DEFAULT 'balanced',
 preferred_providers jsonb NOT NULL DEFAULT '[]'::jsonb,
 blocked_providers jsonb NOT NULL DEFAULT '[]'::jsonb,
 fallback_enabled boolean NOT NULL DEFAULT true,
 max_attempts integer NOT NULL DEFAULT 2 CHECK (max_attempts BETWEEN 1 AND 5),
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE platform_settings (
 key text PRIMARY KEY,
 value jsonb NOT NULL,
 updated_by uuid REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE webhook_endpoints (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 url text NOT NULL,
 description text,
 mode text NOT NULL CHECK (mode IN ('test','live')),
 events jsonb NOT NULL DEFAULT '["payment.*"]'::jsonb,
 encrypted_secret text NOT NULL,
 secret_hint text NOT NULL,
 enabled boolean NOT NULL DEFAULT true,
 disabled_reason text,
 created_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE webhook_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 endpoint_id uuid NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 event_id uuid NOT NULL,
 event_type text NOT NULL,
 payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed')),
 attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 last_status_code integer,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz
);
--> statement-breakpoint
CREATE INDEX webhook_deliveries_due_idx ON webhook_deliveries(status, next_attempt_at);
--> statement-breakpoint
CREATE TABLE provider_webhook_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider_slug text NOT NULL,
 connection_id uuid NOT NULL,
 event_id text NOT NULL,
 payload_hash text NOT NULL,
 outcome text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX provider_webhook_events_dedupe_idx ON provider_webhook_events(provider_slug, connection_id, event_id);
