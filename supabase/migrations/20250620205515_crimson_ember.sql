/*
  # Fix Sales Analytics Functions

  1. Database Function Fixes
    - Fix `get_sales_trend` function to return proper timestamp with time zone types
    - Remove ambiguous overloads for `get_peak_hours_analysis` function
    - Ensure all timestamp columns use `timestamptz` type

  2. Function Updates
    - Update return types to match expected client-side types
    - Standardize date parameter handling
    - Remove function overloading conflicts
*/

-- Drop existing functions to recreate with correct types
DROP FUNCTION IF EXISTS get_sales_trend(text, text, text);
DROP FUNCTION IF EXISTS get_peak_hours_analysis(text, text);
DROP FUNCTION IF EXISTS get_peak_hours_analysis(date, date);

-- Recreate get_sales_trend with correct timestamp types
CREATE OR REPLACE FUNCTION get_sales_trend(
  p_start_date text,
  p_end_date text,
  p_group_by text DEFAULT 'day'
)
RETURNS TABLE (
  period_label text,
  period_date text,
  total_sales numeric,
  total_transactions bigint,
  average_order_value numeric,
  paid_transactions bigint,
  bnpl_transactions bigint
) AS $$
BEGIN
  IF p_group_by = 'hour' THEN
    RETURN QUERY
    SELECT 
      EXTRACT(hour FROM s.sale_date)::text || ':00' as period_label,
      TO_CHAR(s.sale_date, 'YYYY-MM-DD HH24:00:00') as period_date,
      COALESCE(SUM(s.total_amount), 0) as total_sales,
      COUNT(*)::bigint as total_transactions,
      COALESCE(AVG(s.total_amount), 0) as average_order_value,
      COUNT(CASE WHEN s.payment_status = 'paid' THEN 1 END)::bigint as paid_transactions,
      COUNT(CASE WHEN s.payment_status = 'pending_bnpl' THEN 1 END)::bigint as bnpl_transactions
    FROM sales s
    WHERE s.sale_date >= p_start_date::timestamptz
      AND s.sale_date <= p_end_date::timestamptz
    GROUP BY EXTRACT(hour FROM s.sale_date), DATE_TRUNC('hour', s.sale_date)
    ORDER BY DATE_TRUNC('hour', s.sale_date);
    
  ELSIF p_group_by = 'month' THEN
    RETURN QUERY
    SELECT 
      TO_CHAR(DATE_TRUNC('month', s.sale_date), 'Mon YYYY') as period_label,
      TO_CHAR(DATE_TRUNC('month', s.sale_date), 'YYYY-MM-01') as period_date,
      COALESCE(SUM(s.total_amount), 0) as total_sales,
      COUNT(*)::bigint as total_transactions,
      COALESCE(AVG(s.total_amount), 0) as average_order_value,
      COUNT(CASE WHEN s.payment_status = 'paid' THEN 1 END)::bigint as paid_transactions,
      COUNT(CASE WHEN s.payment_status = 'pending_bnpl' THEN 1 END)::bigint as bnpl_transactions
    FROM sales s
    WHERE s.sale_date >= p_start_date::timestamptz
      AND s.sale_date <= p_end_date::timestamptz
    GROUP BY DATE_TRUNC('month', s.sale_date)
    ORDER BY DATE_TRUNC('month', s.sale_date);
    
  ELSE -- Default to 'day'
    RETURN QUERY
    SELECT 
      TO_CHAR(DATE_TRUNC('day', s.sale_date), 'DD Mon') as period_label,
      TO_CHAR(DATE_TRUNC('day', s.sale_date), 'YYYY-MM-DD') as period_date,
      COALESCE(SUM(s.total_amount), 0) as total_sales,
      COUNT(*)::bigint as total_transactions,
      COALESCE(AVG(s.total_amount), 0) as average_order_value,
      COUNT(CASE WHEN s.payment_status = 'paid' THEN 1 END)::bigint as paid_transactions,
      COUNT(CASE WHEN s.payment_status = 'pending_bnpl' THEN 1 END)::bigint as bnpl_transactions
    FROM sales s
    WHERE s.sale_date >= p_start_date::timestamptz
      AND s.sale_date <= p_end_date::timestamptz
    GROUP BY DATE_TRUNC('day', s.sale_date)
    ORDER BY DATE_TRUNC('day', s.sale_date);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create single get_peak_hours_analysis function with text parameters only
