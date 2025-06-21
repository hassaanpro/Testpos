/*
  # Fix get_dashboard_summary function

  This migration fixes the SQL GROUP BY error in the get_dashboard_summary function.
  The function was trying to select individual product columns without proper grouping
  or aggregation, which violates SQL standards.

  ## Changes Made
  1. Recreate the get_dashboard_summary function with proper SQL syntax
  2. Use appropriate aggregate functions for product statistics
  3. Properly structure the query to avoid GROUP BY violations
  4. Return comprehensive dashboard data including:
     - Daily and monthly sales metrics
     - Inventory statistics (low stock, out of stock, expiry alerts)
     - Customer metrics
     - Critical products list with detailed issue tracking

  ## Function Returns
  - sales: daily_sales, daily_transactions, monthly_sales, average_order_value
  - inventory: total_products, low_stock_count, out_of_stock_count, near_expiry_count, expired_count
  - customers: total_customers, total_loyalty_points, total_outstanding_dues
  - critical_products: array of products with stock/expiry issues
  - generated_at: timestamp of when summary was generated
*/

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS get_dashboard_summary();

-- Create the corrected get_dashboard_summary function
CREATE OR REPLACE FUNCTION get_dashboard_summary()
RETURNS JSON AS $$
DECLARE
  result JSON;
  today_start TIMESTAMP WITH TIME ZONE;
  month_start TIMESTAMP WITH TIME ZONE;
  near_expiry_date DATE;
BEGIN
  -- Set date boundaries
  today_start := DATE_TRUNC('day', NOW());
  month_start := DATE_TRUNC('month', NOW());
  near_expiry_date := CURRENT_DATE + INTERVAL '30 days';

  -- Build the comprehensive dashboard summary
  SELECT json_build_object(
    'sales', json_build_object(
      'daily_sales', COALESCE(daily_sales.total, 0),
      'daily_transactions', COALESCE(daily_sales.count, 0),
      'monthly_sales', COALESCE(monthly_sales.total, 0),
      'average_order_value', COALESCE(daily_sales.avg_order, 0)
    ),
    'inventory', json_build_object(
      'total_products', COALESCE(inventory_stats.total_products, 0),
      'low_stock_count', COALESCE(inventory_stats.low_stock_count, 0),
      'out_of_stock_count', COALESCE(inventory_stats.out_of_stock_count, 0),
      'near_expiry_count', COALESCE(inventory_stats.near_expiry_count, 0),
      'expired_count', COALESCE(inventory_stats.expired_count, 0)
    ),
    'customers', json_build_object(
      'total_customers', COALESCE(customer_stats.total_customers, 0),
      'total_loyalty_points', COALESCE(customer_stats.total_loyalty_points, 0),
      'total_outstanding_dues', COALESCE(customer_stats.total_outstanding_dues, 0)
    ),
    'critical_products', COALESCE(critical_products.products, '[]'::json),
    'generated_at', NOW()
  ) INTO result
  FROM (
    -- Daily sales statistics
    SELECT 
      SUM(total_amount) as total,
      COUNT(*) as count,
      CASE 
        WHEN COUNT(*) > 0 THEN SUM(total_amount) / COUNT(*)
        ELSE 0 
      END as avg_order
    FROM sales 
    WHERE sale_date >= today_start
      AND sale_date < today_start + INTERVAL '1 day'
  ) daily_sales
  CROSS JOIN (
    -- Monthly sales statistics
    SELECT SUM(total_amount) as total
    FROM sales 
    WHERE sale_date >= month_start
      AND sale_date < month_start + INTERVAL '1 month'
  ) monthly_sales
  CROSS JOIN (
    -- Inventory statistics
    SELECT 
      COUNT(*) as total_products,
      COUNT(*) FILTER (WHERE stock_quantity <= min_stock_level AND stock_quantity > 0) as low_stock_count,
      COUNT(*) FILTER (WHERE stock_quantity = 0) as out_of_stock_count,
      COUNT(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date <= near_expiry_date AND expiry_date > CURRENT_DATE) as near_expiry_count,
      COUNT(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE) as expired_count
    FROM products 
    WHERE is_active = true
  ) inventory_stats
  CROSS JOIN (
    -- Customer statistics
    SELECT 
      COUNT(*) as total_customers,
      SUM(loyalty_points) as total_loyalty_points,
      SUM(total_outstanding_dues) as total_outstanding_dues
    FROM customers 
    WHERE is_active = true
  ) customer_stats
  CROSS JOIN (
    -- Critical products with issues
    SELECT json_agg(
      json_build_object(
        'id', id,
        'name', name,
        'sku', sku,
        'stock_quantity', stock_quantity,
        'min_stock_level', min_stock_level,
        'expiry_date', expiry_date,
        'issues', issues
      )
    ) as products
    FROM (
      SELECT 
        p.id,
        p.name,
        p.sku,
        p.stock_quantity,
        p.min_stock_level,
        p.expiry_date,
        array_agg(
          CASE 
            WHEN p.stock_quantity = 0 THEN 'out_of_stock'
            WHEN p.stock_quantity <= p.min_stock_level THEN 'low_stock'
            WHEN p.expiry_date IS NOT NULL AND p.expiry_date <= CURRENT_DATE THEN 'expired'
            WHEN p.expiry_date IS NOT NULL AND p.expiry_date <= near_expiry_date THEN 'near_expiry'
          END
        ) FILTER (WHERE 
          p.stock_quantity = 0 OR 
          p.stock_quantity <= p.min_stock_level OR 
          (p.expiry_date IS NOT NULL AND p.expiry_date <= near_expiry_date)
        ) as issues
      FROM products p
      WHERE p.is_active = true
        AND (
          p.stock_quantity = 0 OR 
          p.stock_quantity <= p.min_stock_level OR 
          (p.expiry_date IS NOT NULL AND p.expiry_date <= near_expiry_date)
        )
      GROUP BY p.id, p.name, p.sku, p.stock_quantity, p.min_stock_level, p.expiry_date
      ORDER BY 
        CASE WHEN p.stock_quantity = 0 THEN 1 ELSE 2 END,
        CASE WHEN p.expiry_date IS NOT NULL AND p.expiry_date <= CURRENT_DATE THEN 1 ELSE 2 END,
        p.stock_quantity ASC
      LIMIT 20
    ) critical_products_query
  ) critical_products;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to public (since RLS is enabled on tables)
GRANT EXECUTE ON FUNCTION get_dashboard_summary() TO public;