CREATE TYPE "public"."conformance_status" AS ENUM('pass', 'fail', 'warning', 'not_tested', 'access_required');--> statement-breakpoint
CREATE TYPE "public"."conformance_test_kind" AS ENUM('authentication', 'sandbox_reachable', 'quote_api', 'quote_schema', 'idempotency', 'beneficiary_validation', 'webhook_signature', 'webhook_delivery', 'webhook_retry', 'status_endpoint', 'asset_network_availability', 'response_schema', 'docs_parity');--> statement-breakpoint
CREATE TYPE "public"."incident_severity" AS ENUM('minor', 'major', 'critical');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('investigating', 'identified', 'monitoring', 'resolved');--> statement-breakpoint
CREATE TABLE "api_usage_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"api_key_id" uuid,
	"endpoint" text NOT NULL,
	"day" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"latency_sum_ms" integer DEFAULT 0 NOT NULL,
	"latency_sample_count" integer DEFAULT 0 NOT NULL,
	"latency_max_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conformance_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_id" uuid NOT NULL,
	"status" "conformance_status" NOT NULL,
	"detail" text,
	"latency_ms" integer,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evidence_id" uuid
);
--> statement-breakpoint
CREATE TABLE "conformance_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"kind" "conformance_test_kind" NOT NULL,
	"label" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"severity" "incident_severity" NOT NULL,
	"status" "incident_status" DEFAULT 'investigating' NOT NULL,
	"source_url" text,
	"started_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_usage_daily" ADD CONSTRAINT "api_usage_daily_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_usage_daily" ADD CONSTRAINT "api_usage_daily_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conformance_runs" ADD CONSTRAINT "conformance_runs_test_id_conformance_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."conformance_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conformance_runs" ADD CONSTRAINT "conformance_runs_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conformance_tests" ADD CONSTRAINT "conformance_tests_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_usage_daily_unique" ON "api_usage_daily" USING btree ("organization_id","api_key_id","endpoint","day");--> statement-breakpoint
CREATE INDEX "api_usage_daily_org_day_idx" ON "api_usage_daily" USING btree ("organization_id","day");--> statement-breakpoint
CREATE INDEX "conformance_runs_test_idx" ON "conformance_runs" USING btree ("test_id","ran_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conformance_tests_provider_kind_idx" ON "conformance_tests" USING btree ("provider_id","kind");--> statement-breakpoint
CREATE INDEX "incidents_provider_idx" ON "incidents" USING btree ("provider_id","started_at");--> statement-breakpoint
CREATE INDEX "api_usage_key_idx" ON "api_usage" USING btree ("api_key_id","created_at");