CREATE OR REPLACE FUNCTION get_peak_hours_analysis(
  p_start_date text,
  p_end_date text
)
RETURNS TABLE (
  hour_value integer,
  hour_label text,
  avg_sales numeric,
  avg_transactions numeric,
  total_days bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    EXTRACT(hour FROM s.sale_date)::integer as hour_value,
    EXTRACT(hour FROM s.sale_date)::text || ':00' as hour_label,
    COALESCE(AVG(daily_sales.total_sales), 0) as avg_sales,
    COALESCE(AVG(daily_sales.total_transactions), 0) as avg_transactions,
    COUNT(DISTINCT DATE_TRUNC('day', s.sale_date))::bigint as total_days
  FROM sales s
  CROSS JOIN LATERAL (
    SELECT 
      SUM(s2.total_amount) as total_sales,
      COUNT(s2.id) as total_transactions
    FROM sales s2
    WHERE DATE_TRUNC('hour', s2.sale_date) = DATE_TRUNC('hour', s.sale_date)
  ) daily_sales
  WHERE s.sale_date >= p_start_date::timestamptz
    AND s.sale_date <= p_end_date::timestamptz
  GROUP BY EXTRACT(hour FROM s.sale_date)
  ORDER BY hour_value;
END;
$$ LANGUAGE plpgsql;

-- Ensure other analytics functions exist with correct types
CREATE OR REPLACE FUNCTION get_average_order_value(
  p_start_date text,
  p_end_date text
)
RETURNS TABLE (
  total_sales numeric,
  total_transactions bigint,
  average_order_value numeric,
  paid_transactions bigint,
  bnpl_transactions bigint,
  total_items_sold bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(s.total_amount), 0) as total_sales,
    COUNT(s.id)::bigint as total_transactions,
    COALESCE(AVG(s.total_amount), 0) as average_order_value,
    COUNT(CASE WHEN s.payment_status = 'paid' THEN 1 END)::bigint as paid_transactions,
    COUNT(CASE WHEN s.payment_status = 'pending_bnpl' THEN 1 END)::bigint as bnpl_transactions,
    COALESCE(SUM(si.quantity), 0)::bigint as total_items_sold
  FROM sales s
  LEFT JOIN sale_items si ON s.id = si.sale_id
  WHERE s.sale_date >= p_start_date::timestamptz
    AND s.sale_date <= p_end_date::timestamptz;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_sales_comparison(
  p_current_start text,
  p_current_end text,
  p_previous_start text,
  p_previous_end text
)
RETURNS TABLE (
  current_sales numeric,
  current_transactions bigint,
  current_aov numeric,
  previous_sales numeric,
  previous_transactions bigint,
  previous_aov numeric,
  sales_change_percent numeric,
  transactions_change_percent numeric,
  aov_change_percent numeric
) AS $$
DECLARE
  curr_sales numeric := 0;
  curr_transactions bigint := 0;
  curr_aov numeric := 0;
  prev_sales numeric := 0;
  prev_transactions bigint := 0;
  prev_aov numeric := 0;
BEGIN
  -- Get current period data
  SELECT 
    COALESCE(SUM(s.total_amount), 0),
    COUNT(s.id)::bigint,
    COALESCE(AVG(s.total_amount), 0)
  INTO curr_sales, curr_transactions, curr_aov
  FROM sales s
  WHERE s.sale_date >= p_current_start::timestamptz
    AND s.sale_date <= p_current_end::timestamptz;

  -- Get previous period data
  SELECT 
    COALESCE(SUM(s.total_amount), 0),
    COUNT(s.id)::bigint,
    COALESCE(AVG(s.total_amount), 0)
  INTO prev_sales, prev_transactions, prev_aov
  FROM sales s
  WHERE s.sale_date >= p_previous_start::timestamptz
    AND s.sale_date <= p_previous_end::timestamptz;

  RETURN QUERY
  SELECT 
    curr_sales as current_sales,
    curr_transactions as current_transactions,
    curr_aov as current_aov,
    prev_sales as previous_sales,
    prev_transactions as previous_transactions,
    prev_aov as previous_aov,
    CASE WHEN prev_sales > 0 THEN ((curr_sales - prev_sales) / prev_sales * 100) ELSE 0 END as sales_change_percent,
    CASE WHEN prev_transactions > 0 THEN ((curr_transactions - prev_transactions)::numeric / prev_transactions * 100) ELSE 0 END as transactions_change_percent,
    CASE WHEN prev_aov > 0 THEN ((curr_aov - prev_aov) / prev_aov * 100) ELSE 0 END as aov_change_percent;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_hourly_sales_trend(
  p_date text
)
RETURNS TABLE (
  hour_label text,
  hour_value integer,
  total_sales numeric,
  total_transactions bigint,
  average_order_value numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    EXTRACT(hour FROM s.sale_date)::text || ':00' as hour_label,
    EXTRACT(hour FROM s.sale_date)::integer as hour_value,
    COALESCE(SUM(s.total_amount), 0) as total_sales,
    COUNT(s.id)::bigint as total_transactions,
    COALESCE(AVG(s.total_amount), 0) as average_order_value
  FROM sales s
  WHERE DATE(s.sale_date) = p_date::date
  GROUP BY EXTRACT(hour FROM s.sale_date)
  ORDER BY hour_value;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_sales_summary_metrics(
  p_start_date text,
  p_end_date text
)
RETURNS TABLE (
  total_revenue numeric,
  total_transactions bigint,
  average_order_value numeric,
  total_items_sold bigint,
  unique_customers bigint,
  returning_customers bigint,
  peak_hour integer,
  peak_day text,
  conversion_rate numeric
) AS $$
DECLARE
  peak_hour_val integer;
  peak_day_val text;
BEGIN
  -- Get peak hour
  SELECT EXTRACT(hour FROM s.sale_date)::integer
  INTO peak_hour_val
  FROM sales s
  WHERE s.sale_date >= p_start_date::timestamptz
    AND s.sale_date <= p_end_date::timestamptz
  GROUP BY EXTRACT(hour FROM s.sale_date)
  ORDER BY SUM(s.total_amount) DESC
  LIMIT 1;

  -- Get peak day
  SELECT TO_CHAR(DATE_TRUNC('day', s.sale_date), 'Day')
  INTO peak_day_val
  FROM sales s
  WHERE s.sale_date >= p_start_date::timestamptz
    AND s.sale_date <= p_end_date::timestamptz
  GROUP BY DATE_TRUNC('day', s.sale_date)
  ORDER BY SUM(s.total_amount) DESC
  LIMIT 1;

  RETURN QUERY
  SELECT 
    COALESCE(SUM(s.total_amount), 0) as total_revenue,
    COUNT(s.id)::bigint as total_transactions,
    COALESCE(AVG(s.total_amount), 0) as average_order_value,
    COALESCE(SUM(si.quantity), 0)::bigint as total_items_sold,
    COUNT(DISTINCT s.customer_id)::bigint as unique_customers,
    COUNT(DISTINCT CASE WHEN customer_sales.sale_count > 1 THEN s.customer_id END)::bigint as returning_customers,
    COALESCE(peak_hour_val, 0) as peak_hour,
    COALESCE(peak_day_val, 'N/A') as peak_day,
    CASE WHEN COUNT(DISTINCT s.customer_id) > 0 THEN (COUNT(s.id)::numeric / COUNT(DISTINCT s.customer_id) * 100) ELSE 0 END as conversion_rate
  FROM sales s
  LEFT JOIN sale_items si ON s.id = si.sale_id
  LEFT JOIN (
    SELECT customer_id, COUNT(*) as sale_count
    FROM sales
    WHERE sale_date >= p_start_date::timestamptz
      AND sale_date <= p_end_date::timestamptz
    GROUP BY customer_id
  ) customer_sales ON s.customer_id = customer_sales.customer_id
  WHERE s.sale_date >= p_start_date::timestamptz
    AND s.sale_date <= p_end_date::timestamptz;
END;
$$ LANGUAGE plpgsql;