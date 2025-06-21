-- Verify BNPL Payment Results
-- This script verifies that the payment was processed correctly

-- 1. Check customer balance after payment
SELECT 
  'CUSTOMER BALANCE AFTER PAYMENT' as check_type,
  c.name,
  c.total_outstanding_dues,
  c.available_credit,
  c.updated_at
FROM customers c
WHERE c.name = 'aa';

-- 2. Check BNPL transaction status after payment
SELECT 
  'BNPL TRANSACTION STATUS' as check_type,
  bt.id,
  bt.original_amount,
  bt.amount_paid,
  bt.amount_due,
  bt.status,
  bt.updated_at
FROM bnpl_transactions bt
JOIN customers c ON bt.customer_id = c.id
WHERE c.name = 'aa'
ORDER BY bt.updated_at DESC
LIMIT 1;

-- 3. Check payment records created
SELECT 
  'PAYMENT RECORDS CREATED' as check_type,
  'Sales' as table_name,
  s.receipt_number,
  s.total_amount,
  s.payment_method,
  s.created_at
FROM sales s
JOIN customers c ON s.customer_id = c.id
WHERE c.name = 'aa'
AND s.payment_method = 'bnpl_payment'
ORDER BY s.created_at DESC
LIMIT 1;

-- 4. Check refund transaction record
SELECT 
  'REFUND TRANSACTION' as check_type,
  rt.id,
  rt.amount,
  rt.payment_method,
  rt.status,
  rt.notes,
  rt.created_at
FROM refund_transactions rt
JOIN customers c ON rt.customer_id = c.id
WHERE c.name = 'aa'
AND rt.payment_method = 'bnpl_payment'
ORDER BY rt.created_at DESC
LIMIT 1;

-- 5. Check cash ledger entry
SELECT 
  'CASH LEDGER ENTRY' as check_type,
  cl.transaction_type,
  cl.amount,
  cl.description,
  cl.transaction_date
FROM cash_ledger cl
WHERE cl.transaction_type = 'bnpl_payment'
ORDER BY cl.created_at DESC
LIMIT 1;

-- 6. Summary of what should have happened
SELECT 
  'PAYMENT SUMMARY' as check_type,
  'Original Amount Due' as field,
  300.00 as expected_value,
  'Payment Amount' as field2,
  100.00 as expected_value2,
  'Remaining Amount' as field3,
  200.00 as expected_value3; 