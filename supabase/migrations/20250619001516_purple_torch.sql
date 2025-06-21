/*
  # Add Net Sales RPC Function

  1. New Functions
    - `get_net_sales_summary` - Calculates total gross sales, total refunds, and net sales for a date range
    - `get_daily_net_sales` - Calculates net sales for the current day (accounting for refunds)
    - `format_pakistan_datetime` - Helper function to format dates in Pakistan Standard Time

  2. Security
    - All functions use SECURITY DEFINER to ensure proper access control
*/

-- Function to calculate net sales summary for a date range
CREATE OR REPLACE FUNCTION get_net_sales_summary(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  gross_sales NUMERIC(10,2),
  total_refunds NUMERIC(10,2),
  net_sales NUMERIC(10,2),
  transaction_count BIGINT,
  refund_count BIGINT,
  average_sale NUMERIC(10,2),
  average_refund NUMERIC(10,2)
) AS $$
BEGIN
  RETURN QUERY
  WITH sales_data AS (
    SELECT 
      COALESCE(SUM(s.total_amount), 0) AS gross_sales,
      COUNT(s.id) AS transaction_count
    FROM sales s
    WHERE s.sale_date::DATE BETWEEN p_start_date AND p_end_date
      AND s.payment_status = 'paid'
  ),
  refund_data AS (
    SELECT 
      COALESCE(SUM(r.amount), 0) AS total_refunds,
      COUNT(r.id) AS refund_count
    FROM refund_transactions r
    WHERE r.transaction_date::DATE BETWEEN p_start_date AND p_end_date
      AND r.status = 'completed'
  )
  SELECT 
    sd.gross_sales,
    rd.total_refunds,
    (sd.gross_sales - rd.total_refunds) AS net_sales,
    sd.transaction_count,
    rd.refund_count,
    CASE WHEN sd.transaction_count > 0 THEN sd.gross_sales / sd.transaction_count ELSE 0 END AS average_sale,
    CASE WHEN rd.refund_count > 0 THEN rd.total_refunds / rd.refund_count ELSE 0 END AS average_refund
  FROM sales_data sd, refund_data rd;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get daily net sales (for today)
CREATE OR REPLACE FUNCTION get_daily_net_sales()
RETURNS TABLE (
  gross_sales NUMERIC(10,2),
  total_refunds NUMERIC(10,2),
  net_sales NUMERIC(10,2),
  transaction_count BIGINT,
  refund_count BIGINT
) AS $$
DECLARE
  today_date DATE := CURRENT_DATE;
BEGIN
  RETURN QUERY
  WITH sales_data AS (
    SELECT 
      COALESCE(SUM(s.total_amount), 0) AS gross_sales,
      COUNT(s.id) AS transaction_count
    FROM sales s
    WHERE s.sale_date::DATE = today_date
      AND s.payment_status = 'paid'
  ),
  refund_data AS (
    SELECT 
      COALESCE(SUM(r.amount), 0) AS total_refunds,
      COUNT(r.id) AS refund_count
    FROM refund_transactions r
    WHERE r.transaction_date::DATE = today_date
      AND r.status = 'completed'
  )
  SELECT 
    sd.gross_sales,
    rd.total_refunds,
    (sd.gross_sales - rd.total_refunds) AS net_sales,
    sd.transaction_count,
    rd.refund_count
  FROM sales_data sd, refund_data rd;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to format timestamps in Pakistan Standard Time
CREATE OR REPLACE FUNCTION format_pakistan_datetime(
  p_timestamp TIMESTAMPTZ,
  p_format TEXT DEFAULT 'YYYY-MM-DD HH24:MI:SS'
)
RETURNS TEXT AS $$
BEGIN
  RETURN TO_CHAR(p_timestamp AT TIME ZONE 'Asia/Karachi', p_format);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment to explain the function
COMMENT ON FUNCTION get_net_sales_summary(DATE, DATE) IS 'Calculates net sales (gross sales minus refunds) for a given date range';
COMMENT ON FUNCTION get_daily_net_sales() IS 'Calculates net sales for the current day, accounting for refunds';
COMMENT ON FUNCTION format_pakistan_datetime(TIMESTAMPTZ, TEXT) IS 'Formats a timestamp in Pakistan Standard Time (UTC+5)';