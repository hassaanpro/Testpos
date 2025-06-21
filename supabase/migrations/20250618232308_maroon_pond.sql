/*
  # Fix Sales Summary Metrics Function

  1. Function Fix
    - Fix the `get_sales_summary_metrics` function to properly handle GROUP BY clauses
    - Use subqueries for peak_hour and peak_day calculations
    - Ensure all non-aggregated columns are properly handled

  2. Changes
    - Replace peak_hour and peak_day calculations with proper subqueries
    - Fix SQL aggregation issues that were causing the 42803 error
*/

CREATE OR REPLACE FUNCTION get_sales_summary_metrics(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  total_revenue NUMERIC,
  total_transactions BIGINT,
  average_order_value NUMERIC,
  total_items_sold BIGINT,
  unique_customers BIGINT,
  returning_customers BIGINT,
  peak_hour INTEGER,
  peak_day TEXT,
  conversion_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    -- Total revenue from paid transactions
    COALESCE(SUM(CASE WHEN s.payment_status = 'paid' THEN s.total_amount ELSE 0 END), 0) AS total_revenue,
    
    -- Total number of transactions
    COUNT(s.id) AS total_transactions,
    
    -- Average order value (paid transactions only)
    CASE 
      WHEN COUNT(CASE WHEN s.payment_status = 'paid' THEN 1 END) > 0 
      THEN COALESCE(SUM(CASE WHEN s.payment_status = 'paid' THEN s.total_amount ELSE 0 END) / COUNT(CASE WHEN s.payment_status = 'paid' THEN 1 END), 0)
      ELSE 0 
    END AS average_order_value,
    
    -- Total items sold
    COALESCE((
      SELECT SUM(si.quantity)
      FROM sale_items si
      JOIN sales s_inner ON si.sale_id = s_inner.id
      WHERE s_inner.sale_date::DATE BETWEEN p_start_date AND p_end_date
    ), 0) AS total_items_sold,
    
    -- Unique customers
    COUNT(DISTINCT s.customer_id) FILTER (WHERE s.customer_id IS NOT NULL) AS unique_customers,
    
    -- Returning customers (customers with more than one transaction in period)
    COALESCE((
      SELECT COUNT(*)
      FROM (
        SELECT s_inner.customer_id
        FROM sales s_inner
        WHERE s_inner.sale_date::DATE BETWEEN p_start_date AND p_end_date
          AND s_inner.customer_id IS NOT NULL
        GROUP BY s_inner.customer_id
        HAVING COUNT(*) > 1
      ) returning_customer_counts
    ), 0) AS returning_customers,
    
    -- Peak Hour (hour with highest total sales)
    COALESCE((
      SELECT EXTRACT(HOUR FROM s_inner.sale_date)::INTEGER
      FROM sales s_inner
      WHERE s_inner.sale_date::DATE BETWEEN p_start_date AND p_end_date
        AND s_inner.payment_status = 'paid'
      GROUP BY EXTRACT(HOUR FROM s_inner.sale_date)
      ORDER BY SUM(s_inner.total_amount) DESC
      LIMIT 1
    ), 0) AS peak_hour,
    
    -- Peak Day (day with highest total sales)
    COALESCE((
      SELECT s_inner.sale_date::DATE::TEXT
      FROM sales s_inner
      WHERE s_inner.sale_date::DATE BETWEEN p_start_date AND p_end_date
        AND s_inner.payment_status = 'paid'
      GROUP BY s_inner.sale_date::DATE
      ORDER BY SUM(s_inner.total_amount) DESC
      LIMIT 1
    ), p_start_date::TEXT) AS peak_day,
    
    -- Conversion rate (paid transactions / total transactions)
    CASE 
      WHEN COUNT(s.id) > 0 
      THEN (COUNT(CASE WHEN s.payment_status = 'paid' THEN 1 END)::NUMERIC / COUNT(s.id)::NUMERIC) * 100
      ELSE 0 
    END AS conversion_rate
    
  FROM sales s
  WHERE s.sale_date::DATE BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql;