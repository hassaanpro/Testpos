/*
  # Fix ambiguous column reference in get_dashboard_summary function

  1. Problem
    - The `get_dashboard_summary` function has an ambiguous reference to `total_outstanding_dues`
    - This column exists in the customers table but the function doesn't properly qualify it
    - Database cannot determine which table the column belongs to

  2. Solution
    - Drop and recreate the `get_dashboard_summary` function
    - Properly qualify all column references with table aliases
    - Ensure all aggregations and joins are explicit and unambiguous

  3. Changes
    - Fix column qualification in the customers summary section
    - Ensure all table aliases are consistently used
    - Maintain the same return structure for compatibility
*/

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS get_dashboard_summary();

-- Create the corrected get_dashboard_summary function
CREATE OR REPLACE FUNCTION get_dashboard_summary()
RETURNS JSON AS $$
DECLARE
  result JSON;
  sales_data JSON;
  inventory_data JSON;
  customers_data JSON;
  critical_products_data JSON;
BEGIN
  -- Get sales summary for today and this month
  SELECT json_build_object(
    'daily_sales', COALESCE(SUM(CASE WHEN DATE(s.sale_date) = CURRENT_DATE THEN s.total_amount ELSE 0 END), 0),
    'daily_transactions', COALESCE(COUNT(CASE WHEN DATE(s.sale_date) = CURRENT_DATE THEN 1 END), 0),
    'monthly_sales', COALESCE(SUM(CASE WHEN DATE_TRUNC('month', s.sale_date) = DATE_TRUNC('month', CURRENT_DATE) THEN s.total_amount ELSE 0 END), 0),
    'average_order_value', COALESCE(
      CASE 
        WHEN COUNT(CASE WHEN DATE(s.sale_date) = CURRENT_DATE THEN 1 END) > 0 
        THEN SUM(CASE WHEN DATE(s.sale_date) = CURRENT_DATE THEN s.total_amount ELSE 0 END) / COUNT(CASE WHEN DATE(s.sale_date) = CURRENT_DATE THEN 1 END)
        ELSE 0 
      END, 0
    )
  ) INTO sales_data
  FROM sales s
  WHERE s.sale_date >= CURRENT_DATE - INTERVAL '30 days';

  -- Get inventory summary
  SELECT json_build_object(
    'total_products', COALESCE(COUNT(*), 0),
    'low_stock_count', COALESCE(COUNT(CASE WHEN p.stock_quantity <= p.min_stock_level AND p.stock_quantity > 0 THEN 1 END), 0),
    'out_of_stock_count', COALESCE(COUNT(CASE WHEN p.stock_quantity = 0 THEN 1 END), 0),
    'near_expiry_count', COALESCE(COUNT(CASE WHEN p.expiry_date IS NOT NULL AND p.expiry_date <= CURRENT_DATE + INTERVAL '30 days' AND p.expiry_date > CURRENT_DATE THEN 1 END), 0),
    'expired_count', COALESCE(COUNT(CASE WHEN p.expiry_date IS NOT NULL AND p.expiry_date <= CURRENT_DATE THEN 1 END), 0)
  ) INTO inventory_data
  FROM products p
  WHERE p.is_active = true;

  -- Get customers summary with properly qualified column references
  SELECT json_build_object(
    'total_customers', COALESCE(COUNT(*), 0),
    'total_loyalty_points', COALESCE(SUM(c.loyalty_points), 0),
    'total_outstanding_dues', COALESCE(SUM(c.total_outstanding_dues), 0)
  ) INTO customers_data
  FROM customers c
  WHERE c.is_active = true;

  -- Get critical products (low stock, near expiry, expired)
  SELECT json_agg(
    json_build_object(
      'id', p.id,
      'name', p.name,
      'sku', p.sku,
      'stock_quantity', p.stock_quantity,
      'min_stock_level', p.min_stock_level,
      'expiry_date', p.expiry_date,
      'issues', ARRAY(
        SELECT issue FROM (
          SELECT 'Low Stock' as issue WHERE p.stock_quantity <= p.min_stock_level AND p.stock_quantity > 0
          UNION ALL
          SELECT 'Out of Stock' as issue WHERE p.stock_quantity = 0
          UNION ALL
          SELECT 'Near Expiry' as issue WHERE p.expiry_date IS NOT NULL AND p.expiry_date <= CURRENT_DATE + INTERVAL '30 days' AND p.expiry_date > CURRENT_DATE
          UNION ALL
          SELECT 'Expired' as issue WHERE p.expiry_date IS NOT NULL AND p.expiry_date <= CURRENT_DATE
        ) issues
      )
    )
  ) INTO critical_products_data
  FROM products p
  WHERE p.is_active = true
    AND (
      p.stock_quantity <= p.min_stock_level
      OR (p.expiry_date IS NOT NULL AND p.expiry_date <= CURRENT_DATE + INTERVAL '30 days')
    )
  ORDER BY 
    CASE WHEN p.stock_quantity = 0 THEN 1 ELSE 2 END,
    CASE WHEN p.expiry_date IS NOT NULL AND p.expiry_date <= CURRENT_DATE THEN 1 ELSE 2 END,
    p.expiry_date ASC NULLS LAST,
    p.stock_quantity ASC;

  -- Build final result
  SELECT json_build_object(
    'sales', sales_data,
    'inventory', inventory_data,
    'customers', customers_data,
    'critical_products', COALESCE(critical_products_data, '[]'::json),
    'generated_at', NOW()
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_dashboard_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_summary() TO anon;