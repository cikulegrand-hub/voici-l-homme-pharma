-- VTE: a validated invoice remains immutable except for the controlled
-- cancellation/credit-note transition and its audit fields.
CREATE OR REPLACE FUNCTION check_sales_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'RG-04 : suppression d’une facture interdite.';
  END IF;
  IF OLD.status = 'VALIDEE' AND NOT (
    NEW.status IN ('ANNULEE'::sale_status, 'AVOIR'::sale_status)
    AND NEW.pharmacy_id = OLD.pharmacy_id
    AND NEW.invoice_number = OLD.invoice_number
    AND NEW.sequence_number = OLD.sequence_number
    AND NEW.fiscal_year = OLD.fiscal_year
    AND NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id
    AND NEW.user_id = OLD.user_id
    AND NEW.subtotal_cdf = OLD.subtotal_cdf
    AND NEW.discount_cdf = OLD.discount_cdf
    AND NEW.tax_amount_cdf = OLD.tax_amount_cdf
    AND NEW.total_amount_usd = OLD.total_amount_usd
    AND NEW.exchange_rate_applied = OLD.exchange_rate_applied
    AND NEW.created_at = OLD.created_at
    AND NEW.total_amount_cdf = OLD.total_amount_cdf
    AND NEW.idempotency_key IS NOT DISTINCT FROM OLD.idempotency_key
  ) THEN
    RAISE EXCEPTION 'RG-04 : une facture validée est immuable; utilisez une annulation ou un avoir.';
  END IF;
  IF OLD.status <> 'VALIDEE' THEN
    RAISE EXCEPTION 'RG-04 : une facture annulée/ayant fait l’objet d’un avoir est immuable.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

