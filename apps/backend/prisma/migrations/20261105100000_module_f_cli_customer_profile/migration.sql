-- Extension additive du fichier clients (VHP-CDC-001 v1.1).
ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "client_number" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "nom" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "postnom" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "prenom" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "sexe" VARCHAR(1),
  ADD COLUMN IF NOT EXISTS "date_naissance" DATE,
  ADD COLUMN IF NOT EXISTS "nationalite" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "telephone_principal" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "telephone_secondaire" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "consentement_donnees" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "consentement_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "consentement_par" UUID,
  ADD COLUMN IF NOT EXISTS "created_by" UUID;

UPDATE "customers" SET "client_number" = "code" WHERE "client_number" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "uk_customers_pharmacy_client_number" ON "customers" ("pharmacy_id", "client_number");
CREATE INDEX IF NOT EXISTS "idx_customers_pharmacy_phone" ON "customers" ("pharmacy_id", "telephone_principal");

CREATE TABLE IF NOT EXISTS "customer_sequences" (
  "pharmacy_id" UUID PRIMARY KEY REFERENCES "pharmacies"("id") ON DELETE CASCADE,
  "next_number" INTEGER NOT NULL DEFAULT 1
);
INSERT INTO "customer_sequences" ("pharmacy_id", "next_number")
SELECT "pharmacy_id", COALESCE(MAX(NULLIF(regexp_replace(COALESCE("client_number", ''), '[^0-9]', '', 'g'), '')::INTEGER), 0) + 1
FROM "customers" GROUP BY "pharmacy_id"
ON CONFLICT ("pharmacy_id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "customer_addresses" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "customer_id" UUID NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "province" VARCHAR(120), "ville" VARCHAR(120), "commune" VARCHAR(120), "quartier" VARCHAR(120), "avenue_rue" VARCHAR(255),
  "numero_parcelle" VARCHAR(80), "point_de_repere" TEXT, "latitude" NUMERIC(10,7), "longitude" NUMERIC(10,7), "is_primary" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "uk_customer_primary_address" UNIQUE ("customer_id", "is_primary")
);
CREATE INDEX IF NOT EXISTS "idx_customer_address_locality" ON "customer_addresses" ("ville", "commune", "quartier");

CREATE TABLE IF NOT EXISTS "identity_documents" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "pharmacy_id" UUID NOT NULL REFERENCES "pharmacies"("id") ON DELETE CASCADE,
  "customer_id" UUID NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE, "document_type" VARCHAR(50) NOT NULL, "document_number" VARCHAR(120) NOT NULL,
  "issue_date" DATE, "expiration_date" DATE, "file_front_path" TEXT, "file_back_path" TEXT, "is_primary" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(), CONSTRAINT "uk_identity_document_pharmacy_type_number" UNIQUE ("pharmacy_id", "document_type", "document_number")
);
CREATE INDEX IF NOT EXISTS "idx_identity_document_number" ON "identity_documents" ("pharmacy_id", "document_number");

CREATE TABLE IF NOT EXISTS "customer_contacts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "customer_id" UUID NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE,
  "name" VARCHAR(255) NOT NULL, "relationship" VARCHAR(100), "phone" VARCHAR(50) NOT NULL, "address" TEXT
);
CREATE INDEX IF NOT EXISTS "idx_customer_contacts_customer" ON "customer_contacts" ("customer_id");

CREATE TABLE IF NOT EXISTS "insurers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "pharmacy_id" UUID NOT NULL REFERENCES "pharmacies"("id") ON DELETE CASCADE,
  "name" VARCHAR(255) NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT TRUE, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "uk_insurers_pharmacy_name" UNIQUE ("pharmacy_id", "name")
);
CREATE TABLE IF NOT EXISTS "insurance_coverages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "pharmacy_id" UUID NOT NULL REFERENCES "pharmacies"("id") ON DELETE CASCADE,
  "customer_id" UUID NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE, "insurer_id" UUID NOT NULL REFERENCES "insurers"("id") ON DELETE RESTRICT,
  "policy_number" VARCHAR(120), "insured_card_number" VARCHAR(120) NOT NULL, "insured_status" VARCHAR(30) NOT NULL,
  "principal_insured_name" VARCHAR(255), "relationship_to_principal" VARCHAR(100), "subscribing_employer" VARCHAR(255),
  "coverage_rate" NUMERIC(5,2), "ceiling" NUMERIC(15,2), "start_date" DATE, "end_date" DATE, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "uk_insurance_pharmacy_insurer_card" UNIQUE ("pharmacy_id", "insurer_id", "insured_card_number")
);
CREATE INDEX IF NOT EXISTS "idx_insurance_card_number" ON "insurance_coverages" ("pharmacy_id", "insured_card_number");

CREATE TABLE IF NOT EXISTS "enterprise_details" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "customer_id" UUID NOT NULL UNIQUE REFERENCES "customers"("id") ON DELETE CASCADE,
  "legal_name" VARCHAR(255) NOT NULL, "rccm" VARCHAR(120), "national_id" VARCHAR(120), "tax_id" VARCHAR(120),
  "representative_name" VARCHAR(255) NOT NULL, "representative_function" VARCHAR(120), "representative_phone" VARCHAR(50) NOT NULL,
  "representative_document_number" VARCHAR(120) NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "customers" ADD CONSTRAINT "fk_customers_consent_user" FOREIGN KEY ("consentement_par") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "customers" ADD CONSTRAINT "fk_customers_creator" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
