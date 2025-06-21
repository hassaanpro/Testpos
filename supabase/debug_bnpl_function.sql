-- Debug BNPL Payment Function
-- This script helps debug the current function state

-- 1. Check if the function exists
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'process_bnpl_payment'
AND n.nspname = 'public';

-- 2. Check the current BNPL transaction
SELECT 
  bt.id as bnpl_transaction_id,
  bt.original_amount,
  bt.amount_paid,
  bt.amount_due,
  bt.status,
  s.invoice_number,
  s.receipt_number
FROM bnpl_transactions bt
JOIN customers c ON bt.customer_id = c.id
JOIN sales s ON bt.sale_id = s.id
WHERE c.name = 'aa'
AND bt.status IN ('pending', 'partially_paid')
ORDER BY bt.created_at DESC
LIMIT 1;

-- 3. Test a simple payment function call
-- SELECT * FROM process_bnpl_payment('f29bc7eb-86d1-4e84-b657-032bc6a5fc12', 100.00);

-- 4. Check customer state before payment
SELECT 
  c.name,
  c.total_outstanding_dues,
  c.available_credit
FROM customers c
WHERE c.name = 'aa'; 