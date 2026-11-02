ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ(6);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reversal_reason TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reversal_of_id UUID;
ALTER TABLE expenses ADD CONSTRAINT fk_expenses_reversal_of FOREIGN KEY (reversal_of_id) REFERENCES expenses(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_expenses_reversal_of ON expenses(reversal_of_id);
