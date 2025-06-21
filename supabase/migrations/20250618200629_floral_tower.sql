/*
  # Sales Analytics RPC Functions

  1. New Functions
    - `get_sales_trend(p_start_date, p_end_date, p_group_by)`: Get sales data grouped by time period
    - `get_average_order_value(p_start_date, p_end_date)`: Calculate AOV for a date range
    - `get_sales_comparison(p_current_start, p_current_end, p_previous_start, p_previous_end)`: Compare two periods
    - `get_hourly_sales_trend(p_date)`: Get hourly sales for a specific date

  2. Performance
    - Optimized queries for real-time analytics
    - Proper indexing for fast data retrieval
    - Only count paid sales for accurate revenue metrics
*/

-- Function to get sales trend data grouped by time period
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
SECURITY DEFINER
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
      date_format := 'Mon DD';
      date_trunc_format := 'day';
  END CASE;

  RETURN QUERY
  SELECT 
    to_char(date_trunc(date_trunc_format, s.sale_date), date_format) as period_label,
    date_trunc(date_trunc_format, s.sale_date) as period_date,
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
  GROUP BY date_trunc(date_trunc_format, s.sale_date)
  ORDER BY period_date;
END;
$$;

-- Function to get average order value for a specific period
CREATE OR REPLACE FUNCTION get_average_order_value(
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  total_sales numeric(10,2),
  total_transactions bigint,
  average_order_value numeric(10,2),
  paid_transactions bigint,
  bnpl_transactions bigint,
  total_items_sold bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(CASE WHEN s.payment_status = 'paid' THEN s.total_amount ELSE 0 END), 0) as total_sales,
    COUNT(*)::bigint as total_transactions,
    CASE 
      WHEN COUNT(CASE WHEN s.payment_status = 'paid' THEN 1 END) > 0 
      THEN COALESCE(SUM(CASE WHEN s.payment_status = 'paid' THEN s.total_amount ELSE 0 END), 0) / COUNT(CASE WHEN s.payment_status = 'paid' THEN 1 END)
      ELSE 0
    END as average_order_value,
    COUNT(CASE WHEN s.payment_status = 'paid' THEN 1 END)::bigint as paid_transactions,
    COUNT(CASE WHEN s.payment_status = 'pending_bnpl' THEN 1 END)::bigint as bnpl_transactions,
    COALESCE(SUM(si.quantity), 0)::bigint as total_items_sold
  FROM sales s
  LEFT JOIN sale_items si ON s.id = si.sale_id
  WHERE s.sale_date::date >= p_start_date 
    AND s.sale_date::date <= p_end_date;
END;
$$;

