CREATE TABLE "route_research_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"input_hash" text NOT NULL,
	"source_name" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'RESEARCH_REQUIRED' NOT NULL,
	"entity_country" text,
	"customer_type" "customer_type",
	"source_asset" text,
	"source_network" text,
	"destination_country" text,
	"destination_currency" text,
	"endpoint_type" "receiving_endpoint_type",
	"named_rail" text,
	"query" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "route_research_queue" ADD CONSTRAINT "route_research_queue_entity_country_countries_code_fk" FOREIGN KEY ("entity_country") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_research_queue" ADD CONSTRAINT "route_research_queue_source_asset_assets_symbol_fk" FOREIGN KEY ("source_asset") REFERENCES "public"."assets"("symbol") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_research_queue" ADD CONSTRAINT "route_research_queue_source_network_blockchains_slug_fk" FOREIGN KEY ("source_network") REFERENCES "public"."blockchains"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_research_queue" ADD CONSTRAINT "route_research_queue_destination_country_countries_code_fk" FOREIGN KEY ("destination_country") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_research_queue" ADD CONSTRAINT "route_research_queue_destination_currency_currencies_code_fk" FOREIGN KEY ("destination_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_research_queue" ADD CONSTRAINT "route_research_queue_named_rail_named_rails_code_fk" FOREIGN KEY ("named_rail") REFERENCES "public"."named_rails"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "route_research_queue_input_hash_idx" ON "route_research_queue" USING btree ("input_hash");--> statement-breakpoint
CREATE INDEX "route_research_queue_status_idx" ON "route_research_queue" USING btree ("status","generated_at");