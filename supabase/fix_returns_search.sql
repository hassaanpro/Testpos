-- Fix the search_sales_for_returns function to be less restrictive
-- This will show more sales in the returns interface

-- Drop ALL existing function overloads
DROP FUNCTION IF EXISTS search_sales_for_returns(text, date, date, integer);
DROP FUNCTION IF EXISTS search_sales_for_returns(character varying, date, date, integer);

-- Create a single clean version with proper type casting
CREATE OR REPLACE FUNCTION search_sales_for_returns(
  p_search_term text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  sale_id uuid,
  receipt_number text,
  invoice_number text,
  sale_date timestamptz,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  customer_email text,
  total_amount numeric(10,2),
  subtotal numeric(10,2),
  discount_amount numeric(10,2),
  tax_amount numeric(10,2),
  payment_method text,
  payment_status text,
  cashier_name text,
  return_status text,
  items_count bigint,
  returnable_items_count bigint,
  days_since_sale integer
) AS $$
BEGIN
  RETURN QUERY
  WITH sales_with_items AS (
    SELECT 
      s.id,
      s.receipt_number::text,  -- Explicit cast to text
      s.invoice_number::text,  -- Explicit cast to text
      s.sale_date,
      s.customer_id,
      s.total_amount,
      s.subtotal,
      s.discount_amount,
      s.tax_amount,
      s.payment_method::text,  -- Explicit cast to text
      s.payment_status::text,  -- Explicit cast to text
      s.cashier_name::text,    -- Explicit cast to text
      COALESCE(s.return_status, 'none')::text as return_status,
      c.name::text as customer_name,
      c.phone::text as customer_phone,
      c.email::text as customer_email,
      COUNT(si.id) as items_count,
      COUNT(si.id) FILTER (WHERE (si.quantity - COALESCE(si.returned_quantity, 0)) > 0) as returnable_items_count,
      EXTRACT(days FROM (CURRENT_TIMESTAMP - s.sale_date))::integer as days_since_sale
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    LEFT JOIN sale_items si ON s.id = si.sale_id
    WHERE 1=1
      -- Date filters (only apply if provided)
      AND (p_start_date IS NULL OR s.sale_date::date >= p_start_date)
      AND (p_end_date IS NULL OR s.sale_date::date <= p_end_date)
      -- More permissive: include sales within 60 days instead of 30
      AND s.sale_date >= (CURRENT_TIMESTAMP - INTERVAL '60 days')
      -- Include all payment statuses for now (we can filter in UI)
      -- AND s.payment_status IN ('paid', 'partially_paid')
    
    GROUP BY s.id, s.receipt_number, s.invoice_number, s.sale_date, s.customer_id,
             s.total_amount, s.subtotal, s.discount_amount, s.tax_amount, s.payment_method,
             s.payment_status, s.cashier_name, s.return_status, c.name, c.phone, c.email
    
    HAVING 
      -- Only include sales with items (any items, not just returnable)
      COUNT(si.id) > 0
      -- Search term filter (applied after grouping for performance)
      AND (
        p_search_term IS NULL 
        OR p_search_term = ''
        OR s.receipt_number ILIKE '%' || p_search_term || '%'
        OR s.invoice_number ILIKE '%' || p_search_term || '%'
        OR c.name ILIKE '%' || p_search_term || '%'
        OR c.phone ILIKE '%' || p_search_term || '%'
        OR c.email ILIKE '%' || p_search_term || '%'
      )
  )
  SELECT 
    swi.id,
    swi.receipt_number,
    swi.invoice_number,
    swi.sale_date,
    swi.customer_id,
    swi.customer_name,
    swi.customer_phone,
    swi.customer_email,
    swi.total_amount,
    swi.subtotal,
    swi.discount_amount,
    swi.tax_amount,
    swi.payment_method,
    swi.payment_status,
    swi.cashier_name,
    swi.return_status,
    swi.items_count,
    swi.returnable_items_count,
    swi.days_since_sale
  FROM sales_with_items swi
  ORDER BY swi.sale_date DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Test the fixed function
SELECT 'Testing fixed search_sales_for_returns function:' as info;
SELECT 
  receipt_number,
  sale_date,
  payment_status,
  total_amount,
  items_count,
  returnable_items_count,
  days_since_sale
FROM search_sales_for_returns(
  NULL, -- no search term
  (CURRENT_DATE - INTERVAL '60 days')::date, -- start date (60 days back)
  CURRENT_DATE::date, -- end date
  50 -- limit
);

-- Also create a simple function to get all recent sales for debugging
CREATE OR REPLACE FUNCTION get_recent_sales_for_debug(
  p_days_back integer DEFAULT 60
)
RETURNS TABLE (
  sale_id uuid,
  receipt_number text,
  sale_date timestamptz,
  payment_status text,
  total_amount numeric(10,2),
  items_count bigint,
  returnable_items_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.receipt_number::text,
    s.sale_date,
    s.payment_status::text,
    s.total_amount,
    COUNT(si.id) as items_count,
    COUNT(si.id) FILTER (WHERE (si.quantity - COALESCE(si.returned_quantity, 0)) > 0) as returnable_items_count
  FROM sales s
  LEFT JOIN sale_items si ON s.id = si.sale_id
  WHERE s.sale_date >= (CURRENT_TIMESTAMP - (p_days_back || ' days')::interval)
  GROUP BY s.id, s.receipt_number, s.sale_date, s.payment_status, s.total_amount
  ORDER BY s.sale_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Test the debug function
SELECT 'Testing debug function - all recent sales:' as info;
SELECT * FROM get_recent_sales_for_debug(60); 