/*
  # Dashboard Summary Function

  1. New Function
    - `get_dashboard_summary` - Comprehensive function to fetch all dashboard data in a single query
    
  2. Features
    - Consolidates multiple queries into a single database call
    - Includes sales metrics, inventory status, customer data, and financial information
    - Optimized for real-time dashboard updates
    - Returns all necessary data for the dashboard in a structured format
*/

-- Create the dashboard summary function
CREATE OR REPLACE FUNCTION get_dashboard_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  -- Time periods
  today_start timestamp;
  today_end timestamp;
  month_start timestamp;
  month_end timestamp;
  
  -- Results
  result jsonb;
  
  -- Sales metrics
  daily_sales numeric(10,2);
  daily_transactions integer;
  monthly_sales numeric(10,2);
  
  -- Inventory metrics
  total_products integer;
  low_stock_count integer;
  out_of_stock_count integer;
  near_expiry_count integer;
  expired_count integer;
  
  -- Customer metrics
  total_customers integer;
  total_loyalty_points integer;
  total_outstanding_dues numeric(10,2);
  average_order_value numeric(10,2);
  
  -- Critical products
  critical_products jsonb;
BEGIN
  -- Set time periods
  today_start := date_trunc('day', now());
  today_end := today_start + interval '1 day - 1 second';
  month_start := date_trunc('month', now() - interval '30 days');
  month_end := now();
  
  -- Get daily sales metrics
  SELECT 
    COALESCE(SUM(total_amount), 0),
    COUNT(*)
  INTO 
    daily_sales,
    daily_transactions
  FROM sales
  WHERE 
    sale_date BETWEEN today_start AND today_end
    AND payment_status = 'paid';
  
  -- Get monthly sales
  SELECT COALESCE(SUM(total_amount), 0)
  INTO monthly_sales
  FROM sales
  WHERE 
    sale_date BETWEEN month_start AND month_end
    AND payment_status = 'paid';
  
  -- Get inventory metrics
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE stock_quantity <= min_stock_level AND stock_quantity > 0),
    COUNT(*) FILTER (WHERE stock_quantity = 0),
    COUNT(*) FILTER (WHERE 
      expiry_date IS NOT NULL 
      AND expiry_date > CURRENT_DATE 
      AND expiry_date <= CURRENT_DATE + interval '30 days'
    ),
    COUNT(*) FILTER (WHERE 
      expiry_date IS NOT NULL 
      AND expiry_date <= CURRENT_DATE
    )
  INTO
    total_products,
    low_stock_count,
    out_of_stock_count,
    near_expiry_count,
    expired_count
  FROM products
  WHERE is_active = true;
  
  -- Get customer metrics
  SELECT
    COUNT(*),
    COALESCE(SUM(loyalty_points), 0),
    COALESCE(SUM(total_outstanding_dues), 0)
  INTO
    total_customers,
    total_loyalty_points,
    total_outstanding_dues
  FROM customers
  WHERE is_active = true;
  
  -- Calculate average order value
  SELECT COALESCE(AVG(total_amount), 0)
  INTO average_order_value
  FROM sales
  WHERE 
    sale_date BETWEEN month_start AND month_end
    AND payment_status = 'paid';
  
  -- Get critical products (multiple issues)
  WITH product_issues AS (
    SELECT
      p.id,
      p.name,
      p.sku,
      p.stock_quantity,
      p.min_stock_level,
      p.expiry_date,
      CASE WHEN p.stock_quantity = 0 THEN 'Out of Stock' ELSE NULL END as out_of_stock,
      CASE WHEN p.stock_quantity <= p.min_stock_level AND p.stock_quantity > 0 THEN 'Low Stock' ELSE NULL END as low_stock,
      CASE WHEN p.expiry_date IS NOT NULL AND p.expiry_date <= CURRENT_DATE THEN 'Expired' ELSE NULL END as expired,
      CASE WHEN p.expiry_date IS NOT NULL AND p.expiry_date > CURRENT_DATE AND p.expiry_date <= CURRENT_DATE + interval '30 days' THEN 'Near Expiry' ELSE NULL END as near_expiry
    FROM products p
    WHERE p.is_active = true
  ),
  critical_products_data AS (
    SELECT
      id,
      name,
      sku,
      stock_quantity,
      min_stock_level,
      expiry_date,
      ARRAY_REMOVE(ARRAY[out_of_stock, low_stock, expired, near_expiry], NULL) as issues
    FROM product_issues
    WHERE 
      out_of_stock IS NOT NULL OR 
      low_stock IS NOT NULL OR 
      expired IS NOT NULL OR 
      near_expiry IS NOT NULL
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'name', name,
      'sku', sku,
      'stock_quantity', stock_quantity,
      'min_stock_level', min_stock_level,
      'expiry_date', expiry_date,
      'issues', issues
    )
  )
  INTO critical_products
  FROM critical_products_data
  WHERE array_length(issues, 1) >= 2
  ORDER BY array_length(issues, 1) DESC, name
  LIMIT 10;
  
  -- Build the result JSON
  result := jsonb_build_object(
    'sales', jsonb_build_object(
      'daily_sales', daily_sales,
      'daily_transactions', daily_transactions,
      'monthly_sales', monthly_sales,
      'average_order_value', average_order_value
    ),
    'inventory', jsonb_build_object(
      'total_products', total_products,
      'low_stock_count', low_stock_count,
      'out_of_stock_count', out_of_stock_count,
      'near_expiry_count', near_expiry_count,
      'expired_count', expired_count
    ),
    'customers', jsonb_build_object(
      'total_customers', total_customers,
      'total_loyalty_points', total_loyalty_points,
      'total_outstanding_dues', total_outstanding_dues
    ),
    'critical_products', COALESCE(critical_products, '[]'::jsonb),
    'generated_at', now()
  );
  
  RETURN result;
END;
$$;

-- Add helpful comment
COMMENT ON FUNCTION get_dashboard_summary() IS 'Comprehensive function to fetch all dashboard data in a single query for real-time updates';