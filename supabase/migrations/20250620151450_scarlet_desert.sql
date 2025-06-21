/*
  # Fix get_peak_hours_analysis function

  1. Function Updates
    - Fix the `get_peak_hours_analysis` function to properly handle GROUP BY clause
    - Ensure all non-aggregate columns are included in GROUP BY
    - Return proper hourly analysis data for sales analytics

  2. Changes Made
    - Updated the function to extract hour from sale_date and group by it
    - Added proper aggregation for sales metrics
    - Fixed column references to match GROUP BY requirements
*/

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS get_peak_hours_analysis(text, text);

-- Create the corrected get_peak_hours_analysis function
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
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    EXTRACT(HOUR FROM s.sale_date)::integer as hour_value,
    CASE 
      WHEN EXTRACT(HOUR FROM s.sale_date) = 0 THEN '12 AM'
      WHEN EXTRACT(HOUR FROM s.sale_date) < 12 THEN EXTRACT(HOUR FROM s.sale_date)::text || ' AM'
      WHEN EXTRACT(HOUR FROM s.sale_date) = 12 THEN '12 PM'
      ELSE (EXTRACT(HOUR FROM s.sale_date) - 12)::text || ' PM'
    END as hour_label,
    ROUND(AVG(s.total_amount), 2) as avg_sales,
    ROUND(AVG(transaction_count), 2) as avg_transactions,
    COUNT(DISTINCT DATE(s.sale_date)) as total_days
  FROM (
    SELECT 
      sale_date,
      total_amount,
      COUNT(*) OVER (PARTITION BY DATE(sale_date), EXTRACT(HOUR FROM sale_date)) as transaction_count
    FROM sales 
    WHERE sale_date >= p_start_date::timestamp 
      AND sale_date <= (p_end_date::timestamp + INTERVAL '1 day - 1 second')
      AND payment_status = 'paid'
  ) s
  GROUP BY EXTRACT(HOUR FROM s.sale_date)
  ORDER BY hour_value;
END;
$$;