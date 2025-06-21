-- First drop the existing function that we're trying to modify
DROP FUNCTION IF EXISTS get_current_timestamp_info();

-- Now recreate the function with the new return type
CREATE OR REPLACE FUNCTION get_current_timestamp_info()
RETURNS TABLE (
  current_ts timestamptz,
  current_dt date,
  timezone_name text,
  utc_offset interval,
  pakistan_time text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    now() as current_ts,
    CURRENT_DATE as current_dt,
    current_setting('TIMEZONE') as timezone_name,
    (now() - (now() AT TIME ZONE 'UTC')) as utc_offset,
    to_char(now() AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD HH24:MI:SS') as pakistan_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix get_peak_hours_analysis function to handle date parameters consistently
CREATE OR REPLACE FUNCTION get_peak_hours_analysis(
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  hour_value integer,
  hour_label text,
  avg_sales numeric,
  avg_transactions numeric,
  total_days bigint
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    EXTRACT(HOUR FROM (s.sale_date AT TIME ZONE 'Asia/Karachi'))::integer as hour_value,
    CASE 
      WHEN EXTRACT(HOUR FROM (s.sale_date AT TIME ZONE 'Asia/Karachi')) = 0 THEN '12 AM'
      WHEN EXTRACT(HOUR FROM (s.sale_date AT TIME ZONE 'Asia/Karachi')) < 12 THEN EXTRACT(HOUR FROM (s.sale_date AT TIME ZONE 'Asia/Karachi'))::text || ' AM'
      WHEN EXTRACT(HOUR FROM (s.sale_date AT TIME ZONE 'Asia/Karachi')) = 12 THEN '12 PM'
      ELSE (EXTRACT(HOUR FROM (s.sale_date AT TIME ZONE 'Asia/Karachi')) - 12)::text || ' PM'
    END as hour_label,
    ROUND(AVG(s.total_amount), 2) as avg_sales,
    ROUND(AVG(transaction_count), 2) as avg_transactions,
    COUNT(DISTINCT DATE(s.sale_date AT TIME ZONE 'Asia/Karachi')) as total_days
  FROM (
    SELECT 
      sale_date,
      total_amount,
      COUNT(*) OVER (PARTITION BY DATE(sale_date AT TIME ZONE 'Asia/Karachi'), EXTRACT(HOUR FROM (sale_date AT TIME ZONE 'Asia/Karachi'))) as transaction_count
    FROM sales 
    WHERE sale_date >= p_start_date::timestamp 
      AND sale_date <= (p_end_date::timestamp + INTERVAL '1 day - 1 second')
      AND payment_status = 'paid'
  ) s
  GROUP BY EXTRACT(HOUR FROM (s.sale_date AT TIME ZONE 'Asia/Karachi'))
  ORDER BY hour_value;
END;
$$;

-- Fix get_sales_trend function to handle timezone properly
CREATE OR REPLACE FUNCTION get_sales_trend(
  p_start_date date,
  p_end_date date,
  p_group_by text DEFAULT 'day' -- 'hour', 'day', 'month'
)
RETURNS TABLE (
  period_label text,
  period_date timestamp with time zone,
  total_sales numeric(10,2),
  total_transactions bigint,
  average_order_value numeric(10,2),
  paid_transactions bigint,
  bnpl_transactions bigint
)
LANGUAGE plpgsql
AS $$
DECLARE
  date_format text;
  date_trunc_format text;
BEGIN
  -- Set format based on grouping
  CASE p_group_by
    WHEN 'hour' THEN
      date_format := 'HH24:MI';
      date_trunc_format := 'hour';
    WHEN 'month' THEN
      date_format := 'Mon YYYY';
      date_trunc_format := 'month';
    ELSE -- 'day'
      date_format := 'DD-MM';
      date_trunc_format := 'day';
  END CASE;

  RETURN QUERY
  SELECT 
    to_char(date_trunc(date_trunc_format, s.sale_date AT TIME ZONE 'Asia/Karachi'), date_format) as period_label,
    date_trunc(date_trunc_format, s.sale_date AT TIME ZONE 'Asia/Karachi') as period_date,
    COALESCE(SUM(CASE WHEN s.payment_status = 'paid' THEN s.total_amount ELSE 0 END), 0) as total_sales,
    COUNT(*)::bigint as total_transactions,
    CASE 
      WHEN COUNT(CASE WHEN s.payment_status = 'paid' THEN 1 END) > 0 
      THEN COALESCE(SUM(CASE WHEN s.payment_status = 'paid' THEN s.total_amount ELSE 0 END), 0) / COUNT(CASE WHEN s.payment_status = 'paid' THEN 1 END)
      ELSE 0
    END as average_order_value,
    COUNT(CASE WHEN s.payment_status = 'paid' THEN 1 END)::bigint as paid_transactions,
    COUNT(CASE WHEN s.payment_status = 'pending_bnpl' THEN 1 END)::bigint as bnpl_transactions
  FROM sales s
  WHERE s.sale_date::date >= p_start_date 
    AND s.sale_date::date <= p_end_date
  GROUP BY date_trunc(date_trunc_format, s.sale_date AT TIME ZONE 'Asia/Karachi')
  ORDER BY period_date;
END;
$$;

-- Fix get_hourly_sales_trend function to handle timezone properly
CREATE OR REPLACE FUNCTION get_hourly_sales_trend(p_date date)
RETURNS TABLE (
  hour_label text,
  hour_value integer,
  total_sales numeric(10,2),
  total_transactions bigint,
  average_order_value numeric(10,2)
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    to_char(date_trunc('hour', s.sale_date AT TIME ZONE 'Asia/Karachi'), 'HH24:00') as hour_label,
    EXTRACT(hour FROM s.sale_date AT TIME ZONE 'Asia/Karachi')::integer as hour_value,
    COALESCE(SUM(CASE WHEN s.payment_status = 'paid' THEN s.total_amount ELSE 0 END), 0) as total_sales,
    COUNT(CASE WHEN s.payment_status = 'paid' THEN 1 END)::bigint as total_transactions,
    CASE 
      WHEN COUNT(CASE WHEN s.payment_status = 'paid' THEN 1 END) > 0 
      THEN COALESCE(SUM(CASE WHEN s.payment_status = 'paid' THEN s.total_amount ELSE 0 END), 0) / COUNT(CASE WHEN s.payment_status = 'paid' THEN 1 END)
      ELSE 0
    END as average_order_value
  FROM sales s
  WHERE DATE(s.sale_date AT TIME ZONE 'Asia/Karachi') = p_date
  GROUP BY date_trunc('hour', s.sale_date AT TIME ZONE 'Asia/Karachi'), EXTRACT(hour FROM s.sale_date AT TIME ZONE 'Asia/Karachi')
  ORDER BY hour_value;
END;
$$;

-- Fix search_receipts function to handle timezone properly
CREATE OR REPLACE FUNCTION search_receipts(
  p_search_term text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_payment_status text DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  sale_id uuid,
  receipt_number text,
  invoice_number text,
  sale_date timestamp with time zone,
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
  receipt_printed boolean,
  receipt_printed_at timestamp with time zone,
  items_count bigint,
  reprint_count bigint
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id as sale_id,
    s.receipt_number,
    s.invoice_number,
    s.sale_date,
    s.customer_id,
    c.name as customer_name,
    c.phone as customer_phone,
    c.email as customer_email,
    s.total_amount,
    s.subtotal,
    s.discount_amount,
    s.tax_amount,
    s.payment_method,
    s.payment_status,
    s.cashier_name,
    s.receipt_printed,
    s.receipt_printed_at,
    COUNT(DISTINCT si.id) as items_count,
    COUNT(DISTINCT rr.id) as reprint_count
  FROM sales s
  LEFT JOIN customers c ON s.customer_id = c.id
  LEFT JOIN sale_items si ON s.id = si.sale_id
  LEFT JOIN receipt_reprints rr ON s.id = rr.original_sale_id
  WHERE 
    s.receipt_number IS NOT NULL AND
    (p_search_term IS NULL OR 
     s.receipt_number ILIKE '%' || p_search_term || '%' OR
     s.invoice_number ILIKE '%' || p_search_term || '%' OR
     c.name ILIKE '%' || p_search_term || '%' OR
     c.phone ILIKE '%' || p_search_term || '%') AND
    (p_start_date IS NULL OR DATE(s.sale_date AT TIME ZONE 'Asia/Karachi') >= p_start_date) AND
    (p_end_date IS NULL OR DATE(s.sale_date AT TIME ZONE 'Asia/Karachi') <= p_end_date) AND
    (p_customer_name IS NULL OR c.name ILIKE '%' || p_customer_name || '%') AND
    (p_payment_method IS NULL OR s.payment_method = p_payment_method) AND
    (p_payment_status IS NULL OR s.payment_status = p_payment_status)
  GROUP BY s.id, c.name, c.phone, c.email
  ORDER BY s.sale_date DESC
  LIMIT p_limit;
END;
$$;

-- Fix get_receipt_history function to handle timezone properly
CREATE OR REPLACE FUNCTION get_receipt_history(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_customer_filter text DEFAULT NULL,
  p_payment_method_filter text DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  receipt_number text,
  invoice_number text,
  sale_date timestamp with time zone,
  customer_name text,
  customer_phone text,
  total_amount numeric(10,2),
  payment_method text,
  payment_status text,
  cashier_name text,
  receipt_printed boolean,
  receipt_printed_at timestamp with time zone,
  items_count bigint
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.receipt_number,
    s.invoice_number,
    s.sale_date,
    c.name as customer_name,
    c.phone as customer_phone,
    s.total_amount,
    s.payment_method,
    s.payment_status,
    s.cashier_name,
    s.receipt_printed,
    s.receipt_printed_at,
    COUNT(si.id) as items_count
  FROM sales s
  LEFT JOIN customers c ON s.customer_id = c.id
  LEFT JOIN sale_items si ON s.id = si.sale_id
  WHERE 
    (p_start_date IS NULL OR DATE(s.sale_date AT TIME ZONE 'Asia/Karachi') >= p_start_date) AND
    (p_end_date IS NULL OR DATE(s.sale_date AT TIME ZONE 'Asia/Karachi') <= p_end_date) AND
    (p_customer_filter IS NULL OR c.name ILIKE '%' || p_customer_filter || '%') AND
    (p_payment_method_filter IS NULL OR s.payment_method = p_payment_method_filter) AND
    s.receipt_number IS NOT NULL
  GROUP BY s.id, c.name, c.phone
  ORDER BY s.sale_date DESC
  LIMIT p_limit;
END;
$$;

-- Fix search_sales_for_returns function to handle timezone properly
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
DECLARE
  return_window_days integer := 30;
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
      AND (p_start_date IS NULL OR DATE(s.sale_date AT TIME ZONE 'Asia/Karachi') >= p_start_date)
      AND (p_end_date IS NULL OR DATE(s.sale_date AT TIME ZONE 'Asia/Karachi') <= p_end_date)
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

-- Add comment to explain timezone handling
COMMENT ON FUNCTION get_peak_hours_analysis(date, date) IS 'Analyzes sales data by hour of day, properly handling Pakistan timezone (UTC+5)';
COMMENT ON FUNCTION get_sales_trend(date, date, text) IS 'Gets sales trend data grouped by time period, properly handling Pakistan timezone (UTC+5)';
COMMENT ON FUNCTION get_hourly_sales_trend(date) IS 'Gets hourly sales trend for a specific date, properly handling Pakistan timezone (UTC+5)';
COMMENT ON FUNCTION search_receipts(text, date, date, text, text, text, integer) IS 'Searches receipts with proper timezone handling for Pakistan (UTC+5)';
COMMENT ON FUNCTION get_receipt_history(date, date, text, text, integer) IS 'Gets receipt history with proper timezone handling for Pakistan (UTC+5)';
COMMENT ON FUNCTION search_sales_for_returns(text, date, date, integer) IS 'Searches sales eligible for returns with proper timezone handling for Pakistan (UTC+5)';
COMMENT ON FUNCTION get_current_timestamp_info() IS 'Gets current timestamp information including Pakistan timezone (UTC+5)';