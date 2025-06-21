-- Check payment methods in sales table
SELECT 
  payment_method,
  COUNT(*) as transaction_count,
  COALESCE(SUM(total_amount), 0) as total_amount,
  ROUND(AVG(total_amount), 2) as avg_amount
FROM sales 
GROUP BY payment_method 
ORDER BY total_amount DESC;

-- Check recent sales with payment methods
SELECT 
  receipt_number,
  invoice_number,
  sale_date,
  payment_method,
  total_amount,
  payment_status,
  digital_payment_provider,
  digital_payment_account
FROM sales 
ORDER BY created_at DESC 
LIMIT 10;

-- Check if there are any sales with digital payment providers
SELECT 
  digital_payment_provider,
  COUNT(*) as count,
  COALESCE(SUM(total_amount), 0) as total_amount
FROM sales 
WHERE digital_payment_provider IS NOT NULL
GROUP BY digital_payment_provider; 