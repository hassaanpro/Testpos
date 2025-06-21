-- Quick Verification: Test Analytics Functions
-- Run this to verify all functions are working correctly

-- 1. Check if functions exist
SELECT 'Checking if analytics functions exist...' as status;
SELECT 
  proname as function_name,
  CASE 
    WHEN proargtypes::regtype[] = ARRAY['text', 'text', 'text']::regtype[] THEN 'get_sales_trend'
    WHEN proargtypes::regtype[] = ARRAY['text', 'text']::regtype[] THEN 'get_average_order_value or get_sales_summary_metrics or get_peak_hours_analysis'
    WHEN proargtypes::regtype[] = ARRAY['text', 'text', 'text', 'text']::regtype[] THEN 'get_sales_comparison'
    WHEN proargtypes::regtype[] = ARRAY['text']::regtype[] THEN 'get_hourly_sales_trend'
    ELSE 'other'
  END as function_type
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

-- 2. Test each function with current date range
SELECT 'Testing get_sales_trend...' as test;
SELECT COUNT(*) as result_count FROM get_sales_trend('2025-06-15', '2025-06-21', 'day');

SELECT 'Testing get_average_order_value...' as test;
SELECT COUNT(*) as result_count FROM get_average_order_value('2025-06-15', '2025-06-21');

SELECT 'Testing get_sales_summary_metrics...' as test;
SELECT COUNT(*) as result_count FROM get_sales_summary_metrics('2025-06-15', '2025-06-21');

SELECT 'Testing get_sales_comparison...' as test;
SELECT COUNT(*) as result_count FROM get_sales_comparison('2025-06-15', '2025-06-21', '2025-06-08', '2025-06-14');

SELECT 'Testing get_hourly_sales_trend...' as test;
SELECT COUNT(*) as result_count FROM get_hourly_sales_trend('2025-06-21');

SELECT 'Testing get_peak_hours_analysis...' as test;
SELECT COUNT(*) as result_count FROM get_peak_hours_analysis('2025-06-15', '2025-06-21');

-- 3. Show sample data from each function
SELECT 'Sample get_sales_trend data:' as info;
SELECT * FROM get_sales_trend('2025-06-15', '2025-06-21', 'day') LIMIT 3;

SELECT 'Sample get_average_order_value data:' as info;
SELECT * FROM get_average_order_value('2025-06-15', '2025-06-21');

SELECT 'Sample get_sales_summary_metrics data:' as info;
SELECT * FROM get_sales_summary_metrics('2025-06-15', '2025-06-21');

-- 4. Check if there's any sales data in the date range
SELECT 'Checking sales data availability...' as info;
SELECT 
  COUNT(*) as total_sales,
  SUM(total_amount) as total_revenue,
  MIN(sale_date) as earliest_sale,
  MAX(sale_date) as latest_sale
FROM sales 
WHERE DATE(sale_date) >= '2025-06-15'::DATE 
  AND DATE(sale_date) <= '2025-06-21'::DATE;

SELECT 'Analytics functions setup complete! ✅' as status; 