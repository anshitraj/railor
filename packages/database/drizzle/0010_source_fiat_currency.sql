ALTER TABLE "route_research_queue" ADD COLUMN "source_currency" text;
--> statement-breakpoint
ALTER TABLE "provider_capabilities" ADD COLUMN "source_currency" text;
--> statement-breakpoint
ALTER TABLE "provider_capabilities" ADD CONSTRAINT "provider_capabilities_source_currency_currencies_code_fk" FOREIGN KEY ("source_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "provider_routes" ADD COLUMN "source_currency" text;
--> statement-breakpoint
ALTER TABLE "provider_routes" ADD CONSTRAINT "provider_routes_source_currency_currencies_code_fk" FOREIGN KEY ("source_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
DROP INDEX "provider_routes_exact_lookup_idx";
--> statement-breakpoint
CREATE INDEX "provider_routes_exact_lookup_idx" ON "provider_routes" USING btree ("provider_id", "product", "entity_country", "source_asset", "source_currency", "destination_country");
