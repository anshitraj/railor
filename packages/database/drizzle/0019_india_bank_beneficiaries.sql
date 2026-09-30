ALTER TABLE beneficiaries DROP CONSTRAINT IF EXISTS beneficiaries_method_check;
--> statement-breakpoint
ALTER TABLE beneficiaries ADD CONSTRAINT beneficiaries_method_check CHECK (method IN ('bank_us','iban','gb','clabe','pix','in_bank','crypto_address'));
