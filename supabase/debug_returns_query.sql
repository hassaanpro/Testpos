-- Debug script to check why sales aren't showing up in returns
-- This will help us understand what's happening with the search_sales_for_returns function

-- 1. Check all sales in the database
SELECT 'All sales in database:' as info;
SELECT 
  id,
  receipt_number,
  sale_date,
  payment_status,
  total_amount,
  return_status
FROM sales 
ORDER BY sale_date DESC 
LIMIT 10;

-- 2. Check sales within the last 30 days
SELECT 'Sales within last 30 days:' as info;
SELECT 
  id,
  receipt_number,
  sale_date,
  payment_status,
  total_amount,
  return_status,
  EXTRACT(days FROM (CURRENT_TIMESTAMP - sale_date))::integer as days_since_sale
FROM sales 
WHERE sale_date >= (CURRENT_TIMESTAMP - INTERVAL '30 days')
ORDER BY sale_date DESC;

-- 3. Check sales with payment_status filter
SELECT 'Sales with paid/partially_paid status:' as info;
SELECT 
  id,
  receipt_number,
  sale_date,
  payment_status,
  total_amount,
  return_status
FROM sales 
WHERE sale_date >= (CURRENT_TIMESTAMP - INTERVAL '30 days')
  AND payment_status IN ('paid', 'partially_paid')
ORDER BY sale_date DESC;

-- 4. Check sale_items for these sales
SELECT 'Sale items for recent sales:' as info;
SELECT 
  s.id as sale_id,
  s.receipt_number,
  si.id as sale_item_id,
  si.quantity,
  COALESCE(si.returned_quantity, 0) as returned_quantity,
  (si.quantity - COALESCE(si.returned_quantity, 0)) as returnable_quantity,
  p.name as product_name
FROM sales s
JOIN sale_items si ON s.id = si.sale_id
JOIN products p ON si.product_id = p.id
WHERE s.sale_date >= (CURRENT_TIMESTAMP - INTERVAL '30 days')
  AND s.payment_status IN ('paid', 'partially_paid')
ORDER BY s.sale_date DESC;

-- 5. Test the search_sales_for_returns function directly
SELECT 'Testing search_sales_for_returns function:' as info;
SELECT * FROM search_sales_for_returns(
  NULL, -- no search term
  (CURRENT_DATE - INTERVAL '30 days')::date, -- start date
  CURRENT_DATE::date, -- end date
  50 -- limit
);

-- 6. Check if there are any sales with returnable items
SELECT 'Sales with returnable items:' as info;
WITH sales_with_items AS (
  SELECT 
    s.id,
    s.receipt_number,
    s.sale_date,
    s.payment_status,
    COUNT(si.id) as items_count,
    COUNT(si.id) FILTER (WHERE (si.quantity - COALESCE(si.returned_quantity, 0)) > 0) as returnable_items_count
  FROM sales s
  LEFT JOIN sale_items si ON s.id = si.sale_id
  WHERE s.sale_date >= (CURRENT_TIMESTAMP - INTERVAL '30 days')
    AND s.payment_status IN ('paid', 'partially_paid')
  GROUP BY s.id, s.receipt_number, s.sale_date, s.payment_status
)
SELECT * FROM sales_with_items
WHERE returnable_items_count > 0
ORDER BY sale_date DESC;

-- 7. Check the exact date range being used
SELECT 'Current date and timezone info:' as info;
SELECT 
  CURRENT_TIMESTAMP as current_timestamp,
  CURRENT_DATE as current_date,
  (CURRENT_TIMESTAMP - INTERVAL '30 days') as thirty_days_ago,
  (CURRENT_DATE - INTERVAL '30 days') as thirty_days_ago_date;

-- Dashboard Stats Function
-- This function provides all key stats for the main dashboard

-- Drop the function if it exists to ensure a clean update
DROP FUNCTION IF EXISTS get_dashboard_stats();

