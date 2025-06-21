-- Simple test script to verify the returns function works
-- Run this after applying the fix_returns_search.sql

-- 1. Check if the function exists
SELECT 'Function exists check:' as info;
SELECT 
  proname as function_name,
  proargtypes::regtype[] as argument_types,
  prorettype::regtype as return_type
FROM pg_proc 
WHERE proname = 'search_sales_for_returns';

-- 2. Test the function with no parameters (should show all recent sales)
SELECT 'Testing function with no parameters:' as info;
SELECT 
  receipt_number,
  sale_date,
  payment_status,
  total_amount,
  items_count,
  returnable_items_count
FROM search_sales_for_returns()
LIMIT 5;

-- 3. Test with date range
SELECT 'Testing function with date range:' as info;
SELECT 
  receipt_number,
  sale_date,
  payment_status,
  total_amount,
  items_count,
  returnable_items_count
FROM search_sales_for_returns(
  NULL, -- no search term
  (CURRENT_DATE - INTERVAL '30 days')::date, -- start date
  CURRENT_DATE::date, -- end date
  10 -- limit
);

-- 4. Check if there are any sales at all
SELECT 'All sales in database:' as info;
SELECT 
  id,
  receipt_number,
  sale_date,
  payment_status,
  total_amount
FROM sales 
ORDER BY sale_date DESC 
LIMIT 5;

-- 5. Check sale items
SELECT 'Sale items count:' as info;
SELECT 
  COUNT(*) as total_sale_items,
  COUNT(DISTINCT sale_id) as unique_sales
FROM sale_items; 