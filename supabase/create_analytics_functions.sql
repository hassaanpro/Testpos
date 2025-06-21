-- Create analytics functions for sales analytics

-- Function to get sales trend data
CREATE OR REPLACE FUNCTION get_sales_trend(
  p_start_date DATE,
  p_end_date DATE,
  p_group_by TEXT DEFAULT 'day'
)
RETURNS TABLE (
  period_label TEXT,
  period_date DATE,
  total_sales DECIMAL,
  total_transactions INTEGER,
  average_order_value DECIMAL,
  paid_transactions INTEGER,
  bnpl_transactions INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN p_group_by = 'hour' THEN to_char(sale_date, 'HH24:00')
      WHEN p_group_by = 'day' THEN to_char(sale_date, 'Mon DD')
      WHEN p_group_by = 'month' THEN to_char(sale_date, 'Mon YYYY')
      ELSE to_char(sale_date, 'Mon DD')
    END as period_label,
    DATE(sale_date) as period_date,
    COALESCE(SUM(total_amount), 0) as total_sales,
    COUNT(*)::INTEGER as total_transactions,
    COALESCE(AVG(total_amount), 0) as average_order_value,
    COUNT(CASE WHEN payment_status = 'paid' THEN 1 END)::INTEGER as paid_transactions,
    COUNT(CASE WHEN payment_method = 'bnpl' THEN 1 END)::INTEGER as bnpl_transactions
  FROM sales
  WHERE DATE(sale_date) >= p_start_date AND DATE(sale_date) <= p_end_date
  GROUP BY 
    CASE 
      WHEN p_group_by = 'hour' THEN EXTRACT(HOUR FROM sale_date)
      WHEN p_group_by = 'day' THEN DATE(sale_date)
      WHEN p_group_by = 'month' THEN DATE_TRUNC('month', sale_date)
      ELSE DATE(sale_date)
    END
  ORDER BY period_date;
END;
$$ LANGUAGE plpgsql;

-- Function to get average order value
CREATE OR REPLACE FUNCTION get_average_order_value(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  total_sales DECIMAL,
  total_transactions INTEGER,
  average_order_value DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(total_amount), 0) as total_sales,
    COUNT(*)::INTEGER as total_transactions,
    COALESCE(AVG(total_amount), 0) as average_order_value
  FROM sales
  WHERE DATE(sale_date) >= p_start_date AND DATE(sale_date) <= p_end_date;
END;
$$ LANGUAGE plpgsql;

-- Function to get sales comparison
CREATE OR REPLACE FUNCTION get_sales_comparison(
  p_current_start DATE,
  p_current_end DATE,
  p_previous_start DATE,
  p_previous_end DATE
)
RETURNS TABLE (
  current_sales DECIMAL,
  current_transactions INTEGER,
  current_aov DECIMAL,
  previous_sales DECIMAL,
  previous_transactions INTEGER,
  previous_aov DECIMAL,
  sales_change_percent DECIMAL,
  transactions_change_percent DECIMAL,
  aov_change_percent DECIMAL
) AS $$
DECLARE
  current_sales_val DECIMAL;
  current_transactions_val INTEGER;
  current_aov_val DECIMAL;
  previous_sales_val DECIMAL;
  previous_transactions_val INTEGER;
  previous_aov_val DECIMAL;
BEGIN
  -- Get current period data
  SELECT 
    COALESCE(SUM(total_amount), 0),
    COUNT(*)::INTEGER,
    COALESCE(AVG(total_amount), 0)
  INTO current_sales_val, current_transactions_val, current_aov_val
  FROM sales
  WHERE DATE(sale_date) >= p_current_start AND DATE(sale_date) <= p_current_end;
  
  -- Get previous period data
  SELECT 
    COALESCE(SUM(total_amount), 0),
    COUNT(*)::INTEGER,
    COALESCE(AVG(total_amount), 0)
  INTO previous_sales_val, previous_transactions_val, previous_aov_val
  FROM sales
  WHERE DATE(sale_date) >= p_previous_start AND DATE(sale_date) <= p_previous_end;
  
  RETURN QUERY
  SELECT 
    current_sales_val,
    current_transactions_val,
    current_aov_val,
    previous_sales_val,
    previous_transactions_val,
    previous_aov_val,
    CASE 
      WHEN previous_sales_val > 0 THEN 
        ((current_sales_val - previous_sales_val) / previous_sales_val) * 100
      ELSE 0
    END as sales_change_percent,
    CASE 
      WHEN previous_transactions_val > 0 THEN 
        ((current_transactions_val - previous_transactions_val)::DECIMAL / previous_transactions_val) * 100
      ELSE 0
    END as transactions_change_percent,
    CASE 
      WHEN previous_aov_val > 0 THEN 
        ((current_aov_val - previous_aov_val) / previous_aov_val) * 100
      ELSE 0
    END as aov_change_percent;
END;
$$ LANGUAGE plpgsql;

-- Function to get hourly sales trend
CREATE OR REPLACE FUNCTION get_hourly_sales_trend(p_date DATE)
RETURNS TABLE (
  hour_label TEXT,
  hour_value INTEGER,
  total_sales DECIMAL,
  total_transactions INTEGER,
  average_order_value DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    to_char(sale_date, 'HH24:00') as hour_label,
    EXTRACT(HOUR FROM sale_date)::INTEGER as hour_value,
    COALESCE(SUM(total_amount), 0) as total_sales,
    COUNT(*)::INTEGER as total_transactions,
    COALESCE(AVG(total_amount), 0) as average_order_value
  FROM sales
  WHERE DATE(sale_date) = p_date
  GROUP BY EXTRACT(HOUR FROM sale_date)
  ORDER BY hour_value;
END;
$$ LANGUAGE plpgsql;

-- Function to get sales summary metrics
CREATE OR REPLACE FUNCTION get_sales_summary_metrics(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  total_revenue DECIMAL,
  total_transactions INTEGER,
  average_order_value DECIMAL,
  total_items_sold INTEGER,
  unique_customers INTEGER,
  returning_customers INTEGER,
  peak_hour INTEGER,
  peak_day TEXT,
  conversion_rate DECIMAL
) AS $$
DECLARE
  total_revenue_val DECIMAL;
  total_transactions_val INTEGER;
  unique_customers_val INTEGER;
  returning_customers_val INTEGER;
BEGIN
  -- Get basic metrics
  SELECT 
    COALESCE(SUM(total_amount), 0),
    COUNT(*)::INTEGER,
    COUNT(DISTINCT customer_id)::INTEGER
  INTO total_revenue_val, total_transactions_val, unique_customers_val
  FROM sales
  WHERE DATE(sale_date) >= p_start_date AND DATE(sale_date) <= p_end_date;
  
  -- Get returning customers (customers with more than 1 transaction)
  SELECT COUNT(*)::INTEGER
  INTO returning_customers_val
  FROM (
    SELECT customer_id
    FROM sales
    WHERE DATE(sale_date) >= p_start_date AND DATE(sale_date) <= p_end_date
      AND customer_id IS NOT NULL
    GROUP BY customer_id
    HAVING COUNT(*) > 1
  ) returning_customers;
  
  RETURN QUERY
  SELECT 
    total_revenue_val,
    total_transactions_val,
    CASE 
      WHEN total_transactions_val > 0 THEN total_revenue_val / total_transactions_val
      ELSE 0
    END as average_order_value,
    COALESCE((
      SELECT SUM(quantity)
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE DATE(s.sale_date) >= p_start_date AND DATE(s.sale_date) <= p_end_date
    ), 0)::INTEGER as total_items_sold,
    unique_customers_val,
    returning_customers_val,
    (
      SELECT EXTRACT(HOUR FROM sale_date)::INTEGER
      FROM sales
      WHERE DATE(sale_date) >= p_start_date AND DATE(sale_date) <= p_end_date
      GROUP BY EXTRACT(HOUR FROM sale_date)
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ) as peak_hour,
    (
      SELECT to_char(sale_date, 'Day')
      FROM sales
      WHERE DATE(sale_date) >= p_start_date AND DATE(sale_date) <= p_end_date
      GROUP BY to_char(sale_date, 'Day')
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ) as peak_day,
    CASE 
      WHEN total_transactions_val > 0 THEN 
        (unique_customers_val::DECIMAL / total_transactions_val) * 100
      ELSE 0
    END as conversion_rate;
END;
$$ LANGUAGE plpgsql;

-- Function to get peak hours analysis
CREATE OR REPLACE FUNCTION get_peak_hours_analysis(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  hour_value INTEGER,
  hour_label TEXT,
  avg_sales DECIMAL,
  avg_transactions DECIMAL,
  total_days INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    EXTRACT(HOUR FROM sale_date)::INTEGER as hour_value,
    to_char(sale_date, 'HH24:00') as hour_label,
    COALESCE(AVG(total_amount), 0) as avg_sales,
    COALESCE(AVG(daily_transactions), 0) as avg_transactions,
    COUNT(DISTINCT DATE(sale_date))::INTEGER as total_days
  FROM (
    SELECT 
      sale_date,
      total_amount,
      COUNT(*) OVER (PARTITION BY DATE(sale_date), EXTRACT(HOUR FROM sale_date)) as daily_transactions
    FROM sales
    WHERE DATE(sale_date) >= p_start_date AND DATE(sale_date) <= p_end_date
  ) hourly_data
  GROUP BY EXTRACT(HOUR FROM sale_date)
  ORDER BY hour_value;
END;
$$ LANGUAGE plpgsql; 