-- Drop the existing function first
DROP FUNCTION IF EXISTS get_dashboard_summary();

-- Dashboard summary function with JSON return type
CREATE OR REPLACE FUNCTION get_dashboard_summary()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  -- Time periods
  today_start timestamp;
  today_end timestamp;
  month_start timestamp;
  month_end timestamp;
  prev_month_start timestamp;
  prev_month_end timestamp;
  
  -- Results
  result JSON;
  
  -- Sales metrics
  daily_sales numeric(10,2);
  daily_transactions integer;
  monthly_sales numeric(10,2);
  prev_month_sales numeric(10,2);
  sales_growth_percent numeric(5,2);
  
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
  critical_products JSON;
BEGIN
  -- Set time periods
  today_start := date_trunc('day', now());
  today_end := today_start + interval '1 day';
  month_start := date_trunc('month', now());
  month_end := now();
  prev_month_start := date_trunc('month', now() - interval '1 month');
  prev_month_end := date_trunc('month', now());
  
  -- Get daily sales metrics
  SELECT 
    COALESCE(SUM(total_amount), 0),
    COUNT(*)
  INTO 
    daily_sales,
    daily_transactions
  FROM sales
  WHERE 
    sale_date >= today_start AND sale_date < today_end
    AND payment_status = 'paid';
  
  -- Get monthly sales
  SELECT COALESCE(SUM(total_amount), 0)
  INTO monthly_sales
  FROM sales
  WHERE 
    sale_date >= month_start AND sale_date < month_end
    AND payment_status = 'paid';
  
  -- Get previous month sales
  SELECT COALESCE(SUM(total_amount), 0)
  INTO prev_month_sales
  FROM sales
  WHERE 
    sale_date >= prev_month_start AND sale_date < prev_month_end
    AND payment_status = 'paid';
  
  -- Calculate growth percentage
  IF prev_month_sales > 0 THEN
    sales_growth_percent := ((monthly_sales - prev_month_sales) / prev_month_sales) * 100;
  ELSE
    sales_growth_percent := 0;
  END IF;
  
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
    sale_date >= month_start AND sale_date < month_end
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
      ARRAY[
        CASE WHEN p.stock_quantity = 0 THEN 'out_of_stock' ELSE NULL END,
        CASE WHEN p.stock_quantity <= p.min_stock_level AND p.stock_quantity > 0 THEN 'low_stock' ELSE NULL END,
        CASE WHEN p.expiry_date IS NOT NULL AND p.expiry_date <= CURRENT_DATE THEN 'expired' ELSE NULL END,
        CASE WHEN p.expiry_date IS NOT NULL AND p.expiry_date > CURRENT_DATE AND p.expiry_date <= CURRENT_DATE + interval '30 days' THEN 'near_expiry' ELSE NULL END
      ] AS issues_array
    FROM products p
    WHERE p.is_active = true
  )
  SELECT json_agg(
    json_build_object(
      'id', pi.id,
      'name', pi.name,
      'sku', pi.sku,
      'stock_quantity', pi.stock_quantity,
      'min_stock_level', pi.min_stock_level,
      'expiry_date', pi.expiry_date,
      'issues', array_remove(pi.issues_array, NULL)
    )
  )
  INTO critical_products
  FROM product_issues pi
  WHERE 
    pi.stock_quantity = 0 OR 
    (pi.stock_quantity <= pi.min_stock_level AND pi.stock_quantity > 0) OR
    (pi.expiry_date IS NOT NULL AND pi.expiry_date <= CURRENT_DATE + interval '30 days')
  ORDER BY 
    CASE WHEN pi.stock_quantity = 0 THEN 0 ELSE 1 END,
    CASE WHEN pi.expiry_date IS NOT NULL AND pi.expiry_date <= CURRENT_DATE THEN 0 ELSE 1 END,
    pi.stock_quantity ASC,
    pi.expiry_date ASC NULLS LAST;
  
  -- Build the result JSON
  SELECT json_build_object(
    'sales', json_build_object(
      'daily_sales', daily_sales,
      'daily_transactions', daily_transactions,
      'monthly_sales', monthly_sales,
      'average_order_value', average_order_value,
      'sales_growth_percent', sales_growth_percent
    ),
    'inventory', json_build_object(
      'total_products', total_products,
      'low_stock_count', low_stock_count,
      'out_of_stock_count', out_of_stock_count,
      'near_expiry_count', near_expiry_count,
      'expired_count', expired_count
    ),
    'customers', json_build_object(
      'total_customers', total_customers,
      'total_loyalty_points', total_loyalty_points,
      'total_outstanding_dues', total_outstanding_dues
    ),
    'critical_products', COALESCE(critical_products, '[]'::json),
    'generated_at', now()
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Grant execute permission to public (since RLS is enabled on tables)
GRANT EXECUTE ON FUNCTION get_dashboard_summary() TO public;

-- Add helpful comment
COMMENT ON FUNCTION get_dashboard_summary() IS 'Comprehensive function to fetch all dashboard data in a single query for real-time updates';