CREATE TABLE "purchase_order_sequences" (
    "pharmacy_id" UUID NOT NULL,
    "order_year" INTEGER NOT NULL,
    "next_number" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "purchase_order_sequences_pkey" PRIMARY KEY ("pharmacy_id", "order_year"),
    CONSTRAINT "purchase_order_sequences_next_number_check" CHECK ("next_number" > 0),
    CONSTRAINT "purchase_order_sequences_pharmacy_id_fkey"
      FOREIGN KEY ("pharmacy_id") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX "purchase_order_sequences_year_idx"
  ON "purchase_order_sequences"("order_year");
