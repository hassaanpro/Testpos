-- Add missing columns to cash_ledger table
-- Run this FIRST before running the financial functions

-- 1. Add missing columns to cash_ledger table
ALTER TABLE cash_ledger 
ADD COLUMN IF NOT EXISTS reference_type text,
ADD COLUMN IF NOT EXISTS transaction_date timestamptz DEFAULT now();

-- 2. Update existing records to have proper reference_type
UPDATE cash_ledger 
SET reference_type = 'manual'
WHERE reference_type IS NULL;

-- 3. Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_cash_ledger_transaction_type ON cash_ledger(transaction_type);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_transaction_date ON cash_ledger(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_reference_type ON cash_ledger(reference_type);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_reference_id ON cash_ledger(reference_id);

-- 4. Ensure expenses table exists
CREATE TABLE IF NOT EXISTS expenses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL,
  description text NOT NULL,
  amount numeric(10,2) NOT NULL,
  receipt_number text,
  notes text,
  expense_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 5. Create indexes for expenses
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date DESC);

-- Test that columns exist
SELECT 'Testing table structure:' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'cash_ledger' 
ORDER BY ordinal_position;

-- Insert sample data for testing
INSERT INTO cash_ledger (transaction_type, amount, description, reference_type, transaction_date)
VALUES 
  ('in', 1000.00, 'Initial cash deposit', 'opening_balance', now() - interval '30 days')
ON CONFLICT DO NOTHING;

SELECT 'Sample data inserted successfully!' as info; 