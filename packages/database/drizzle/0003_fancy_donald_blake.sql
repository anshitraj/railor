CREATE TYPE "public"."country_research_status" AS ENUM('pending', 'searching', 'extracting', 'validating', 'completed', 'failed', 'partial');--> statement-breakpoint
CREATE TYPE "public"."country_research_trigger" AS ENUM('cli', 'admin_refresh', 'scheduled');--> statement-breakpoint
CREATE TYPE "public"."country_source_authority" AS ENUM('official_regulator', 'government', 'official_network', 'official_provider', 'international_organization', 'reputable_secondary', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."country_source_category" AS ENUM('central_bank', 'banking', 'payment_rails', 'cross_border', 'stablecoin', 'crypto', 'aml', 'kyc', 'kyb', 'payout', 'government', 'provider', 'other');--> statement-breakpoint
CREATE TYPE "public"."country_source_type" AS ENUM('regulation', 'official_guidance', 'news_press', 'help_faq', 'report', 'wiki_reference', 'other');--> statement-breakpoint
CREATE TABLE "country_fact_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_iso2" text NOT NULL,
	"fact_key" text NOT NULL,
	"source_id" uuid NOT NULL,
	"confidence" numeric(3, 2),
	"excerpt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "country_profiles" (
	"iso2" text PRIMARY KEY NOT NULL,
	"iso3" text,
	"country_name" text,
	"currency_code" text,
	"currency_name" text,
	"central_bank_name" text,
	"regulator_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"psp_licensing_summary" text,
	"iban_supported" boolean,
	"iban_note" text,
	"swift_supported" boolean,
	"swift_note" text,
	"instant_payment_available" boolean,
	"instant_payment_system" text,
	"local_payment_rails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bank_account_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"routing_code_type" text,
	"routing_code_description" text,
	"crypto_status" text,
	"stablecoin_status" text,
	"kyc_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kyb_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"aml_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cross_border_restrictions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"supported_payout_currencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_researched_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "country_research_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_iso2" text NOT NULL,
	"status" "country_research_status" DEFAULT 'pending' NOT NULL,
	"trigger_type" "country_research_trigger" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"queries_count" integer DEFAULT 0 NOT NULL,
	"sources_discovered" integer DEFAULT 0 NOT NULL,
	"sources_used" integer DEFAULT 0 NOT NULL,
	"model_used" text,
	"usage_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"error_phase" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "country_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_iso2" text NOT NULL,
	"url" text NOT NULL,
	"domain" text NOT NULL,
	"title" text,
	"category" "country_source_category" NOT NULL,
	"source_type" "country_source_type" NOT NULL,
	"authority_level" "country_source_authority" DEFAULT 'unknown' NOT NULL,
	"published_at" timestamp with time zone,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content_hash" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "country_fact_sources" ADD CONSTRAINT "country_fact_sources_country_iso2_countries_code_fk" FOREIGN KEY ("country_iso2") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_fact_sources" ADD CONSTRAINT "country_fact_sources_source_id_country_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."country_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_profiles" ADD CONSTRAINT "country_profiles_iso2_countries_code_fk" FOREIGN KEY ("iso2") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_profiles" ADD CONSTRAINT "country_profiles_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_research_runs" ADD CONSTRAINT "country_research_runs_country_iso2_countries_code_fk" FOREIGN KEY ("country_iso2") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "country_sources" ADD CONSTRAINT "country_sources_country_iso2_countries_code_fk" FOREIGN KEY ("country_iso2") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "country_fact_sources_country_fact_idx" ON "country_fact_sources" USING btree ("country_iso2","fact_key");--> statement-breakpoint
CREATE INDEX "country_research_runs_country_started_idx" ON "country_research_runs" USING btree ("country_iso2","started_at");--> statement-breakpoint
CREATE INDEX "country_research_runs_status_idx" ON "country_research_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "country_sources_country_url_idx" ON "country_sources" USING btree ("country_iso2","url");--> statement-breakpoint
CREATE INDEX "country_sources_category_idx" ON "country_sources" USING btree ("country_iso2","category");