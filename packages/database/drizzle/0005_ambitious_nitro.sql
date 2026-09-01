DROP INDEX "source_documents_url_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "source_documents_provider_url_idx" ON "source_documents" USING btree ("provider_id","url");