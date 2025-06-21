/*
  # Weighted Average Cost and Enhanced Reporting Functions

  1. Functions Added
    - `update_product_stock_and_cost` - Updates stock and calculates weighted average cost
    - `get_sales_summary` - Provides sales summary for date ranges
    - `get_top_selling_products` - Returns top selling products by revenue
    - `get_product_profit_analysis` - Calculates profit margins using weighted average costs
    - `get_low_stock_products` - Returns products with low stock levels

  2. Features
    - Automatic weighted average cost calculation when receiving new stock
    - Enhanced profit analysis using accurate cost data
    - Stock movement tracking with cost information
    - Low stock alerts for inventory management
*/

-- Drop existing functions if they exist to avoid conflicts
DROP FUNCTION IF EXISTS get_sales_summary(date, date);
DROP FUNCTION IF EXISTS get_top_selling_products(date, date, integer);
DROP FUNCTION IF EXISTS get_product_profit_analysis(date, date);
DROP FUNCTION IF EXISTS update_product_stock_and_cost(uuid, integer, numeric);
DROP FUNCTION IF EXISTS get_low_stock_products();

-- Function to update product stock and calculate weighted average cost
CREATE OR REPLACE FUNCTION update_product_stock_and_cost(
  product_id uuid,
  new_quantity integer,
  new_unit_cost numeric(10,2)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_stock integer;
  current_cost numeric(10,2);
  new_total_cost numeric(10,2);
  new_weighted_avg_cost numeric(10,2);
  total_quantity integer;
BEGIN
  -- Get current product data
  SELECT stock_quantity, cost_price 
  INTO current_stock, current_cost
  FROM products 
  WHERE id = product_id;
  
  -- Calculate new weighted average cost
  IF current_stock = 0 THEN
    -- If no existing stock, use new cost as the cost price
    new_weighted_avg_cost := new_unit_cost;
  ELSE
    -- Calculate weighted average
    new_total_cost := (current_stock * current_cost) + (new_quantity * new_unit_cost);
    total_quantity := current_stock + new_quantity;
    new_weighted_avg_cost := new_total_cost / total_quantity;
  END IF;
  
  -- Update product with new stock and weighted average cost
  UPDATE products 
  SET 
    stock_quantity = current_stock + new_quantity,
    cost_price = new_weighted_avg_cost,
    updated_at = now()
  WHERE id = product_id;
  
  -- Record stock movement
  INSERT INTO stock_movements (
    product_id,
    movement_type,
    quantity,
    reference_type,
    notes
  ) VALUES (
    product_id,
    'in',
    new_quantity,
    'purchase',
    'Stock received - Cost: ' || new_unit_cost || ', New Avg Cost: ' || new_weighted_avg_cost
  );
END;
$$;

-- Function to get sales summary for reports
CREATE OR REPLACE FUNCTION get_sales_summary(
  start_date date,
  end_date date
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
  WHERE s.sale_date::date BETWEEN start_date AND end_date;
END;
$$;

-- Function to get top selling products
CREATE OR REPLACE FUNCTION get_top_selling_products(
  start_date date,
  end_date date,
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
    p.name as product_name,
    SUM(si.quantity) as total_quantity,
    SUM(si.total_price) as total_revenue
  FROM products p
  JOIN sale_items si ON p.id = si.product_id
  JOIN sales s ON si.sale_id = s.id
  WHERE s.sale_date::date BETWEEN start_date AND end_date
  GROUP BY p.id, p.name
  ORDER BY total_revenue DESC
  LIMIT limit_count;
END;
$$;

-- Function to calculate profit margins using weighted average costs
CREATE OR REPLACE FUNCTION get_product_profit_analysis(
  start_date date,
  end_date date
)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  total_sold bigint,
  total_revenue numeric(10,2),
  total_cost numeric(10,2),
  gross_profit numeric(10,2),
  profit_margin numeric(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as product_id,
    p.name as product_name,
    SUM(si.quantity) as total_sold,
    SUM(si.total_price) as total_revenue,
    SUM(si.quantity * p.cost_price) as total_cost,
    SUM(si.total_price) - SUM(si.quantity * p.cost_price) as gross_profit,
    CASE 
      WHEN SUM(si.total_price) > 0 THEN
        ((SUM(si.total_price) - SUM(si.quantity * p.cost_price)) / SUM(si.total_price) * 100)
      ELSE 0
    END as profit_margin
  FROM products p
  JOIN sale_items si ON p.id = si.product_id
  JOIN sales s ON si.sale_id = s.id
  WHERE s.sale_date::date BETWEEN start_date AND end_date
  GROUP BY p.id, p.name
  HAVING SUM(si.quantity) > 0
  ORDER BY gross_profit DESC;
END;
$$;

-- Function to get low stock products
CREATE OR REPLACE FUNCTION get_low_stock_products()
RETURNS TABLE (
  id uuid,
  name text,
  sku text,
  stock_quantity integer,
  min_stock_level integer,
  cost_price numeric(10,2),
  sale_price numeric(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.name,
    p.sku,
    p.stock_quantity,
    p.min_stock_level,
    p.cost_price,
    p.sale_price
  FROM products p
  WHERE p.is_active = true 
    AND p.stock_quantity <= p.min_stock_level
  ORDER BY p.stock_quantity ASC;
END;
$$;