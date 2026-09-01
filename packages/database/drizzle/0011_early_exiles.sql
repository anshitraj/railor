CREATE TYPE "public"."coverage_gap_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TABLE "corridor_demand" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"corridor_key" text NOT NULL,
	"query" jsonb NOT NULL,
	"search_count" integer DEFAULT 1 NOT NULL,
	"total_requested_volume" numeric(18, 2),
	"volume_search_count" integer DEFAULT 0 NOT NULL,
	"first_searched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_searched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coverage_gaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"corridor_key" text NOT NULL,
	"query" jsonb NOT NULL,
	"reasons" jsonb NOT NULL,
	"status" "coverage_gap_status" DEFAULT 'open' NOT NULL,
	"times_requested" integer DEFAULT 1 NOT NULL,
	"first_requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_change_event_id" uuid
);
--> statement-breakpoint
ALTER TABLE "coverage_gaps" ADD CONSTRAINT "coverage_gaps_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_gaps" ADD CONSTRAINT "coverage_gaps_resolved_change_event_id_change_events_id_fk" FOREIGN KEY ("resolved_change_event_id") REFERENCES "public"."change_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "corridor_demand_key_idx" ON "corridor_demand" USING btree ("corridor_key");--> statement-breakpoint
CREATE UNIQUE INDEX "coverage_gaps_provider_corridor_idx" ON "coverage_gaps" USING btree ("provider_id","corridor_key");--> statement-breakpoint
CREATE INDEX "coverage_gaps_status_idx" ON "coverage_gaps" USING btree ("status");
