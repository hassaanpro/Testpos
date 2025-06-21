-- Function to search sales for returns processing
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
      s.receipt_number,
      s.invoice_number,
      s.sale_date,
      s.customer_id,
      s.total_amount,
      s.subtotal,
      s.discount_amount,
      s.tax_amount,
      s.payment_method,
      s.payment_status,
      s.cashier_name,
      COALESCE(s.return_status, 'none') as return_status,
      c.name as customer_name,
      c.phone as customer_phone,
      c.email as customer_email,
      COUNT(si.id) as items_count,
      COUNT(si.id) FILTER (WHERE (si.quantity - COALESCE(si.returned_quantity, 0)) > 0) as returnable_items_count,
      EXTRACT(days FROM (CURRENT_TIMESTAMP - s.sale_date))::integer as days_since_sale
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    LEFT JOIN sale_items si ON s.id = si.sale_id
    WHERE 1=1
      -- Date filters
      AND (p_start_date IS NULL OR s.sale_date::date >= p_start_date)
      AND (p_end_date IS NULL OR s.sale_date::date <= p_end_date)
      -- Only include sales within return window (30 days)
      AND s.sale_date >= (CURRENT_TIMESTAMP - INTERVAL '30 days')
      -- Only include paid sales (can't return unpaid items)
      AND s.payment_status IN ('paid', 'partially_paid')
    GROUP BY s.id, c.name, c.phone, c.email
    HAVING 
      -- Only include sales with returnable items
      COUNT(si.id) FILTER (WHERE (si.quantity - COALESCE(si.returned_quantity, 0)) > 0) > 0
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

-- Add helpful indexes for the search function
CREATE INDEX IF NOT EXISTS idx_sales_return_search_receipt ON sales USING gin(receipt_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sales_return_search_invoice ON sales USING gin(invoice_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sales_payment_status_date ON sales(payment_status, sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_customers_name_search ON customers USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_phone_search ON customers USING gin(phone gin_trgm_ops);

-- Function to get sale details for return processing
CREATE OR REPLACE FUNCTION get_sale_for_return(p_sale_id uuid)
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
  days_since_sale integer,
  is_eligible_for_return boolean,
  return_eligibility_reason text
) AS $$
DECLARE
  v_days_since integer;
  v_return_window integer := 30;
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.receipt_number,
    s.invoice_number,
    s.sale_date,
    s.customer_id,
    c.name,
    c.phone,
    c.email,
    s.total_amount,
    s.subtotal,
    s.discount_amount,
    s.tax_amount,
    s.payment_method,
    s.payment_status,
    s.cashier_name,
    COALESCE(s.return_status, 'none'),
    EXTRACT(days FROM (CURRENT_TIMESTAMP - s.sale_date))::integer,
    CASE 
      WHEN EXTRACT(days FROM (CURRENT_TIMESTAMP - s.sale_date)) <= v_return_window 
        AND s.payment_status IN ('paid', 'partially_paid')
        AND EXISTS(
          SELECT 1 FROM sale_items si 
          WHERE si.sale_id = s.id 
          AND (si.quantity - COALESCE(si.returned_quantity, 0)) > 0
        )
      THEN true
      ELSE false
    END,
    CASE 
      WHEN EXTRACT(days FROM (CURRENT_TIMESTAMP - s.sale_date)) > v_return_window 
        THEN 'Return window expired (30 days)'
      WHEN s.payment_status NOT IN ('paid', 'partially_paid')
        THEN 'Sale not paid - cannot process return'
      WHEN NOT EXISTS(
        SELECT 1 FROM sale_items si 
        WHERE si.sale_id = s.id 
        AND (si.quantity - COALESCE(si.returned_quantity, 0)) > 0
      )
        THEN 'No items available for return'
      ELSE 'Eligible for return'
    END
  FROM sales s
  LEFT JOIN customers c ON s.customer_id = c.id
  WHERE s.id = p_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON FUNCTION search_sales_for_returns(text, date, date, integer) IS 'Search sales that are eligible for returns with comprehensive filtering';
COMMENT ON FUNCTION get_sale_for_return(uuid) IS 'Get detailed sale information for return processing including eligibility check';