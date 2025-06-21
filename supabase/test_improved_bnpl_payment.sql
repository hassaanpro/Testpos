-- Test Improved BNPL Payment Function
-- This script tests the comprehensive BNPL payment processing

-- 1. First, let's check the current state of customer "aa"
SELECT 
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

-- 2. Get the BNPL transaction details for customer "aa"
SELECT 
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
  s.receipt_number as original_receipt,
  s.total_amount as sale_total
FROM bnpl_transactions bt
JOIN customers c ON bt.customer_id = c.id
JOIN sales s ON bt.sale_id = s.id
WHERE c.name = 'aa'
AND bt.status IN ('pending', 'partially_paid')
ORDER BY bt.created_at DESC;

-- 3. Test the improved payment function (replace with actual BNPL ID from step 2)
-- Uncomment and modify the line below with the actual BNPL transaction ID
-- SELECT * FROM process_bnpl_payment('PASTE-BNPL-ID-HERE', 100.00);

-- 4. After testing, check the updated customer balance
SELECT 
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

-- 5. Check if the payment created a new sale record
SELECT 
  s.id,
  s.customer_id,
  s.total_amount,
  s.payment_method,
  s.invoice_number,
  s.receipt_number,
  s.status,
  s.notes,
  s.created_at
FROM sales s
JOIN customers c ON s.customer_id = c.id
WHERE c.name = 'aa'
AND s.payment_method = 'bnpl_payment'
ORDER BY s.created_at DESC
LIMIT 5;

-- 6. Check the refund_transactions table for the payment record
SELECT 
  rt.id,
  rt.sale_id,
  rt.customer_id,
  rt.amount,
  rt.payment_method,
  rt.transaction_date,
  rt.status,
  rt.notes,
  rt.created_at
FROM refund_transactions rt
JOIN customers c ON rt.customer_id = c.id
WHERE c.name = 'aa'
AND rt.payment_method = 'bnpl_payment'
ORDER BY rt.created_at DESC
LIMIT 5;

-- 7. Check the cash ledger for BNPL payment entries
SELECT 
  cl.transaction_type,
  cl.amount,
  cl.description,
  cl.reference_type,
  cl.reference_id,
  cl.transaction_date,
  cl.created_at
FROM cash_ledger cl
WHERE cl.transaction_type = 'bnpl_payment'
ORDER BY cl.created_at DESC
LIMIT 5;

-- 8. Check sales_items for the payment record
SELECT 
  si.sale_id,
  si.product_id,
  si.quantity,
  si.unit_price,
  si.total_price,
  si.created_at
FROM sales_items si
JOIN sales s ON si.sale_id = s.id
JOIN customers c ON s.customer_id = c.id
WHERE c.name = 'aa'
AND s.payment_method = 'bnpl_payment'
ORDER BY si.created_at DESC
LIMIT 5;

-- 9. Test the receipt function (replace with actual payment ID from step 5)
-- Uncomment and modify the line below with the actual payment ID
-- SELECT * FROM get_bnpl_payment_receipt('PASTE-PAYMENT-ID-HERE');

-- 10. Test the customer BNPL summary function
SELECT * FROM get_customer_bnpl_summary('4cd5e8b2-ac02-4a21-ae87-9988081a40cd');

-- 11. Verify the BNPL transaction was updated correctly
SELECT 
  bt.id,
  bt.sale_id,
  bt.customer_id,
  bt.original_amount,
  bt.amount_paid,
  bt.amount_due,
  bt.status,
  bt.updated_at
FROM bnpl_transactions bt
JOIN customers c ON bt.customer_id = c.id
WHERE c.name = 'aa'
ORDER BY bt.updated_at DESC
LIMIT 5; 