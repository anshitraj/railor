CREATE TYPE "public"."api_access" AS ENUM('public', 'private', 'partner', 'none', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."receiving_endpoint_type" AS ENUM('bank_account', 'mobile_money', 'card', 'stablecoin_wallet', 'virtual_account', 'merchant_checkout', 'payment_link', 'local_instant_rail', 'cash_pickup');--> statement-breakpoint
CREATE TYPE "public"."stablecoin_mode" AS ENUM('direct_stablecoin', 'stablecoin_funded_fiat', 'fiat_only', 'stablecoin_only', 'hybrid', 'unknown');--> statement-breakpoint
CREATE TABLE "named_rails" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country_code" text NOT NULL,
	"category" "payment_method" NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "receiving_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"country_code" text NOT NULL,
	"endpoint_type" "receiving_endpoint_type" NOT NULL,
	"stablecoin_mode" "stablecoin_mode" DEFAULT 'unknown' NOT NULL,
	"customer_type" "customer_type",
	"incoming_asset" text,
	"incoming_network" text,
	"destination_currency" text,
	"named_rail" text,
	"payment_method" "payment_method",
	"settlement_estimate" text,
	"compliance_docs" text,
	"availability" "availability" DEFAULT 'unknown' NOT NULL,
	"note" text,
	"derivation" "derivation" DEFAULT 'source' NOT NULL,
	"evidence_id" uuid,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "api_access" "api_access" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "named_rails" ADD CONSTRAINT "named_rails_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receiving_endpoints" ADD CONSTRAINT "receiving_endpoints_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receiving_endpoints" ADD CONSTRAINT "receiving_endpoints_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receiving_endpoints" ADD CONSTRAINT "receiving_endpoints_incoming_asset_assets_symbol_fk" FOREIGN KEY ("incoming_asset") REFERENCES "public"."assets"("symbol") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receiving_endpoints" ADD CONSTRAINT "receiving_endpoints_incoming_network_blockchains_slug_fk" FOREIGN KEY ("incoming_network") REFERENCES "public"."blockchains"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receiving_endpoints" ADD CONSTRAINT "receiving_endpoints_destination_currency_currencies_code_fk" FOREIGN KEY ("destination_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receiving_endpoints" ADD CONSTRAINT "receiving_endpoints_named_rail_named_rails_code_fk" FOREIGN KEY ("named_rail") REFERENCES "public"."named_rails"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receiving_endpoints" ADD CONSTRAINT "receiving_endpoints_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receiving_endpoints_lookup_idx" ON "receiving_endpoints" USING btree ("provider_id","country_code","endpoint_type");--> statement-breakpoint
CREATE INDEX "receiving_endpoints_country_mode_idx" ON "receiving_endpoints" USING btree ("country_code","stablecoin_mode");