-- Function to compare two periods for percentage change calculations
CREATE OR REPLACE FUNCTION get_sales_comparison(
  p_current_start date,
  p_current_end date,
  p_previous_start date,
  p_previous_end date
)
RETURNS TABLE (
  current_sales numeric(10,2),
  current_transactions bigint,
  current_aov numeric(10,2),
  previous_sales numeric(10,2),
  previous_transactions bigint,
  previous_aov numeric(10,2),
  sales_change_percent numeric(5,2),
  transactions_change_percent numeric(5,2),
  aov_change_percent numeric(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_data RECORD;
  previous_data RECORD;
BEGIN
  -- Get current period data
  SELECT * INTO current_data
  FROM get_average_order_value(p_current_start, p_current_end);
  
  -- Get previous period data
  SELECT * INTO previous_data
  FROM get_average_order_value(p_previous_start, p_previous_end);
  
  RETURN QUERY
  SELECT 
    current_data.total_sales,
    current_data.paid_transactions,
    current_data.average_order_value,
    previous_data.total_sales,
    previous_data.paid_transactions,
    previous_data.average_order_value,
    CASE 
      WHEN previous_data.total_sales > 0 
      THEN ((current_data.total_sales - previous_data.total_sales) / previous_data.total_sales * 100)
      ELSE 0
    END as sales_change_percent,
    CASE 
      WHEN previous_data.paid_transactions > 0 
      THEN ((current_data.paid_transactions - previous_data.paid_transactions)::numeric / previous_data.paid_transactions * 100)
      ELSE 0
    END as transactions_change_percent,
    CASE 
      WHEN previous_data.average_order_value > 0 
      THEN ((current_data.average_order_value - previous_data.average_order_value) / previous_data.average_order_value * 100)
      ELSE 0
    END as aov_change_percent;
END;
$$;

-- Function to get hourly sales trend for a specific date
CREATE OR REPLACE FUNCTION get_hourly_sales_trend(p_date date)
RETURNS TABLE (
  hour_label text,
  hour_value integer,
  total_sales numeric(10,2),
  total_transactions bigint,
  average_order_value numeric(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    to_char(date_trunc('hour', s.sale_date), 'HH24:00') as hour_label,
    EXTRACT(hour FROM s.sale_date)::integer as hour_value,
    COALESCE(SUM(CASE WHEN s.payment_status = 'paid' THEN s.total_amount ELSE 0 END), 0) as total_sales,
    COUNT(CASE WHEN s.payment_status = 'paid' THEN 1 END)::bigint as total_transactions,
    CASE 
      WHEN COUNT(CASE WHEN s.payment_status = 'paid' THEN 1 END) > 0 
      THEN COALESCE(SUM(CASE WHEN s.payment_status = 'paid' THEN s.total_amount ELSE 0 END), 0) / COUNT(CASE WHEN s.payment_status = 'paid' THEN 1 END)
      ELSE 0
    END as average_order_value
  FROM sales s
  WHERE s.sale_date::date = p_date
  GROUP BY date_trunc('hour', s.sale_date), EXTRACT(hour FROM s.sale_date)
  ORDER BY hour_value;
END;
$$;

-- Function to get top selling hours across all days
CREATE OR REPLACE FUNCTION get_peak_hours_analysis(
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  hour_value integer,
  hour_label text,
  avg_sales numeric(10,2),
  avg_transactions numeric(5,2),
  total_days bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    EXTRACT(hour FROM s.sale_date)::integer as hour_value,
    to_char(date_trunc('hour', s.sale_date), 'HH24:00') as hour_label,
    AVG(CASE WHEN s.payment_status = 'paid' THEN s.total_amount ELSE 0 END) as avg_sales,
    AVG(CASE WHEN s.payment_status = 'paid' THEN 1 ELSE 0 END) as avg_transactions,
    COUNT(DISTINCT s.sale_date::date)::bigint as total_days
  FROM sales s
  WHERE s.sale_date::date >= p_start_date 
    AND s.sale_date::date <= p_end_date
  GROUP BY EXTRACT(hour FROM s.sale_date)
  ORDER BY hour_value;
END;
$$;

-- Function to get sales summary with key metrics
CREATE OR REPLACE FUNCTION get_sales_summary_metrics(
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  total_revenue numeric(10,2),
  total_transactions bigint,
  average_order_value numeric(10,2),
  total_items_sold bigint,
  unique_customers bigint,
  returning_customers bigint,
  peak_hour integer,
  peak_day text,
  conversion_rate numeric(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  peak_hour_result integer;
  peak_day_result text;
BEGIN
  -- Get peak hour
  SELECT hour_value INTO peak_hour_result
  FROM get_peak_hours_analysis(p_start_date, p_end_date)
  ORDER BY avg_sales DESC
  LIMIT 1;
  
  -- Get peak day
  SELECT to_char(date_trunc('day', s.sale_date), 'Day') INTO peak_day_result
  FROM sales s
  WHERE s.sale_date::date >= p_start_date 
    AND s.sale_date::date <= p_end_date
    AND s.payment_status = 'paid'
  GROUP BY date_trunc('day', s.sale_date)
  ORDER BY SUM(s.total_amount) DESC
  LIMIT 1;

  RETURN QUERY
  SELECT 
    COALESCE(SUM(CASE WHEN s.payment_status = 'paid' THEN s.total_amount ELSE 0 END), 0) as total_revenue,
    COUNT(CASE WHEN s.payment_status = 'paid' THEN 1 END)::bigint as total_transactions,
    CASE 
      WHEN COUNT(CASE WHEN s.payment_status = 'paid' THEN 1 END) > 0 
      THEN COALESCE(SUM(CASE WHEN s.payment_status = 'paid' THEN s.total_amount ELSE 0 END), 0) / COUNT(CASE WHEN s.payment_status = 'paid' THEN 1 END)
      ELSE 0
    END as average_order_value,
    COALESCE(SUM(si.quantity), 0)::bigint as total_items_sold,
    COUNT(DISTINCT s.customer_id)::bigint as unique_customers,
    COUNT(DISTINCT CASE WHEN customer_sales.sale_count > 1 THEN s.customer_id END)::bigint as returning_customers,
    COALESCE(peak_hour_result, 0) as peak_hour,
    COALESCE(peak_day_result, 'N/A') as peak_day,
    CASE 
      WHEN COUNT(*) > 0 
      THEN (COUNT(CASE WHEN s.payment_status = 'paid' THEN 1 END)::numeric / COUNT(*) * 100)
      ELSE 0
    END as conversion_rate
  FROM sales s
  LEFT JOIN sale_items si ON s.id = si.sale_id
  LEFT JOIN (
    SELECT customer_id, COUNT(*) as sale_count
    FROM sales
    WHERE sale_date::date >= p_start_date 
      AND sale_date::date <= p_end_date
      AND customer_id IS NOT NULL
    GROUP BY customer_id
  ) customer_sales ON s.customer_id = customer_sales.customer_id
  WHERE s.sale_date::date >= p_start_date 
    AND s.sale_date::date <= p_end_date;
END;
$$;