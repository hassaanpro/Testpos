-- Final Test for BNPL Payment Function
-- This script tests the complete BNPL payment processing workflow

-- 1. Check current state of customer "aa" before payment
SELECT 
  'BEFORE PAYMENT' as test_phase,
  c.id,
  c.name,
  c.total_outstanding_dues,
  c.available_credit,
  COUNT(bt.id) as active_bnpl_count,
  SUM(bt.amount_due) as total_bnpl_due
FROM customers c
LEFT JOIN bnpl_transactions bt ON c.id = bt.customer_id AND bt.status IN ('pending', 'partially_paid')
WHERE c.name = 'aa'
GROUP BY c.id, c.name, c.total_outstanding_dues, c.available_credit;

-- 2. Get the BNPL transaction ID for testing
SELECT 
  'BNPL TRANSACTION DETAILS' as test_phase,
  bt.id as bnpl_transaction_id,
  bt.sale_id,
  bt.customer_id,
  bt.original_amount,
  bt.amount_paid,
  bt.amount_due,
  bt.status,
  bt.due_date,
  c.name as customer_name,
  s.invoice_number,
  s.receipt_number as original_receipt
FROM bnpl_transactions bt
JOIN customers c ON bt.customer_id = c.id
JOIN sales s ON bt.sale_id = s.id
WHERE c.name = 'aa'
AND bt.status IN ('pending', 'partially_paid')
ORDER BY bt.created_at DESC;

-- 3. Test the payment function (replace with actual BNPL ID from step 2)
-- Uncomment and modify the line below with the actual BNPL transaction ID
-- SELECT * FROM process_bnpl_payment('PASTE-BNPL-ID-HERE', 100.00);

-- 4. Check customer state after payment
SELECT 
  'AFTER PAYMENT' as test_phase,
  c.id,
  c.name,
  c.total_outstanding_dues,
  c.available_credit,
  COUNT(bt.id) as active_bnpl_count,
  SUM(bt.amount_due) as total_bnpl_due
FROM customers c
LEFT JOIN bnpl_transactions bt ON c.id = bt.customer_id AND bt.status IN ('pending', 'partially_paid')
WHERE c.name = 'aa'
GROUP BY c.id, c.name, c.total_outstanding_dues, c.available_credit;

-- 5. Check if payment created new records
SELECT 
  'PAYMENT RECORDS' as test_phase,
  'Sales' as table_name,
  COUNT(*) as record_count
FROM sales s
JOIN customers c ON s.customer_id = c.id
WHERE c.name = 'aa'
AND s.payment_method = 'bnpl_payment'
UNION ALL
SELECT 
  'PAYMENT RECORDS' as test_phase,
  'Refund Transactions' as table_name,
  COUNT(*) as record_count
FROM refund_transactions rt
JOIN customers c ON rt.customer_id = c.id
WHERE c.name = 'aa'
AND rt.payment_method = 'bnpl_payment'
UNION ALL
SELECT 
  'PAYMENT RECORDS' as test_phase,
  'Cash Ledger' as table_name,
  COUNT(*) as record_count
FROM cash_ledger cl
WHERE cl.transaction_type = 'bnpl_payment';

-- 6. Check the latest payment records
SELECT 
  'LATEST PAYMENT DETAILS' as test_phase,
  s.receipt_number,
  s.total_amount as payment_amount,
  s.created_at as payment_date,
  rt.notes as payment_notes
FROM sales s
JOIN customers c ON s.customer_id = c.id
JOIN refund_transactions rt ON s.id = rt.id
WHERE c.name = 'aa'
AND s.payment_method = 'bnpl_payment'
ORDER BY s.created_at DESC
LIMIT 3;

-- 7. Verify BNPL transaction was updated
SELECT 
  'UPDATED BNPL TRANSACTION' as test_phase,
  bt.id,
  bt.amount_paid,
  bt.amount_due,
  bt.status,
  bt.updated_at
FROM bnpl_transactions bt
JOIN customers c ON bt.customer_id = c.id
WHERE c.name = 'aa'
ORDER BY bt.updated_at DESC
LIMIT 3;

-- 8. Test the helper functions
SELECT 
  'HELPER FUNCTIONS - CUSTOMER BNPL SUMMARY' as test_phase,
  customer_name,
  total_outstanding_dues,
  available_credit,
  active_bnpl_count,
  total_bnpl_due,
  recent_payments
FROM get_customer_bnpl_summary('4cd5e8b2-ac02-4a21-ae87-9988081a40cd');

-- 9. Check cash ledger entries
SELECT 
  'CASH LEDGER ENTRIES' as test_phase,
  cl.transaction_type,
  cl.amount,
  cl.description,
  cl.transaction_date
FROM cash_ledger cl
WHERE cl.transaction_type = 'bnpl_payment'
ORDER BY cl.created_at DESC
LIMIT 5; 