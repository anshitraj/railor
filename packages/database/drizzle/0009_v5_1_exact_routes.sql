ALTER TABLE "provider_capabilities" ADD COLUMN "source_country" text;
--> statement-breakpoint
ALTER TABLE "provider_capabilities" ADD COLUMN "source_endpoint_type" "receiving_endpoint_type";
--> statement-breakpoint
ALTER TABLE "provider_capabilities" ADD COLUMN "source_named_rail" text;
--> statement-breakpoint
ALTER TABLE "provider_capabilities" ADD CONSTRAINT "provider_capabilities_source_country_countries_code_fk" FOREIGN KEY ("source_country") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "provider_capabilities" ADD CONSTRAINT "provider_capabilities_source_named_rail_named_rails_code_fk" FOREIGN KEY ("source_named_rail") REFERENCES "public"."named_rails"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "provider_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"product" "product_type" NOT NULL,
	"entity_country" text,
	"customer_type" "customer_type",
	"source_country" text,
	"source_endpoint_type" "receiving_endpoint_type",
	"source_named_rail" text,
	"source_asset" text,
	"source_network" text,
	"destination_country" text NOT NULL,
	"destination_currency" text,
	"destination_endpoint_type" "receiving_endpoint_type",
	"destination_named_rail" text,
	"payment_method" "payment_method",
	"min_amount" numeric(20, 8),
	"max_amount" numeric(20, 8),
	"amount_currency" text,
	"availability" "availability" NOT NULL,
	"note" text,
	"evidence_id" uuid,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_routes" ADD CONSTRAINT "provider_routes_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "provider_routes" ADD CONSTRAINT "provider_routes_entity_country_countries_code_fk" FOREIGN KEY ("entity_country") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "provider_routes" ADD CONSTRAINT "provider_routes_source_country_countries_code_fk" FOREIGN KEY ("source_country") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "provider_routes" ADD CONSTRAINT "provider_routes_source_named_rail_named_rails_code_fk" FOREIGN KEY ("source_named_rail") REFERENCES "public"."named_rails"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "provider_routes" ADD CONSTRAINT "provider_routes_source_asset_assets_symbol_fk" FOREIGN KEY ("source_asset") REFERENCES "public"."assets"("symbol") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "provider_routes" ADD CONSTRAINT "provider_routes_source_network_blockchains_slug_fk" FOREIGN KEY ("source_network") REFERENCES "public"."blockchains"("slug") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "provider_routes" ADD CONSTRAINT "provider_routes_destination_country_countries_code_fk" FOREIGN KEY ("destination_country") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "provider_routes" ADD CONSTRAINT "provider_routes_destination_currency_currencies_code_fk" FOREIGN KEY ("destination_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "provider_routes" ADD CONSTRAINT "provider_routes_destination_named_rail_named_rails_code_fk" FOREIGN KEY ("destination_named_rail") REFERENCES "public"."named_rails"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "provider_routes" ADD CONSTRAINT "provider_routes_amount_currency_currencies_code_fk" FOREIGN KEY ("amount_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "provider_routes" ADD CONSTRAINT "provider_routes_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "provider_routes_exact_lookup_idx" ON "provider_routes" USING btree ("provider_id", "product", "entity_country", "source_asset", "destination_country");
--> statement-breakpoint
CREATE INDEX "provider_routes_destination_idx" ON "provider_routes" USING btree ("destination_country", "destination_currency");
--> statement-breakpoint
CREATE TABLE "research_budget_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor" text NOT NULL,
	"scope_key" text NOT NULL,
	"max_spend_usd" numeric(12, 4) NOT NULL,
	"reserve_usd" numeric(12, 4) NOT NULL,
	"committed_usd" numeric(12, 4) DEFAULT '0' NOT NULL,
	"reserved_usd" numeric(12, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "research_budget_accounts_vendor_scope_idx" ON "research_budget_accounts" USING btree ("vendor", "scope_key");
--> statement-breakpoint
CREATE TABLE "research_spend_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"operation_type" text NOT NULL,
	"mode" text NOT NULL,
	"unit_count" integer NOT NULL,
	"estimated_usd" numeric(12, 4) NOT NULL,
	"status" text NOT NULL,
	"country" text,
	"provider" text,
	"summary" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "research_spend_ledger" ADD CONSTRAINT "research_spend_ledger_account_id_research_budget_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."research_budget_accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "research_spend_ledger_idempotency_idx" ON "research_spend_ledger" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE INDEX "research_spend_ledger_account_status_idx" ON "research_spend_ledger" USING btree ("account_id", "status", "created_at");
