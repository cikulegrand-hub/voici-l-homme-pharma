ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "photo_profil_path" TEXT,
  ADD COLUMN IF NOT EXISTS "photo_profil_ajoutee_le" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "photo_profil_ajoutee_par" UUID;

DO $$ BEGIN
  ALTER TABLE "customers" ADD CONSTRAINT "fk_customers_photo_adder"
    FOREIGN KEY ("photo_profil_ajoutee_par") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
