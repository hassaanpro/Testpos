-- Test Cash Flow Tracking
-- This script tests if cash sales are properly recorded in cash flow

-- 1. Check current cash balance
SELECT 'Current cash balance:' as info;
SELECT get_cash_balance() as current_cash_balance;

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

-- 5. Test financial summary function for today
SELECT 'Financial summary for today:' as info;
SELECT * FROM get_financial_summary(CURRENT_DATE::date, CURRENT_DATE::date);

-- 6. Test financial summary for last 7 days
SELECT 'Financial summary for last 7 days:' as info;
SELECT * FROM get_financial_summary((CURRENT_DATE - INTERVAL '7 days')::date, CURRENT_DATE::date);

-- 7. Test cash flow summary for last 7 days
SELECT 'Cash flow summary for last 7 days:' as info;
SELECT * FROM get_cash_flow_summary((CURRENT_DATE - INTERVAL '7 days')::date, CURRENT_DATE::date);

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

-- 11. Show current cash balance and recent cash flow
SELECT 'Current cash balance and recent cash flow:' as info;
SELECT 
  'Current Balance' as type,
  get_cash_balance() as amount
UNION ALL
SELECT 
  'Cash In (Last 7 days)' as type,
  COALESCE(SUM(amount), 0) as amount
FROM cash_ledger
WHERE transaction_type IN ('sale', 'in')
  AND transaction_date >= CURRENT_DATE - INTERVAL '7 days'
UNION ALL
SELECT 
  'Cash Out (Last 7 days)' as type,
  COALESCE(SUM(ABS(amount)), 0) as amount
FROM cash_ledger
WHERE transaction_type IN ('expense', 'refund', 'out')
  AND amount < 0
  AND transaction_date >= CURRENT_DATE - INTERVAL '7 days';

SELECT 'Cash flow test completed!' as status; 