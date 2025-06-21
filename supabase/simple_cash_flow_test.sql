-- Simple Cash Flow Test
-- This script tests if cash sales are properly recorded in cash flow without relying on complex functions

-- 1. Check current cash balance (simple calculation)
SELECT 'Current cash balance (simple calculation):' as info;
SELECT COALESCE(SUM(amount), 0) as current_cash_balance
FROM cash_ledger;

-- 2. Check recent cash sales (last 7 days)
SELECT 'Recent cash sales (last 7 days):' as info;
SELECT 
  receipt_number,
  invoice_number,
  sale_date,
  total_amount,
  payment_method,
  payment_status
FROM sales 
WHERE payment_method = 'cash' 
  AND payment_status = 'paid'
  AND sale_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY sale_date DESC;

-- 3. Check cash ledger entries for sales
SELECT 'Cash ledger entries for sales:' as info;
SELECT 
  cl.transaction_type,
  cl.amount,
  cl.description,
  cl.transaction_date,
  s.receipt_number,
  s.invoice_number
FROM cash_ledger cl
LEFT JOIN sales s ON cl.reference_id = s.id
WHERE cl.reference_type = 'sale'
  AND cl.transaction_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY cl.transaction_date DESC;

-- 4. Compare cash sales vs cash ledger entries
SELECT 'Comparison: Cash sales vs Cash ledger entries:' as info;
SELECT 
  COUNT(s.id) as total_cash_sales,
  COUNT(cl.id) as cash_ledger_entries,
  COALESCE(SUM(s.total_amount), 0) as total_sales_amount,
  COALESCE(SUM(cl.amount), 0) as total_cash_ledger_amount,
  CASE 
    WHEN COUNT(s.id) = COUNT(cl.id) THEN 'MATCH' 
    ELSE 'MISMATCH - Missing entries: ' || (COUNT(s.id) - COUNT(cl.id))::text
  END as status
FROM sales s
LEFT JOIN cash_ledger cl ON cl.reference_id = s.id AND cl.reference_type = 'sale'
WHERE s.payment_method = 'cash' 
  AND s.payment_status = 'paid'
  AND s.sale_date >= CURRENT_DATE - INTERVAL '7 days';

-- 5. Simple financial summary for today
SELECT 'Financial summary for today (simple):' as info;
SELECT 
  'Revenue' as type,
  COALESCE(SUM(total_amount), 0) as amount
FROM sales
WHERE payment_status = 'paid'
  AND sale_date::date = CURRENT_DATE
UNION ALL
SELECT 
  'Cash Sales' as type,
  COALESCE(SUM(total_amount), 0) as amount
FROM sales
WHERE payment_method = 'cash'
  AND payment_status = 'paid'
  AND sale_date::date = CURRENT_DATE
UNION ALL
SELECT 
  'Cash In (Today)' as type,
  COALESCE(SUM(amount), 0) as amount
FROM cash_ledger
WHERE transaction_type IN ('sale', 'in')
  AND transaction_date::date = CURRENT_DATE;

-- 6. Simple financial summary for last 7 days
SELECT 'Financial summary for last 7 days (simple):' as info;
SELECT 
  'Revenue' as type,
  COALESCE(SUM(total_amount), 0) as amount
FROM sales
WHERE payment_status = 'paid'
  AND sale_date >= CURRENT_DATE - INTERVAL '7 days'
UNION ALL
SELECT 
  'Cash Sales' as type,
  COALESCE(SUM(total_amount), 0) as amount
FROM sales
WHERE payment_method = 'cash'
  AND payment_status = 'paid'
  AND sale_date >= CURRENT_DATE - INTERVAL '7 days'
UNION ALL
SELECT 
  'Cash In (Last 7 days)' as type,
  COALESCE(SUM(amount), 0) as amount
FROM cash_ledger
WHERE transaction_type IN ('sale', 'in')
  AND transaction_date >= CURRENT_DATE - INTERVAL '7 days';

-- 7. Cash flow breakdown by transaction type
SELECT 'Cash flow breakdown by transaction type (last 7 days):' as info;
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

-- 8. Show all cash ledger transactions for debugging
SELECT 'All cash ledger transactions (last 7 days):' as info;
SELECT 
  transaction_type,
  amount,
  description,
  reference_type,
  transaction_date,
  created_at
FROM cash_ledger
WHERE transaction_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY transaction_date DESC;

-- 9. Check if there are any sales without cash ledger entries
SELECT 'Sales without cash ledger entries:' as info;
SELECT 
  s.id,
  s.receipt_number,
  s.invoice_number,
  s.sale_date,
  s.total_amount,
  s.payment_method,
  s.payment_status
FROM sales s
WHERE s.payment_method = 'cash' 
  AND s.payment_status = 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM cash_ledger cl 
    WHERE cl.reference_id = s.id AND cl.reference_type = 'sale'
  )
  AND s.sale_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY s.sale_date DESC;

-- 10. Test the trigger by checking if it exists
SELECT 'Checking if sales trigger exists:' as info;
SELECT 
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'sales' 
  AND trigger_name = 'trigger_create_sale_cash_entry';

-- 11. Summary of current status
SELECT 'Summary of current status:' as info;
SELECT 
  'Total Cash Sales (Last 7 days)' as metric,
  COUNT(s.id)::text as value
FROM sales s
WHERE s.payment_method = 'cash' 
  AND s.payment_status = 'paid'
  AND s.sale_date >= CURRENT_DATE - INTERVAL '7 days'
UNION ALL
SELECT 
  'Cash Ledger Entries (Last 7 days)' as metric,
  COUNT(cl.id)::text as value
FROM cash_ledger cl
WHERE cl.reference_type = 'sale'
  AND cl.transaction_date >= CURRENT_DATE - INTERVAL '7 days'
UNION ALL
SELECT 
  'Total Cash Amount (Last 7 days)' as metric,
  COALESCE(SUM(cl.amount), 0)::text as value
FROM cash_ledger cl
WHERE cl.transaction_type = 'sale'
  AND cl.transaction_date >= CURRENT_DATE - INTERVAL '7 days'
UNION ALL
SELECT 
  'Current Cash Balance' as metric,
  COALESCE(SUM(cl.amount), 0)::text as value
FROM cash_ledger cl;

SELECT 'Simple cash flow test completed!' as status; 