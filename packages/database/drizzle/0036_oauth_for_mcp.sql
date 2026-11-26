-- OAuth 2.1 for the MCP endpoint, so chat apps that cannot send an API-key
-- header (ChatGPT, Claude's custom connectors) can connect with a sign-in and
-- one approval. Codes and tokens are stored hashed; each grant is tied to an
-- identity API key, so usage is metered and access is revoked the same way as
-- any other key.
CREATE TABLE "oauth_clients" (
 "id" text PRIMARY KEY NOT NULL,
 "name" text NOT NULL,
 "redirect_uris" text[] NOT NULL,
 "source" text NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_codes" (
 "code_hash" text PRIMARY KEY NOT NULL,
 "client_id" text NOT NULL,
 "organization_id" uuid NOT NULL,
 "user_id" uuid NOT NULL,
 "api_key_id" uuid NOT NULL,
 "redirect_uri" text NOT NULL,
 "code_challenge" text NOT NULL,
 "scope" text NOT NULL,
 "expires_at" timestamptz NOT NULL,
 "consumed_at" timestamptz,
 "created_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "oauth_codes_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("id") ON DELETE cascade,
 CONSTRAINT "oauth_codes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade,
 CONSTRAINT "oauth_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
 CONSTRAINT "oauth_codes_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "oauth_codes_expiry_idx" ON "oauth_codes" ("expires_at");
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "access_hash" text NOT NULL,
 "refresh_hash" text NOT NULL,
 "client_id" text NOT NULL,
 "organization_id" uuid NOT NULL,
 "user_id" uuid NOT NULL,
 "api_key_id" uuid NOT NULL,
 "scope" text NOT NULL,
 "access_expires_at" timestamptz NOT NULL,
 "refresh_expires_at" timestamptz NOT NULL,
 "revoked_at" timestamptz,
 "created_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "oauth_tokens_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "oauth_clients"("id") ON DELETE cascade,
 CONSTRAINT "oauth_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade,
 CONSTRAINT "oauth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
 CONSTRAINT "oauth_tokens_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_tokens_access_idx" ON "oauth_tokens" ("access_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_tokens_refresh_idx" ON "oauth_tokens" ("refresh_hash");
--> statement-breakpoint
CREATE INDEX "oauth_tokens_key_idx" ON "oauth_tokens" ("api_key_id");
