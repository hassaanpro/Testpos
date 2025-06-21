-- Get BNPL Transaction ID for Customer "aa"
-- This will help us test the payment function

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
  s.receipt_number,
  s.total_amount as sale_total
FROM bnpl_transactions bt
JOIN customers c ON bt.customer_id = c.id
JOIN sales s ON bt.sale_id = s.id
WHERE c.name = 'aa'
AND bt.status IN ('pending', 'partially_paid')
ORDER BY bt.created_at DESC;

-- Test the payment function with a partial payment (e.g., 100.00)
-- Uncomment the line below and replace with the actual BNPL transaction ID from above
-- SELECT * FROM process_bnpl_payment('PASTE-BNPL-ID-HERE', 100.00);

-- After testing, check the updated customer balance
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