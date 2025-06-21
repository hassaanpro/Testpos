-- Simple Real-Time Dashboard Test
-- Run this after the optimization script to verify basic functionality

-- 1. Test basic dashboard stats function
SELECT 'Testing get_real_time_dashboard_stats function...' as test_name;
SELECT * FROM get_real_time_dashboard_stats();

-- 2. Test daily sales summary
SELECT 'Testing get_daily_sales_summary function...' as test_name;
SELECT * FROM get_daily_sales_summary();

-- 3. Test monthly revenue calculation
SELECT 'Testing get_monthly_revenue function...' as test_name;
SELECT * FROM get_monthly_revenue(1);

-- 4. Test inventory summary
SELECT 'Testing get_inventory_summary function...' as test_name;
SELECT * FROM get_inventory_summary();

-- 5. Test customer financial summary
SELECT 'Testing get_customer_financial_summary function...' as test_name;
SELECT * FROM get_customer_financial_summary();

-- 6. Show current data summary
SELECT 'Current Dashboard Data Summary' as summary_title;
SELECT 
  'Sales' as data_type,
  COUNT(*) as record_count,
  COALESCE(SUM(s.total_amount), 0) as total_amount
FROM sales s
UNION ALL
SELECT 
  'Products' as data_type,
  COUNT(*) as record_count,
  COALESCE(SUM(p.stock_quantity), 0) as total_amount
FROM products p
WHERE p.is_active = true
UNION ALL
SELECT 
  'Customers' as data_type,
  COUNT(*) as record_count,
  COALESCE(SUM(c.total_outstanding_dues), 0) as total_amount
FROM customers c
WHERE c.is_active = true
ORDER BY data_type;

-- 7. Test manual daily sales calculation
SELECT 'Testing manual daily sales calculation...' as test_name;
SELECT 
  COALESCE(SUM(s.total_amount), 0) as today_sales,
  COUNT(*)::BIGINT as today_transactions
FROM sales s
WHERE s.sale_date >= ((NOW() AT TIME ZONE 'Asia/Karachi')::DATE || ' 00:00:00')::TIMESTAMP AT TIME ZONE 'Asia/Karachi'
  AND s.sale_date <= ((NOW() AT TIME ZONE 'Asia/Karachi')::DATE || ' 23:59:59')::TIMESTAMP AT TIME ZONE 'Asia/Karachi';

-- 8. Test manual inventory calculation
SELECT 'Testing manual inventory calculation...' as test_name;
SELECT 
  COUNT(*)::BIGINT as total_products,
  COALESCE(SUM(p.stock_quantity), 0)::BIGINT as total_stock_items,
  COUNT(*) FILTER (WHERE p.stock_quantity = 0)::BIGINT as out_of_stock_count,
  COUNT(*) FILTER (WHERE p.stock_quantity > 0 AND p.stock_quantity <= COALESCE(p.min_stock_level, 10))::BIGINT as low_stock_count
FROM products p
WHERE p.is_active = true;

-- 9. Test manual customer calculation
SELECT 'Testing manual customer calculation...' as test_name;
SELECT 
  COUNT(*)::BIGINT as total_customers,
  COALESCE(SUM(c.total_outstanding_dues), 0) as total_outstanding_dues,
  COALESCE(SUM(c.loyalty_points), 0)::BIGINT as total_loyalty_points
FROM customers c
WHERE c.is_active = true;

-- 10. Final status
SELECT 'Real-time dashboard test complete!' as status,
       'Check the results above to verify all functions are working' as details; 