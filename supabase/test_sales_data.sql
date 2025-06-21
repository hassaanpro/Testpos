-- Test script to check sales data and date filtering

-- 1. Check if there are any sales in the database
SELECT COUNT(*) as total_sales FROM sales;

-- 2. Check recent sales with their dates
SELECT 
  id,
  receipt_number,
  invoice_number,
  sale_date,
  total_amount,
  payment_method,
  payment_status,
  created_at
FROM sales 
ORDER BY created_at DESC 
LIMIT 10;

-- 3. Test the generate_receipt_number function
SELECT generate_receipt_number();

-- 4. Check if there are any sales for today (using Pakistan timezone)
SELECT 
  COUNT(*) as today_sales_count,
  COALESCE(SUM(total_amount), 0) as today_total_amount
FROM sales 
WHERE DATE(sale_date AT TIME ZONE 'Asia/Karachi') = CURRENT_DATE AT TIME ZONE 'Asia/Karachi';

-- 5. Check sales for the last 7 days
SELECT 
  DATE(sale_date AT TIME ZONE 'Asia/Karachi') as sale_date_pakistan,
  COUNT(*) as sales_count,
  COALESCE(SUM(total_amount), 0) as total_amount
FROM sales 
WHERE sale_date >= (CURRENT_DATE - INTERVAL '7 days') AT TIME ZONE 'Asia/Karachi'
GROUP BY DATE(sale_date AT TIME ZONE 'Asia/Karachi')
ORDER BY sale_date_pakistan DESC;

-- 6. Check if the receipt_history function works
SELECT * FROM get_receipt_history(
  p_start_date => CURRENT_DATE - INTERVAL '7 days',
  p_end_date => CURRENT_DATE,
  p_limit => 10
); 