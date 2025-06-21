-- Fix Cash Sales Tracking - Ensure cash sales are recorded in cash ledger
-- This script will fix the issue where cash sales are not being recorded in cash flow

-- 1. First, let's check if the trigger exists and is working
SELECT 'Checking existing triggers:' as info;
SELECT 
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'sales';

-- 2. Check if cash_ledger table has the correct structure
SELECT 'Checking cash_ledger structure:' as info;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'cash_ledger' 
ORDER BY ordinal_position;

-- 3. Check recent cash sales and their cash ledger entries
SELECT 'Checking recent cash sales vs cash ledger entries:' as info;
SELECT 
  s.id as sale_id,
  s.receipt_number,
  s.payment_method,
  s.total_amount,
  s.sale_date,
  CASE WHEN cl.id IS NOT NULL THEN 'YES' ELSE 'NO' END as has_cash_entry,
  cl.transaction_type,
  cl.amount as cash_amount
FROM sales s
LEFT JOIN cash_ledger cl ON cl.reference_id = s.id AND cl.reference_type = 'sale'
WHERE s.payment_method = 'cash' 
  AND s.payment_status = 'paid'
  AND s.sale_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY s.sale_date DESC
LIMIT 10;

-- 4. Recreate the trigger function with better error handling
CREATE OR REPLACE FUNCTION create_sale_cash_entry()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create cash entry for cash sales
  IF NEW.payment_method = 'cash' AND NEW.payment_status = 'paid' THEN
    -- Check if entry already exists to avoid duplicates
    IF NOT EXISTS (
      SELECT 1 FROM cash_ledger 
      WHERE reference_id = NEW.id AND reference_type = 'sale'
    ) THEN
      INSERT INTO cash_ledger (
        transaction_type,
        amount,
        description,
        reference_id,
        reference_type,
        transaction_date
      ) VALUES (
        'sale',
        NEW.total_amount,
        'Cash sale: ' || COALESCE(NEW.receipt_number, NEW.invoice_number),
        NEW.id,
        'sale',
        NEW.sale_date
      );
      
      -- Log the insertion for debugging
      RAISE NOTICE 'Created cash ledger entry for sale %: amount %, receipt %', 
        NEW.id, NEW.total_amount, COALESCE(NEW.receipt_number, NEW.invoice_number);
    END IF;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the sale
    RAISE WARNING 'Failed to create cash ledger entry for sale %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Drop and recreate the trigger
DROP TRIGGER IF EXISTS trigger_create_sale_cash_entry ON sales;
CREATE TRIGGER trigger_create_sale_cash_entry
  AFTER INSERT ON sales
  FOR EACH ROW
  EXECUTE FUNCTION create_sale_cash_entry();

-- 6. Create a function to manually add cash ledger entries for existing cash sales
CREATE OR REPLACE FUNCTION add_missing_cash_sale_entries()
RETURNS TABLE (
  sale_id uuid,
  receipt_number text,
  amount numeric(10,2),
  status text
) AS $$
DECLARE
  sale_record RECORD;
  entry_id uuid;
BEGIN
  FOR sale_record IN 
    SELECT s.id, s.receipt_number, s.invoice_number, s.total_amount, s.sale_date
    FROM sales s
    WHERE s.payment_method = 'cash' 
      AND s.payment_status = 'paid'
      AND NOT EXISTS (
        SELECT 1 FROM cash_ledger cl 
        WHERE cl.reference_id = s.id AND cl.reference_type = 'sale'
      )
    ORDER BY s.sale_date ASC
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
        'sale',
        sale_record.total_amount,
        'Cash sale: ' || COALESCE(sale_record.receipt_number, sale_record.invoice_number),
        sale_record.id,
        'sale',
        sale_record.sale_date
      ) RETURNING id INTO entry_id;
      
      RETURN QUERY SELECT 
        sale_record.id,
        sale_record.receipt_number::text,  -- Explicit cast to text
        sale_record.total_amount,
        'Added'::text;
        
    EXCEPTION
      WHEN OTHERS THEN
        RETURN QUERY SELECT 
          sale_record.id,
          sale_record.receipt_number::text,  -- Explicit cast to text
          sale_record.total_amount,
          'Failed: ' || SQLERRM;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 7. Run the function to add missing entries
SELECT 'Adding missing cash sale entries:' as info;
SELECT * FROM add_missing_cash_sale_entries();

-- 8. Test the trigger with a sample sale (if you want to test)
-- This is commented out to avoid creating test data
/*
INSERT INTO sales (
  invoice_number, 
  customer_id, 
  subtotal, 
  total_amount, 
  payment_method, 
  payment_status,
  sale_date
) VALUES (
  'TEST-' || EXTRACT(EPOCH FROM NOW())::text,
  NULL,
  100.00,
  100.00,
  'cash',
  'paid',
  NOW()
);
*/

-- 9. Verify the fix worked
SELECT 'Verifying cash sales are now tracked:' as info;
SELECT 
  COUNT(*) as total_cash_sales,
  COUNT(cl.id) as cash_ledger_entries,
  COALESCE(SUM(s.total_amount), 0) as total_cash_amount,
  COALESCE(SUM(cl.amount), 0) as total_cash_ledger_amount
FROM sales s
LEFT JOIN cash_ledger cl ON cl.reference_id = s.id AND cl.reference_type = 'sale'
WHERE s.payment_method = 'cash' 
  AND s.payment_status = 'paid'
  AND s.sale_date >= CURRENT_DATE - INTERVAL '7 days';

-- 10. Show current cash balance
SELECT 'Current cash balance:' as info;
SELECT get_cash_balance() as current_cash_balance;

-- 11. Show recent cash flow
SELECT 'Recent cash flow (last 7 days):' as info;
SELECT 
  transaction_type,
  COUNT(*) as transaction_count,
  SUM(amount) as total_amount,
  MIN(transaction_date) as first_transaction,
  MAX(transaction_date) as last_transaction
FROM cash_ledger
WHERE transaction_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY transaction_type
ORDER BY total_amount DESC;

SELECT 'Cash sales tracking fix completed!' as status; 