CREATE TYPE "public"."connection_state" AS ENUM('connected', 'not_connected', 'mixed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."cost_completeness" AS ENUM('complete', 'partial', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."decision_eligibility_status" AS ENUM('supported', 'additional_requirements', 'unavailable', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."decision_event_kind" AS ENUM('created', 'revalidation_requested', 'quote_expired', 'evidence_changed', 'policy_changed', 'provider_incident', 'route_changed', 'connection_state_changed', 'revalidated', 'recommendation_changed', 'approval_required');--> statement-breakpoint
CREATE TYPE "public"."decision_status" AS ENUM('allow', 'deny', 'no_verified_route', 'insufficient_data', 'approval_required');--> statement-breakpoint
CREATE TYPE "public"."policy_eval_result" AS ENUM('pass', 'fail', 'unknown', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."policy_status" AS ENUM('draft', 'active', 'superseded', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."quote_state" AS ENUM('live', 'indicative', 'historical', 'none');--> statement-breakpoint
CREATE TYPE "public"."route_confirmation" AS ENUM('confirmed', 'partially_confirmed', 'unconfirmed', 'unsupported', 'unknown');--> statement-breakpoint
CREATE TABLE "decision_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"decision_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"provider_slug" text NOT NULL,
	"provider_name" text NOT NULL,
	"route_id" uuid,
	"eligibility_status" "decision_eligibility_status" NOT NULL,
	"route_certainty" "route_confirmation",
	"policy_result" "policy_eval_result" NOT NULL,
	"policy_reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quote_snapshot" jsonb,
	"quote_type" text,
	"quote_observed_at" timestamp with time zone,
	"quote_expires_at" timestamp with time zone,
	"cost_completeness" "cost_completeness" DEFAULT 'unknown' NOT NULL,
	"reliability_snapshot" numeric(3, 2),
	"rank" integer,
	"selected" boolean DEFAULT false NOT NULL,
	"rejection_reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decision_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"decision_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "decision_event_kind" NOT NULL,
	"detail" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"intent_snapshot" jsonb NOT NULL,
	"policy_id" uuid NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"policy_version_number" integer NOT NULL,
	"engine_version" text NOT NULL,
	"status" "decision_status" NOT NULL,
	"recommended_provider_id" uuid,
	"recommended_provider_slug" text,
	"recommended_route_id" uuid,
	"certainty" "route_confirmation",
	"ranking_confidence" numeric(3, 2) NOT NULL,
	"quote_state" "quote_state" NOT NULL,
	"connection_state" "connection_state" NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"revalidation_required" boolean DEFAULT false NOT NULL,
	"decision_hash" text NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"explain" jsonb NOT NULL,
	"previous_decision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "policy_status" DEFAULT 'draft' NOT NULL,
	"active_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"status" "policy_status" DEFAULT 'draft' NOT NULL,
	"rules" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "decision_candidates" ADD CONSTRAINT "decision_candidates_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_candidates" ADD CONSTRAINT "decision_candidates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_candidates" ADD CONSTRAINT "decision_candidates_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_events" ADD CONSTRAINT "decision_events_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_events" ADD CONSTRAINT "decision_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_recommended_provider_id_providers_id_fk" FOREIGN KEY ("recommended_provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decision_candidates_decision_idx" ON "decision_candidates" USING btree ("decision_id");--> statement-breakpoint
CREATE INDEX "decision_candidates_org_idx" ON "decision_candidates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "decision_events_decision_idx" ON "decision_events" USING btree ("decision_id","created_at");--> statement-breakpoint
CREATE INDEX "decision_events_org_idx" ON "decision_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "decisions_org_idx" ON "decisions" USING btree ("organization_id","evaluated_at");--> statement-breakpoint
CREATE INDEX "decisions_previous_idx" ON "decisions" USING btree ("previous_decision_id");--> statement-breakpoint
CREATE INDEX "policies_org_idx" ON "policies" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_versions_policy_version_idx" ON "policy_versions" USING btree ("policy_id","version_number");--> statement-breakpoint
CREATE INDEX "policy_versions_org_idx" ON "policy_versions" USING btree ("organization_id");