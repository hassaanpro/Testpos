/*
  # Fix dashboard summary function ambiguous column reference

  1. Database Functions
    - Fix ambiguous column reference in get_dashboard_summary function
    - Explicitly qualify total_outstanding_dues column with table name

  2. Changes
    - Update get_dashboard_summary function to resolve column ambiguity
*/

-- Drop the existing function first
DROP FUNCTION IF EXISTS get_dashboard_summary();

-- Recreate the function with explicit column qualification
CREATE OR REPLACE FUNCTION get_dashboard_summary()
RETURNS TABLE (
  total_sales numeric,
  total_transactions bigint,
  total_customers bigint,
  total_products bigint,
  low_stock_products bigint,
  pending_orders bigint,
  total_outstanding_dues numeric,
  recent_sales_count bigint
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(s.total_amount), 0) as total_sales,
    COUNT(s.id) as total_transactions,
    (SELECT COUNT(*) FROM customers WHERE is_active = true) as total_customers,
    (SELECT COUNT(*) FROM products WHERE is_active = true) as total_products,
    (SELECT COUNT(*) FROM products WHERE stock_quantity <= min_stock_level AND is_active = true) as low_stock_products,
    (SELECT COUNT(*) FROM purchase_orders WHERE status = 'pending') as pending_orders,
    (SELECT COALESCE(SUM(c.total_outstanding_dues), 0) FROM customers c WHERE c.is_active = true) as total_outstanding_dues,
    (SELECT COUNT(*) FROM sales WHERE sale_date >= CURRENT_DATE) as recent_sales_count
  FROM sales s
  WHERE s.sale_date >= CURRENT_DATE - INTERVAL '30 days';
END;
$$;