-- Get BNPL Transaction ID for Testing
-- This will give us the ID needed to test the payment function

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

-- After getting the ID, test the payment function like this:
-- SELECT * FROM process_bnpl_payment('PASTE-BNPL-ID-HERE', 100.00); 