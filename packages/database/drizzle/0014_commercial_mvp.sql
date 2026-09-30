CREATE TYPE "public"."entitlement_plan" AS ENUM('free', 'founding');--> statement-breakpoint
CREATE TYPE "public"."entitlement_status" AS ENUM('active', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."provider_research_status" AS ENUM('pending', 'discovering', 'fetching', 'extracting', 'review', 'completed', 'partial', 'failed', 'budget_blocked');--> statement-breakpoint
CREATE TABLE "organization_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan" "entitlement_plan" DEFAULT 'free' NOT NULL,
	"status" "entitlement_status" DEFAULT 'active' NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"activation_reference" text,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"activated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_buckets_key_window_start_pk" PRIMARY KEY("key","window_start")
);--> statement-breakpoint
CREATE TABLE "provider_research_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign" text NOT NULL,
	"provider_id" uuid NOT NULL,
	"status" "provider_research_status" DEFAULT 'pending' NOT NULL,
	"account_label" text,
	"dimensions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_count" integer DEFAULT 0 NOT NULL,
	"claim_count" integer DEFAULT 0 NOT NULL,
	"spend_usd" numeric(12, 4) DEFAULT '0' NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "provider_research_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"claim_kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"value" jsonb NOT NULL,
	"quote" text NOT NULL,
	"source_urls" jsonb NOT NULL,
	"confidence" numeric(3, 2) DEFAULT '0.85' NOT NULL,
	"review_status" "review_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"published_evidence_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "research_spend_ledger" ADD COLUMN "campaign" text;--> statement-breakpoint
ALTER TABLE "research_spend_ledger" ADD COLUMN "account_label" text;--> statement-breakpoint
ALTER TABLE "research_spend_ledger" ADD COLUMN "input_tokens" integer;--> statement-breakpoint
ALTER TABLE "research_spend_ledger" ADD COLUMN "output_tokens" integer;--> statement-breakpoint
ALTER TABLE "research_spend_ledger" ADD COLUMN "actual_usd" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "organization_entitlements" ADD CONSTRAINT "organization_entitlements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_entitlements" ADD CONSTRAINT "organization_entitlements_activated_by_users_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_research_runs" ADD CONSTRAINT "provider_research_runs_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_research_claims" ADD CONSTRAINT "provider_research_claims_run_id_provider_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."provider_research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_research_claims" ADD CONSTRAINT "provider_research_claims_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_research_claims" ADD CONSTRAINT "provider_research_claims_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_research_claims" ADD CONSTRAINT "provider_research_claims_published_evidence_id_evidence_id_fk" FOREIGN KEY ("published_evidence_id") REFERENCES "public"."evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_entitlements_org_idx" ON "organization_entitlements" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_expires_idx" ON "rate_limit_buckets" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_research_runs_campaign_provider_idx" ON "provider_research_runs" USING btree ("campaign","provider_id");--> statement-breakpoint
CREATE INDEX "provider_research_runs_status_idx" ON "provider_research_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_research_claims_run_dedupe_idx" ON "provider_research_claims" USING btree ("run_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "provider_research_claims_review_idx" ON "provider_research_claims" USING btree ("review_status","created_at");
