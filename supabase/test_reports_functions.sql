-- Test script to verify Reports functions are working correctly
-- This will help identify if the issue is with the database functions or the frontend

-- Test 1: Check if get_sales_summary function exists and works
SELECT 'Testing get_sales_summary function...' as test_name;

-- Test for today
SELECT 'Today:' as period, * FROM get_sales_summary(
  CURRENT_DATE::text, 
  CURRENT_DATE::text
);

-- Test for last 7 days
SELECT 'Last 7 days:' as period, * FROM get_sales_summary(
  (CURRENT_DATE - INTERVAL '6 days')::text, 
  CURRENT_DATE::text
);

-- Test for this month
SELECT 'This month:' as period, * FROM get_sales_summary(
  DATE_TRUNC('month', CURRENT_DATE)::text, 
  CURRENT_DATE::text
);

-- Test 2: Check if get_top_selling_products function exists and works
SELECT 'Testing get_top_selling_products function...' as test_name;

-- Test for today
SELECT 'Today:' as period, * FROM get_top_selling_products(
  CURRENT_DATE::text, 
  CURRENT_DATE::text, 
  10
);

-- Test for last 7 days
SELECT 'Last 7 days:' as period, * FROM get_top_selling_products(
  (CURRENT_DATE - INTERVAL '6 days')::text, 
  CURRENT_DATE::text, 
  10
);

-- Test for this month
SELECT 'This month:' as period, * FROM get_top_selling_products(
  DATE_TRUNC('month', CURRENT_DATE)::text, 
  CURRENT_DATE::text, 
  10
);

-- Test 3: Check if get_financial_summary function exists and works
SELECT 'Testing get_financial_summary function...' as test_name;

-- Test for today
SELECT 'Today:' as period, * FROM get_financial_summary(
  CURRENT_DATE::text, 
  CURRENT_DATE::text
);

-- Test for last 7 days
SELECT 'Last 7 days:' as period, * FROM get_financial_summary(
  (CURRENT_DATE - INTERVAL '6 days')::text, 
  CURRENT_DATE::text
);

-- Test for this month
SELECT 'This month:' as period, * FROM get_financial_summary(
  DATE_TRUNC('month', CURRENT_DATE)::text, 
  CURRENT_DATE::text
);

-- Test 4: Check if sales data exists in the database
SELECT 'Checking sales data in database...' as test_name;

SELECT 
  'Total sales count:' as metric,
  COUNT(*) as value
FROM sales;

SELECT 
  'Sales today:' as metric,
  COUNT(*) as value
FROM sales 
WHERE DATE(sale_date) = CURRENT_DATE;

SELECT 
  'Sales last 7 days:' as metric,
  COUNT(*) as value
FROM sales 
WHERE sale_date >= CURRENT_DATE - INTERVAL '6 days';

SELECT 
  'Total revenue today:' as metric,
  COALESCE(SUM(total_amount), 0) as value
FROM sales 
WHERE DATE(sale_date) = CURRENT_DATE;

SELECT 
  'Total revenue last 7 days:' as metric,
  COALESCE(SUM(total_amount), 0) as value
FROM sales 
WHERE sale_date >= CURRENT_DATE - INTERVAL '6 days';

-- Test 5: Check if sales_items data exists (for top products)
SELECT 'Checking sales_items data...' as test_name;

SELECT 
  'Total sales items:' as metric,
  COUNT(*) as value
FROM sales_items;

SELECT 
  'Sales items today:' as metric,
  COUNT(*) as value
FROM sales_items si
JOIN sales s ON si.sale_id = s.id
WHERE DATE(s.sale_date) = CURRENT_DATE;

-- Test 6: Check if products exist
SELECT 'Checking products data...' as test_name;

SELECT 
  'Total active products:' as metric,
  COUNT(*) as value
FROM products 
WHERE is_active = true;

-- Test 7: Check if cash_ledger data exists
SELECT 'Checking cash_ledger data...' as test_name;

SELECT 
  'Total cash transactions:' as metric,
  COUNT(*) as value
FROM cash_ledger;

SELECT 
  'Cash transactions today:' as metric,
  COUNT(*) as value
FROM cash_ledger 
WHERE DATE(transaction_date) = CURRENT_DATE; 