-- Test Analytics Functions with Actual Data
-- This script will test all analytics functions to ensure they work correctly

-- First, let's check what sales data exists
SELECT 'Checking existing sales data...' as info;
SELECT 
  COUNT(*) as total_sales,
  MIN(sale_date) as earliest_sale,
  MAX(sale_date) as latest_sale,
  SUM(total_amount) as total_revenue
FROM sales;

-- Test 1: get_sales_trend function
SELECT 'Testing get_sales_trend function...' as test_name;
SELECT * FROM get_sales_trend('2025-06-01', '2025-06-30', 'day') LIMIT 10;

-- Test 2: get_average_order_value function
SELECT 'Testing get_average_order_value function...' as test_name;
SELECT * FROM get_average_order_value('2025-06-01', '2025-06-30');

-- Test 3: get_sales_summary_metrics function
SELECT 'Testing get_sales_summary_metrics function...' as test_name;
SELECT * FROM get_sales_summary_metrics('2025-06-01', '2025-06-30');

-- Test 4: get_sales_comparison function
SELECT 'Testing get_sales_comparison function...' as test_name;
SELECT * FROM get_sales_comparison('2025-06-15', '2025-06-21', '2025-06-08', '2025-06-14');

-- Test 5: get_hourly_sales_trend function
SELECT 'Testing get_hourly_sales_trend function...' as test_name;
SELECT * FROM get_hourly_sales_trend('2025-06-21');

-- Test 6: get_peak_hours_analysis function
SELECT 'Testing get_peak_hours_analysis function...' as test_name;
SELECT * FROM get_peak_hours_analysis('2025-06-01', '2025-06-30');

-- Test with current date range (last 7 days)
SELECT 'Testing with current date range (last 7 days)...' as test_name;
SELECT 
  'get_sales_trend' as function_name,
  COUNT(*) as result_count
FROM get_sales_trend(
  (CURRENT_DATE - INTERVAL '7 days')::TEXT, 
  CURRENT_DATE::TEXT, 
  'day'
);

SELECT 
  'get_average_order_value' as function_name,
  COUNT(*) as result_count
FROM get_average_order_value(
  (CURRENT_DATE - INTERVAL '7 days')::TEXT, 
  CURRENT_DATE::TEXT
);

SELECT 
  'get_sales_summary_metrics' as function_name,
  COUNT(*) as result_count
FROM get_sales_summary_metrics(
  (CURRENT_DATE - INTERVAL '7 days')::TEXT, 
  CURRENT_DATE::TEXT
);

-- Check if functions exist in the database
SELECT 'Checking if functions exist in database...' as info;
SELECT 
  proname as function_name,
  proargtypes::regtype[] as parameter_types
FROM pg_proc 
WHERE proname IN (
  'get_sales_trend',
  'get_average_order_value', 
  'get_sales_comparison',
  'get_hourly_sales_trend',
  'get_sales_summary_metrics',
  'get_peak_hours_analysis'
)
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY proname; 