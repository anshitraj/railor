-- ISO 4217 currency names and codes: https://www.edm.gv.at/edm_portal/redaList.do?seqCode=4be7mmnahu7wkz
INSERT INTO countries (code, name, region, flag, popularity) VALUES
  ('PH', 'Philippines', 'APAC', '🇵🇭', 66),
  ('KE', 'Kenya', 'Africa', '🇰🇪', 62),
  ('VN', 'Vietnam', 'APAC', '🇻🇳', 61),
  ('EG', 'Egypt', 'Middle East', '🇪🇬', 59),
  ('PK', 'Pakistan', 'APAC', '🇵🇰', 55),
  ('GH', 'Ghana', 'Africa', '🇬🇭', 54),
  ('BD', 'Bangladesh', 'APAC', '🇧🇩', 52),
  ('MA', 'Morocco', 'Africa', '🇲🇦', 51),
  ('NP', 'Nepal', 'South Asia', '🇳🇵', 50),
  ('DO', 'Dominican Republic', 'LATAM', '🇩🇴', 50),
  ('TZ', 'Tanzania', 'Africa', '🇹🇿', 47),
  ('UG', 'Uganda', 'Africa', '🇺🇬', 46),
  ('ET', 'Ethiopia', 'Africa', '🇪🇹', 46),
  ('LK', 'Sri Lanka', 'APAC', '🇱🇰', 45),
  ('KH', 'Cambodia', 'APAC', '🇰🇭', 44),
  ('RW', 'Rwanda', 'Africa', '🇷🇼', 44),
  ('JM', 'Jamaica', 'LATAM', '🇯🇲', 42)
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
INSERT INTO currencies (code, name, symbol, country_code, popularity) VALUES
  ('PHP', 'Philippine Peso', '₱', 'PH', 56),
  ('KES', 'Kenyan Shilling', 'KSh', 'KE', 46),
  ('VND', 'Vietnamese Dong', '₫', 'VN', 45),
  ('PKR', 'Pakistani Rupee', 'Rs', 'PK', 44),
  ('EGP', 'Egyptian Pound', 'E£', 'EG', 43),
  ('BDT', 'Bangladeshi Taka', '৳', 'BD', 42),
  ('GHS', 'Ghanaian Cedi', 'GH₵', 'GH', 42),
  ('MAD', 'Moroccan Dirham', 'MAD', 'MA', 40),
  ('NPR', 'Nepalese Rupee', 'Rs', 'NP', 39),
  ('DOP', 'Dominican Peso', 'RD$', 'DO', 39),
  ('LKR', 'Sri Lankan Rupee', 'Rs', 'LK', 37),
  ('TZS', 'Tanzanian Shilling', 'TSh', 'TZ', 36),
  ('UGX', 'Ugandan Shilling', 'USh', 'UG', 35),
  ('ETB', 'Ethiopian Birr', 'Br', 'ET', 34),
  ('KHR', 'Cambodian Riel', '៛', 'KH', 33),
  ('RWF', 'Rwandan Franc', 'FRw', 'RW', 33),
  ('JMD', 'Jamaican Dollar', 'J$', 'JM', 32)
ON CONFLICT (code) DO UPDATE
  SET country_code = excluded.country_code
  WHERE currencies.country_code IS NULL;
--> statement-breakpoint
INSERT INTO named_rails (code, name, country_code, category, description, source_url, verified_at) VALUES
  ('INSTAPAY', 'InstaPay', 'PH', 'bank_transfer_local', 'Real-time low-value electronic transfers between participating banks and electronic money issuers.', 'https://www.bsp.gov.ph/Regulations/Issuances/2022/CL-2022-055.pdf', '2026-11-19T00:00:00Z'),
  ('PESONET', 'PESONet', 'PH', 'bank_transfer_local', 'Batch electronic credit transfer scheme for participating Philippine institutions.', 'https://www.bsp.gov.ph/Pages/PAYMENTS%20AND%20SETTLEMENTS/National%20Retail%20Payment%20System/Empowering-Every-Juan-and-Maria.aspx', '2026-11-19T00:00:00Z'),
  ('RAAST', 'Raast', 'PK', 'bank_transfer_local', 'The State Bank of Pakistan documents Raast for instant bulk, person-to-person and person-to-merchant payments.', 'https://www.sbp.org.pk/our-operations/payment-systems', '2026-11-19T00:00:00Z'),
  ('NPSB', 'National Payment Switch Bangladesh', 'BD', 'bank_transfer_local', 'Connects participating banks for ATM, point-of-sale and internet banking fund transfers.', 'https://www.bb.org.bd/en/index.php/financialactivity/paysystems', '2026-11-19T00:00:00Z'),
  ('BEFTN', 'Bangladesh Electronic Funds Transfer Network', 'BD', 'bank_transfer_local', 'Electronic interbank transfer system under the Bangladesh Automated Clearing House.', 'https://www.bb.org.bd/pub/annual/fsr/financialstabilityreport2025.pdf', '2026-11-19T00:00:00Z'),
  ('CONNECTIPS', 'connectIPS', 'NP', 'bank_transfer_local', 'Nepal Clearing House operates this faster-payment service for linked bank accounts.', 'https://nchl.com.np/faqs/', '2026-11-19T00:00:00Z'),
  ('CEFTS', 'Common Electronic Fund Transfer Switch', 'LK', 'bank_transfer_local', 'Sri Lanka’s 24/7 real-time interbank fund-transfer switch, operated by LankaPay.', 'https://www.lankapay.net/en/for-financial/financial-institutions/real-time-payments-cefts', '2026-11-19T00:00:00Z'),
  ('EKASH_RW', 'eKash', 'RW', 'wallet_transfer', 'Rwanda’s interoperable instant transfers between participating wallets and bank accounts.', 'https://www.bnr.rw/documents/EAC-PAYMENT-SYSTEMS-MASTERPLAN_Published_May_25.pdf', '2026-11-19T00:00:00Z'),
  ('TIPS_TZ', 'Tanzania Instant Payment System', 'TZ', 'wallet_transfer', 'Tanzania’s instant payment switch connects participating wallets and bank accounts.', 'https://www.bnr.rw/documents/EAC-PAYMENT-SYSTEMS-MASTERPLAN_Published_May_25.pdf', '2026-11-19T00:00:00Z')
