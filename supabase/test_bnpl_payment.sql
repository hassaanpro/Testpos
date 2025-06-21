-- Test BNPL Payment Function
-- This script tests the process_bnpl_payment function

-- First, let's check if we have any BNPL transactions to test with
SELECT 
  bt.id,
  bt.sale_id,
  bt.customer_id,
  bt.original_amount,
  bt.amount_paid,
  bt.amount_due,
  bt.status,
  c.name as customer_name,
  s.invoice_number
FROM bnpl_transactions bt
JOIN customers c ON bt.customer_id = c.id
JOIN sales s ON bt.sale_id = s.id
WHERE bt.status IN ('pending', 'partially_paid')
ORDER BY bt.created_at DESC
LIMIT 5;

-- Test the function with a sample BNPL transaction (replace with actual BNPL ID)
-- Uncomment and modify the line below with an actual BNPL transaction ID from your database
-- SELECT * FROM process_bnpl_payment('your-bnpl-transaction-id-here', 100.00);

-- Check if the function exists and is accessible
SELECT 
  proname as function_name,
  proargtypes::regtype[] as parameter_types,
  prorettype::regtype as return_type
FROM pg_proc 
WHERE proname = 'process_bnpl_payment';

-- Test function signature
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'process_bnpl_payment'
AND n.nspname = 'public';

-- Check customer balances before any test payments
SELECT 
  c.id,
  c.name,
  c.total_outstanding_dues,
  c.available_credit,
  COUNT(bt.id) as active_bnpl_count,
  SUM(bt.amount_due) as total_bnpl_due
FROM customers c
LEFT JOIN bnpl_transactions bt ON c.id = bt.customer_id AND bt.status IN ('pending', 'partially_paid')
GROUP BY c.id, c.name, c.total_outstanding_dues, c.available_credit
HAVING COUNT(bt.id) > 0
ORDER BY total_bnpl_due DESC;

-- Check cash ledger entries for BNPL payments
SELECT 
  transaction_type,
  amount,
  description,
  transaction_date,
  created_at
FROM cash_ledger 
WHERE transaction_type = 'bnpl_payment'
ORDER BY created_at DESC
LIMIT 10;

-- 1. First, let's check if the function exists
SELECT 'Checking if process_bnpl_payment function exists...' as test_name;
SELECT 
  routine_name,
  routine_type,
  data_type
FROM information_schema.routines 
WHERE routine_name = 'process_bnpl_payment';

-- 2. Check existing BNPL transactions
SELECT 'Checking existing BNPL transactions...' as test_name;
SELECT 
  bt.id,
  bt.customer_id,
  c.name as customer_name,
  bt.original_amount,
  bt.amount_paid,
  bt.amount_due,
  bt.status,
  bt.due_date,
  s.invoice_number
FROM bnpl_transactions bt
JOIN customers c ON bt.customer_id = c.id
JOIN sales s ON bt.sale_id = s.id
WHERE bt.status != 'paid'
ORDER BY bt.due_date ASC
LIMIT 5;

-- 3. Test the function with a sample BNPL transaction
-- (Replace 'YOUR_BNPL_ID' with an actual BNPL transaction ID from step 2)
SELECT 'Testing process_bnpl_payment function...' as test_name;

-- Get a sample BNPL transaction for testing
WITH sample_bnpl AS (
  SELECT bt.id, bt.amount_due, c.name as customer_name
  FROM bnpl_transactions bt
  JOIN customers c ON bt.customer_id = c.id
  WHERE bt.status != 'paid' AND bt.amount_due > 0
  LIMIT 1
)
SELECT 
  'Sample BNPL Transaction' as info,
  id::TEXT as bnpl_id,
  amount_due,
  customer_name
FROM sample_bnpl;

-- 4. Test the function (uncomment and replace with actual BNPL ID)
-- SELECT * FROM process_bnpl_payment('YOUR_BNPL_ID_HERE', 100.00);

-- 5. Check customer balances before and after payment
SELECT 'Checking customer balances...' as test_name;
SELECT 
  c.id,
  c.name,
  c.total_outstanding_dues,
  c.available_credit,
  COUNT(bt.id) as active_bnpl_count,
  SUM(bt.amount_due) as total_bnpl_due
FROM customers c
LEFT JOIN bnpl_transactions bt ON c.id = bt.customer_id AND bt.status != 'paid'
WHERE c.total_outstanding_dues > 0
GROUP BY c.id, c.name, c.total_outstanding_dues, c.available_credit
ORDER BY c.total_outstanding_dues DESC
LIMIT 5;

-- 6. Check refund_transactions table structure
SELECT 'Checking refund_transactions table...' as test_name;
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'refund_transactions'
ORDER BY ordinal_position;

-- 7. Check cash_ledger table structure
SELECT 'Checking cash_ledger table...' as test_name;
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'cash_ledger'
ORDER BY ordinal_position;

-- 8. Test helper functions (only if they exist)
SELECT 'Testing helper functions...' as test_name;

-- Check if get_bnpl_transaction_details exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'get_bnpl_transaction_details') THEN
    RAISE NOTICE 'get_bnpl_transaction_details function exists';
  ELSE
    RAISE NOTICE 'get_bnpl_transaction_details function does not exist';
  END IF;
END $$;

-- Check if get_overdue_bnpl_transactions exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'get_overdue_bnpl_transactions') THEN
    RAISE NOTICE 'get_overdue_bnpl_transactions function exists';
    -- Test the function
    PERFORM * FROM get_overdue_bnpl_transactions() LIMIT 1;
  ELSE
    RAISE NOTICE 'get_overdue_bnpl_transactions function does not exist';
  END IF;
END $$;

-- 9. Show recent BNPL payment history
SELECT 'Recent BNPL payment history...' as test_name;
SELECT 
  rt.id,
  rt.amount,
  rt.payment_method,
  rt.transaction_date,
  rt.status,
  rt.notes,
  c.name as customer_name,
  s.invoice_number
FROM refund_transactions rt
JOIN customers c ON rt.customer_id = c.id
JOIN sales s ON rt.sale_id = s.id
WHERE rt.payment_method = 'bnpl_payment'
ORDER BY rt.transaction_date DESC
LIMIT 5;

-- 10. Test a simple BNPL payment (if you have a sample BNPL transaction)
SELECT 'Ready to test BNPL payment...' as test_name;
SELECT 
  'To test payment, use this command:' as instruction,
  'SELECT * FROM process_bnpl_payment(''' || bt.id::TEXT || ''', ' || LEAST(bt.amount_due, 100) || ');' as command,
  c.name as customer_name,
  bt.amount_due as remaining_amount
FROM bnpl_transactions bt
JOIN customers c ON bt.customer_id = c.id
WHERE bt.status != 'paid' AND bt.amount_due > 0
LIMIT 1;

-- 11. Final status
SELECT 'BNPL payment function test complete!' as status,
       'Check the results above to verify the function is working' as details,
       'To test actual payment, use the command shown above' as instructions; 