-- Create the function
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS TABLE (
  today_sales NUMERIC,
  today_transactions BIGINT,
  total_stock_items NUMERIC,
  total_customers BIGINT,
  monthly_revenue NUMERIC,
  monthly_transactions BIGINT,
  accounts_receivable NUMERIC,
  ar_transactions BIGINT,
  bnpl_sales_30_days NUMERIC,
  bnpl_transactions_30_days BIGINT,
  total_products BIGINT,
  loyalty_points_total NUMERIC,
  cash_revenue_30_days NUMERIC,
  cash_transactions_30_days BIGINT,
  digital_revenue_30_days NUMERIC,
  digital_transactions_30_days BIGINT,
  bnpl_revenue_30_days NUMERIC,
  total_revenue_30_days NUMERIC,
  total_transactions_30_days BIGINT,
  low_stock_count BIGINT,
  out_of_stock_count BIGINT,
  near_expiry_count BIGINT,
  expired_count BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
  -- Get the start and end of the current day in Pakistani time
  start_of_day_pk TIMESTAMPTZ := (NOW() AT TIME ZONE 'Asia/Karachi')::DATE;
  end_of_day_pk TIMESTAMPTZ := start_of_day_pk + INTERVAL '1 day';
  
  -- Get the start of the 30-day period in Pakistani time
  start_of_30_days_pk TIMESTAMPTZ := (NOW() AT TIME ZONE 'Asia/Karachi' - INTERVAL '30 days')::DATE;
BEGIN
  RETURN QUERY
  WITH sales_30_days AS (
    -- CTE for sales in the last 30 days (excluding BNPL payments)
    SELECT *
    FROM sales
    WHERE created_at >= start_of_30_days_pk
      AND payment_method <> 'bnpl_payment' -- Exclude BNPL payments from revenue calculations
  )
  SELECT
    -- Today's Sales (excluding BNPL payments)
    COALESCE(SUM(s.total_amount) FILTER (WHERE s.created_at >= start_of_day_pk AND s.created_at < end_of_day_pk AND s.payment_method <> 'bnpl_payment'), 0) as today_sales,
    COALESCE(COUNT(*) FILTER (WHERE s.created_at >= start_of_day_pk AND s.created_at < end_of_day_pk AND s.payment_method <> 'bnpl_payment'), 0) as today_transactions,
    
    -- Inventory Stats
    (SELECT COALESCE(SUM(stock_quantity), 0) FROM products) as total_stock_items,
    
    -- Customer Stats
    (SELECT COUNT(*) FROM customers) as total_customers,
    
    -- Monthly Revenue (last 30 days, excluding BNPL payments)
    COALESCE(SUM(s30.total_amount), 0) as monthly_revenue,
    COALESCE(COUNT(s30.id), 0) as monthly_transactions,
    
    -- Accounts Receivable (total outstanding dues)
    (SELECT COALESCE(SUM(total_outstanding_dues), 0) FROM customers) as accounts_receivable,
    (SELECT COUNT(*) FROM bnpl_transactions WHERE status <> 'paid') as ar_transactions,
    
    -- BNPL Sales (last 30 days)
    COALESCE(SUM(s30.total_amount) FILTER (WHERE s30.payment_method = 'bnpl'), 0) as bnpl_sales_30_days,
    COALESCE(COUNT(*) FILTER (WHERE s30.payment_method = 'bnpl'), 0) as bnpl_transactions_30_days,
    
    -- Product Stats
    (SELECT COUNT(*) FROM products) as total_products,
    (SELECT COALESCE(SUM(loyalty_points), 0) FROM customers) as loyalty_points_total,
    
    -- Revenue Breakdowns (last 30 days)
    COALESCE(SUM(s30.total_amount) FILTER (WHERE s30.payment_method = 'cash'), 0) as cash_revenue_30_days,
    COALESCE(COUNT(*) FILTER (WHERE s30.payment_method = 'cash'), 0) as cash_transactions_30_days,
    COALESCE(SUM(s30.total_amount) FILTER (WHERE s30.payment_method IN ('jazzcash', 'easypaisa', 'sadapay', 'nayapay', 'card')), 0) as digital_revenue_30_days,
    COALESCE(COUNT(*) FILTER (WHERE s30.payment_method IN ('jazzcash', 'easypaisa', 'sadapay', 'nayapay', 'card')), 0) as digital_transactions_30_days,
    COALESCE(SUM(s30.total_amount) FILTER (WHERE s30.payment_method = 'bnpl'), 0) as bnpl_revenue_30_days,
    COALESCE(SUM(s30.total_amount), 0) as total_revenue_30_days,
    COALESCE(COUNT(s30.id), 0) as total_transactions_30_days,
    
    -- Inventory Alerts
    (SELECT COUNT(*) FROM products WHERE stock_quantity > 0 AND stock_quantity <= reorder_level) as low_stock_count,
    (SELECT COUNT(*) FROM products WHERE stock_quantity <= 0) as out_of_stock_count,
    (SELECT COUNT(*) FROM products WHERE expiry_date BETWEEN NOW() AND NOW() + INTERVAL '30 days') as near_expiry_count,
    (SELECT COUNT(*) FROM products WHERE expiry_date < NOW()) as expired_count
  FROM sales_30_days s30
  FULL JOIN sales s ON s30.id = s.id; -- Use FULL JOIN to handle all sales for today's stats
END;
$$;

-- Grant permissions for the function
GRANT EXECUTE ON FUNCTION get_dashboard_stats() TO authenticated;

-- Sales Chart Data Function
-- This function provides sales data for the last 7 days for the dashboard chart

-- Drop the function if it exists
DROP FUNCTION IF EXISTS get_sales_chart_data();

-- Create the function
CREATE OR REPLACE FUNCTION get_sales_chart_data()
RETURNS TABLE (
  date TEXT,
  sales NUMERIC
)
LANGUAGE sql
AS $$
  WITH dates AS (
    -- Generate the last 7 days using Pakistani time
    SELECT (NOW() AT TIME ZONE 'Asia/Karachi')::DATE - i as date
    FROM generate_series(0, 6) i
  )
  SELECT
    TO_CHAR(d.date, 'Dy') as date,
    COALESCE(SUM(s.total_amount), 0) as sales
  FROM dates d
  LEFT JOIN sales s ON s.created_at::DATE = d.date AND s.payment_method <> 'bnpl_payment'
  GROUP BY d.date
  ORDER BY d.date;
$$;

-- Grant permissions for the function
GRANT EXECUTE ON FUNCTION get_sales_chart_data() TO authenticated; 