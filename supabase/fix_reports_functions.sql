-- Fix script for Reports functions
-- This will update functions to accept text parameters and ensure they work correctly

-- Drop existing functions to recreate them with proper parameter types
DROP FUNCTION IF EXISTS get_top_selling_products(date, date, integer);
DROP FUNCTION IF EXISTS get_top_selling_products(text, text, integer);
DROP FUNCTION IF EXISTS get_sales_summary(date, date);
DROP FUNCTION IF EXISTS get_sales_summary(text, text);

-- Function to get top selling products (accepts text parameters)
CREATE OR REPLACE FUNCTION get_top_selling_products(
  start_date text,
  end_date text,
  limit_count integer DEFAULT 10
)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  total_quantity bigint,
  total_revenue numeric(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as product_id,
    p.name::text as product_name,
    SUM(si.quantity) as total_quantity,
    SUM(si.total_price) as total_revenue
  FROM products p
  JOIN sale_items si ON p.id = si.product_id
  JOIN sales s ON si.sale_id = s.id
  WHERE s.sale_date::date BETWEEN start_date::date AND end_date::date
  GROUP BY p.id, p.name
  ORDER BY total_revenue DESC
  LIMIT limit_count;
END;
$$;

-- Function to get sales summary (accepts text parameters)
CREATE OR REPLACE FUNCTION get_sales_summary(
  start_date text,
  end_date text
)
RETURNS TABLE (
  total_sales numeric(10,2),
  total_transactions bigint,
  avg_transaction numeric(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(s.total_amount), 0) as total_sales,
    COUNT(s.id) as total_transactions,
    COALESCE(AVG(s.total_amount), 0) as avg_transaction
  FROM sales s
  WHERE s.sale_date::date BETWEEN start_date::date AND end_date::date;
END;
$$;

-- Test the functions
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

-- Test get_sales_summary function
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

-- Check if sales data exists
SELECT 'Checking sales data...' as test_name;

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
  'Total revenue today:' as metric,
  COALESCE(SUM(total_amount), 0) as value
FROM sales 
WHERE DATE(sale_date) = CURRENT_DATE;

-- Check if sale_items data exists (for top products)
SELECT 'Checking sale_items data...' as test_name;

SELECT 
  'Total sale items:' as metric,
  COUNT(*) as value
FROM sale_items;

SELECT 
  'Sale items today:' as metric,
  COUNT(*) as value
FROM sale_items si
JOIN sales s ON si.sale_id = s.id
WHERE DATE(s.sale_date) = CURRENT_DATE; 