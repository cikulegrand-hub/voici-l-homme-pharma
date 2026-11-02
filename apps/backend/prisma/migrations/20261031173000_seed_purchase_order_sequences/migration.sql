INSERT INTO "purchase_order_sequences" ("pharmacy_id", "order_year", "next_number")
SELECT
    po."pharmacy_id",
    EXTRACT(YEAR FROM COALESCE(po."order_date", po."created_at"))::INTEGER,
    MAX(
      CASE
        WHEN po."order_number" ~ '^BC-[0-9]{4}-[0-9]+$'
        THEN SUBSTRING(po."order_number" FROM '[0-9]+$')::INTEGER + 1
        ELSE 1
      END
    )
FROM "purchase_orders" po
GROUP BY po."pharmacy_id", EXTRACT(YEAR FROM COALESCE(po."order_date", po."created_at"))::INTEGER
ON CONFLICT ("pharmacy_id", "order_year") DO UPDATE
SET "next_number" = GREATEST(
  "purchase_order_sequences"."next_number",
  EXCLUDED."next_number"
);