ON CONFLICT (code) DO UPDATE
  SET source_url = excluded.source_url, verified_at = excluded.verified_at
  WHERE named_rails.source_url IS NULL AND named_rails.country_code = excluded.country_code;
--> statement-breakpoint
-- Bootstrap partial profiles only where no researched profile already exists.
WITH facts (iso2, iso3, currency, instant_system, local_rail, domain, source_url, source_title, authority, excerpt) AS (
  VALUES
    ('PH', 'PHL', 'PHP', 'InstaPay', 'InstaPay', 'bsp.gov.ph', 'https://www.bsp.gov.ph/Regulations/Issuances/2022/CL-2022-055.pdf', 'Bangko Sentral ng Pilipinas circular on InstaPay and PESONet', 'official_regulator', 'InstaPay is the designated real-time, low-value electronic transfer system.'),
    ('PK', 'PAK', 'PKR', 'Raast', 'Raast', 'sbp.org.pk', 'https://www.sbp.org.pk/our-operations/payment-systems', 'State Bank of Pakistan payment systems', 'official_regulator', 'Raast supports instant bulk, person-to-person and person-to-merchant payments.'),
    ('NP', 'NPL', 'NPR', 'connectIPS', 'connectIPS', 'nchl.com.np', 'https://nchl.com.np/faqs/', 'Nepal Clearing House payment system FAQs', 'official_network', 'NCHL operates connectIPS for faster payments from a linked bank account.'),
    ('LK', 'LKA', 'LKR', 'CEFTS', 'CEFTS', 'lankapay.net', 'https://www.lankapay.net/en/for-financial/financial-institutions/real-time-payments-cefts', 'LankaPay real-time payments', 'official_network', 'LankaPay says CEFTS operates round the clock and processes interbank transfers in real time.'),
    ('RW', 'RWA', 'RWF', 'eKash', 'eKash', 'bnr.rw', 'https://www.bnr.rw/documents/EAC-PAYMENT-SYSTEMS-MASTERPLAN_Published_May_25.pdf', 'East African Community payment systems masterplan', 'official_regulator', 'The masterplan identifies eKash as an interoperable instant switch for bank accounts and wallets.'),
    ('TZ', 'TZA', 'TZS', 'Tanzania Instant Payment System', 'Tanzania Instant Payment System', 'bnr.rw', 'https://www.bnr.rw/documents/EAC-PAYMENT-SYSTEMS-MASTERPLAN_Published_May_25.pdf', 'East African Community payment systems masterplan', 'official_regulator', 'The masterplan identifies TIPS as an interoperable instant switch for bank accounts and wallets.'),
    ('BD', 'BGD', 'BDT', NULL, 'National Payment Switch Bangladesh', 'bb.org.bd', 'https://www.bb.org.bd/en/index.php/financialactivity/paysystems', 'Bangladesh Bank payment systems', 'official_regulator', 'NPSB enables internet banking fund transfers between participating banks.')
), inserted_profiles AS (
  INSERT INTO country_profiles (iso2, iso3, country_name, currency_code, currency_name, instant_payment_available, instant_payment_system, local_payment_rails, last_verified_at)
  SELECT f.iso2, f.iso3, c.name, f.currency, cur.name, CASE WHEN f.instant_system IS NOT NULL THEN true END, f.instant_system, jsonb_build_array(f.local_rail), '2026-11-19T00:00:00Z'
  FROM facts f JOIN countries c ON c.code = f.iso2 JOIN currencies cur ON cur.code = f.currency
  ON CONFLICT (iso2) DO NOTHING
  RETURNING iso2
), inserted_sources AS (
  INSERT INTO country_sources (country_iso2, url, domain, title, category, source_type, authority_level, accessed_at)
  SELECT f.iso2, f.source_url, f.domain, f.source_title, 'payment_rails', 'official_guidance', f.authority::country_source_authority, '2026-11-19T00:00:00Z'
  FROM facts f JOIN inserted_profiles p ON p.iso2 = f.iso2
  ON CONFLICT (country_iso2, url) DO NOTHING
  RETURNING id, country_iso2
), linked_sources AS (
  SELECT id, country_iso2 FROM inserted_sources
  UNION ALL
  SELECT cs.id, cs.country_iso2 FROM country_sources cs
  JOIN facts f ON f.iso2 = cs.country_iso2 AND f.source_url = cs.url
  JOIN inserted_profiles p ON p.iso2 = cs.country_iso2
)
INSERT INTO country_fact_sources (country_iso2, fact_key, source_id, confidence, excerpt)
SELECT f.iso2, fields.fact_key, src.id, 0.95, f.excerpt
FROM facts f JOIN linked_sources src ON src.country_iso2 = f.iso2
CROSS JOIN LATERAL (
  SELECT 'local_payment_rails' AS fact_key
  UNION ALL SELECT 'instant_payment_available' WHERE f.instant_system IS NOT NULL
  UNION ALL SELECT 'instant_payment_system' WHERE f.instant_system IS NOT NULL
) fields;
