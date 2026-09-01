CREATE TABLE "asset_network_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_reference_id" uuid NOT NULL,
	"network_name" text NOT NULL,
	"blockchain_slug" text,
	"source_url" text NOT NULL,
	"source_type" "source_type" NOT NULL,
	"verification_type" "verification_type" NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"last_verified_at" timestamp with time zone NOT NULL,
	"evidence_excerpt" text NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"status" text DEFAULT 'accepted' NOT NULL,
	"note" text,
	"input_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_symbol" text NOT NULL,
	"reference_source_id" text NOT NULL,
	"issuer" text NOT NULL,
	"reference_currency" text,
	"source_url" text NOT NULL,
	"source_type" "source_type" NOT NULL,
	"verification_type" "verification_type" NOT NULL,
	"source_as_of" timestamp with time zone,
	"retrieved_at" timestamp with time zone NOT NULL,
	"last_verified_at" timestamp with time zone NOT NULL,
	"evidence_excerpt" text NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"status" text DEFAULT 'accepted' NOT NULL,
	"note" text,
	"input_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"authority" text NOT NULL,
	"entity" text,
	"source_url" text NOT NULL,
	"source_type" "source_type" NOT NULL,
	"verification_type" "verification_type" NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"last_verified_at" timestamp with time zone NOT NULL,
	"evidence_excerpt" text NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"recommended_refresh_hours" integer NOT NULL,
	"input_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_network_references" ADD CONSTRAINT "asset_network_references_asset_reference_id_asset_references_id_fk" FOREIGN KEY ("asset_reference_id") REFERENCES "public"."asset_references"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_network_references" ADD CONSTRAINT "asset_network_references_blockchain_slug_blockchains_slug_fk" FOREIGN KEY ("blockchain_slug") REFERENCES "public"."blockchains"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_references" ADD CONSTRAINT "asset_references_asset_symbol_assets_symbol_fk" FOREIGN KEY ("asset_symbol") REFERENCES "public"."assets"("symbol") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_references" ADD CONSTRAINT "asset_references_reference_source_id_reference_sources_id_fk" FOREIGN KEY ("reference_source_id") REFERENCES "public"."reference_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_references" ADD CONSTRAINT "asset_references_reference_currency_currencies_code_fk" FOREIGN KEY ("reference_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_network_references_source_name_idx" ON "asset_network_references" USING btree ("asset_reference_id","network_name");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_references_asset_source_idx" ON "asset_references" USING btree ("asset_symbol","reference_source_id");--> statement-breakpoint
CREATE INDEX "reference_sources_url_idx" ON "reference_sources" USING btree ("source_url");