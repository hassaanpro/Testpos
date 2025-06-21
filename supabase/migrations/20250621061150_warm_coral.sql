-- Drop the existing function first
DROP FUNCTION IF EXISTS get_dashboard_summary();

-- Dashboard summary function
CREATE OR REPLACE FUNCTION get_dashboard_summary()
RETURNS TABLE (
  total_sales_today numeric,
  total_transactions_today bigint,
  total_customers bigint,
  low_stock_products bigint,
  pending_orders bigint,
  total_revenue_month numeric,
  sales_growth_percent numeric
) 
LANGUAGE plpgsql
AS $$
DECLARE
  today_start timestamptz := date_trunc('day', now());
  today_end timestamptz := today_start + interval '1 day';
  month_start timestamptz := date_trunc('month', now());
  prev_month_start timestamptz := date_trunc('month', now() - interval '1 month');
  prev_month_end timestamptz := date_trunc('month', now());
  current_month_sales numeric;
  prev_month_sales numeric;
BEGIN
  -- Get today's sales
  SELECT 
    COALESCE(SUM(total_amount), 0),
    COUNT(*)
  INTO total_sales_today, total_transactions_today
  FROM sales 
  WHERE sale_date >= today_start 
    AND sale_date < today_end
    AND payment_status = 'paid';

  -- Get total customers
  SELECT COUNT(*) INTO total_customers
  FROM customers 
  WHERE is_active = true;

  -- Get low stock products
  SELECT COUNT(*) INTO low_stock_products
  FROM products 
  WHERE stock_quantity <= min_stock_level 
    AND is_active = true;

  -- Get pending orders
  SELECT COUNT(*) INTO pending_orders
  FROM purchase_orders 
  WHERE status = 'pending';

  -- Get current month revenue
  SELECT COALESCE(SUM(total_amount), 0) INTO current_month_sales
  FROM sales 
  WHERE sale_date >= month_start
    AND payment_status = 'paid';

  -- Get previous month revenue
  SELECT COALESCE(SUM(total_amount), 0) INTO prev_month_sales
  FROM sales 
  WHERE sale_date >= prev_month_start 
    AND sale_date < prev_month_end
    AND payment_status = 'paid';

  -- Calculate growth percentage
  IF prev_month_sales > 0 THEN
    sales_growth_percent := ((current_month_sales - prev_month_sales) / prev_month_sales) * 100;
  ELSE
    sales_growth_percent := 0;
  END IF;

  total_revenue_month := current_month_sales;

  RETURN QUERY SELECT 
    total_sales_today,
    total_transactions_today,
    total_customers,
    low_stock_products,
    pending_orders,
    total_revenue_month,
    sales_growth_percent;
END;
$$;