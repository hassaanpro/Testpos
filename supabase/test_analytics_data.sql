-- Test script to check sales data and analytics functions

-- Check if there's any sales data
SELECT 'Checking sales data...' as test_name;
SELECT COUNT(*) as total_sales FROM sales;
SELECT COUNT(*) as total_sale_items FROM sale_items;

-- Check recent sales
SELECT 'Recent sales data:' as test_name;
SELECT 
  id,
  sale_date,
  total_amount,
  payment_method,
  payment_status,
  customer_id
FROM sales 
ORDER BY sale_date DESC 
LIMIT 10;

-- Test the analytics functions with the specific date range of your sales data
SELECT 'Testing get_sales_trend function for June 2025...' as test_name;
SELECT * FROM get_sales_trend('2025-06-01', '2025-06-30', 'day') LIMIT 10;

SELECT 'Testing get_average_order_value function for June 2025...' as test_name;
SELECT * FROM get_average_order_value('2025-06-01', '2025-06-30');

SELECT 'Testing get_sales_summary_metrics function for June 2025...' as test_name;
SELECT * FROM get_sales_summary_metrics('2025-06-01', '2025-06-30');

-- Test with the exact date of your sales
SELECT 'Testing with exact sales date (2025-06-21)...' as test_name;
SELECT * FROM get_sales_trend('2025-06-21', '2025-06-21', 'day');

SELECT 'Testing AOV for exact sales date...' as test_name;
SELECT * FROM get_average_order_value('2025-06-21', '2025-06-21');

-- Check if there are any sales in the last 30 days
SELECT 'Sales in last 30 days:' as test_name;
SELECT 
  DATE(sale_date) as sale_date,
  COUNT(*) as transactions,
  SUM(total_amount) as total_revenue
FROM sales 
WHERE sale_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(sale_date)
ORDER BY sale_date DESC; 