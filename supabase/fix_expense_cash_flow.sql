-- Fix Expense Cash Flow Tracking
-- This script ensures expenses are properly recorded in cash flow when paid in cash

-- 1. Check current expense system
SELECT 'Checking current expense system:' as info;
SELECT 
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'expenses';

-- 2. Check expenses table structure
SELECT 'Checking expenses table structure:' as info;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'expenses' 
ORDER BY ordinal_position;

-- 3. Check recent expenses and their cash ledger entries
SELECT 'Checking recent expenses vs cash ledger entries:' as info;
SELECT 
  e.id as expense_id,
  e.category,
  e.description,
  e.amount,
  e.expense_date,
  CASE WHEN cl.id IS NOT NULL THEN 'YES' ELSE 'NO' END as has_cash_entry,
  cl.transaction_type,
  cl.amount as cash_amount
FROM expenses e
LEFT JOIN cash_ledger cl ON cl.reference_id = e.id AND cl.reference_type = 'expense'
WHERE e.expense_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY e.expense_date DESC
LIMIT 10;

-- 4. Add payment_method column to expenses table if it doesn't exist
ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank_transfer', 'card', 'check'));

-- 5. Recreate the expense cash entry trigger function with better logic
CREATE OR REPLACE FUNCTION create_expense_cash_entry()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create cash entry for cash expenses (or if payment_method is not specified, assume cash)
  IF NEW.payment_method = 'cash' OR NEW.payment_method IS NULL THEN
    -- Check if entry already exists to avoid duplicates
    IF NOT EXISTS (
      SELECT 1 FROM cash_ledger 
      WHERE reference_id = NEW.id AND reference_type = 'expense'
    ) THEN
      INSERT INTO cash_ledger (
        transaction_type,
        amount,
        description,
        reference_id,
        reference_type,
        transaction_date
      ) VALUES (
        'expense',
        -NEW.amount,  -- Negative amount for cash outflow
        'Expense: ' || NEW.category || ' - ' || NEW.description,
        NEW.id,
        'expense',
        NEW.expense_date
      );
      
      -- Log the insertion for debugging
      RAISE NOTICE 'Created cash ledger entry for expense %: amount -%, category %', 
        NEW.id, NEW.amount, NEW.category;
    END IF;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the expense
    RAISE WARNING 'Failed to create cash ledger entry for expense %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Drop and recreate the expense trigger
DROP TRIGGER IF EXISTS trigger_create_expense_cash_entry ON expenses;
CREATE TRIGGER trigger_create_expense_cash_entry
  AFTER INSERT ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION create_expense_cash_entry();

-- 7. Create a function to manually add cash ledger entries for existing expenses
CREATE OR REPLACE FUNCTION add_missing_expense_cash_entries()
RETURNS TABLE (
  expense_id uuid,
  category text,
  amount numeric(10,2),
  status text
) AS $$
DECLARE
  expense_record RECORD;
  entry_id uuid;
BEGIN
  FOR expense_record IN 
    SELECT e.id, e.category, e.description, e.amount, e.expense_date, e.payment_method
    FROM expenses e
    WHERE (e.payment_method = 'cash' OR e.payment_method IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM cash_ledger cl 
        WHERE cl.reference_id = e.id AND cl.reference_type = 'expense'
      )
    ORDER BY e.expense_date ASC
  LOOP
    BEGIN
      INSERT INTO cash_ledger (
        transaction_type,
        amount,
        description,
        reference_id,
        reference_type,
        transaction_date
      ) VALUES (
        'expense',
        -expense_record.amount,  -- Negative amount for cash outflow
        'Expense: ' || expense_record.category || ' - ' || expense_record.description,
        expense_record.id,
        'expense',
        expense_record.expense_date
      ) RETURNING id INTO entry_id;
      
      RETURN QUERY SELECT 
        expense_record.id,
        expense_record.category::text,  -- Explicit cast to text
        expense_record.amount,
        'Added'::text;
        
    EXCEPTION
      WHEN OTHERS THEN
        RETURN QUERY SELECT 
          expense_record.id,
          expense_record.category::text,  -- Explicit cast to text
          expense_record.amount,
          'Failed: ' || SQLERRM;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 8. Run the function to add missing expense entries
SELECT 'Adding missing expense cash entries:' as info;
SELECT * FROM add_missing_expense_cash_entries();

-- 9. Update existing expenses to have payment_method = 'cash' if not set
UPDATE expenses 
SET payment_method = 'cash'
WHERE payment_method IS NULL;

-- 10. Verify the fix worked
SELECT 'Verifying expenses are now tracked:' as info;
SELECT 
  COUNT(*) as total_expenses,
  COUNT(cl.id) as cash_ledger_entries,
  COALESCE(SUM(e.amount), 0) as total_expense_amount,
  COALESCE(SUM(ABS(cl.amount)), 0) as total_cash_ledger_amount
FROM expenses e
LEFT JOIN cash_ledger cl ON cl.reference_id = e.id AND cl.reference_type = 'expense'
WHERE e.expense_date >= CURRENT_DATE - INTERVAL '7 days';

-- 11. Show current cash balance including expenses
SELECT 'Current cash balance (including expenses):' as info;
SELECT COALESCE(SUM(amount), 0) as current_cash_balance
FROM cash_ledger;

-- 12. Show cash flow breakdown including expenses
SELECT 'Cash flow breakdown (last 7 days):' as info;
SELECT 
  transaction_type,
  COUNT(*) as transaction_count,
  SUM(amount) as total_amount,
  CASE 
    WHEN transaction_type = 'sale' THEN 'Cash In'
    WHEN transaction_type = 'expense' THEN 'Cash Out'
    ELSE transaction_type
  END as flow_type
FROM cash_ledger
WHERE transaction_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY transaction_type
ORDER BY total_amount DESC;

-- 13. Show recent cash transactions
SELECT 'Recent cash transactions (last 7 days):' as info;
SELECT 
  transaction_type,
  amount,
  description,
  transaction_date,
  CASE 
    WHEN amount > 0 THEN 'Cash In'
    ELSE 'Cash Out'
  END as flow_direction
FROM cash_ledger
WHERE transaction_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY transaction_date DESC;

-- 14. Test expense creation (commented out to avoid test data)
/*
INSERT INTO expenses (
  category,
  description,
  amount,
  payment_method,
  expense_date
) VALUES (
  'Test Category',
  'Test Expense',
  50.00,
  'cash',
  NOW()
);
*/

SELECT 'Expense cash flow tracking fix completed!' as status; 