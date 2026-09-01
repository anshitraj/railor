ALTER TABLE "route_research_queue" DROP CONSTRAINT "route_research_queue_entity_country_countries_code_fk";
--> statement-breakpoint
ALTER TABLE "route_research_queue" DROP CONSTRAINT "route_research_queue_source_asset_assets_symbol_fk";
--> statement-breakpoint
ALTER TABLE "route_research_queue" DROP CONSTRAINT "route_research_queue_source_network_blockchains_slug_fk";
--> statement-breakpoint
ALTER TABLE "route_research_queue" DROP CONSTRAINT "route_research_queue_destination_country_countries_code_fk";
--> statement-breakpoint
ALTER TABLE "route_research_queue" DROP CONSTRAINT "route_research_queue_destination_currency_currencies_code_fk";
--> statement-breakpoint
ALTER TABLE "route_research_queue" DROP CONSTRAINT "route_research_queue_named_rail_named_rails_code_fk";
