CREATE TABLE "web_fact_checks" (
 "key" text PRIMARY KEY,
 "provider_slug" text NOT NULL,
 "kind" text NOT NULL CHECK (kind IN ('corridor','profile')),
 "statement" text NOT NULL,
 "verdict" text NOT NULL CHECK (verdict IN ('supported','contradicted','unclear')),
 "quote" text,
 "source_url" text,
 "source_title" text,
 "official" boolean DEFAULT false NOT NULL,
 "search_queries" jsonb DEFAULT '[]'::jsonb NOT NULL,
 "pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
 "note" text,
 "model" text NOT NULL,
 "checked_at" timestamptz NOT NULL,
 "expires_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX "web_fact_checks_provider_idx" ON "web_fact_checks" ("provider_slug", "checked_at");
