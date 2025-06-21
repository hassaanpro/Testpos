/*
  # Receipt Visibility Investigation Functions

  1. Database Functions
    - get_current_timestamp_info: Get current database timestamp information
    - analyze_receipt_visibility: Check for receipt visibility issues after refunds
    - check_date_filter_accuracy: Analyze date filtering accuracy
    - get_timezone_mismatches: Identify potential timezone issues
    - get_receipt_search_metrics: Performance metrics for receipt searches

  2. Performance Improvements
    - Add indexes for better search performance
    - Enable pg_trgm extension for text search
*/

-- Enable the pg_trgm extension for better text search (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Function to get current timestamp information
CREATE OR REPLACE FUNCTION get_current_timestamp_info()
RETURNS TABLE (
  current_ts timestamptz,
  current_dt date,
  timezone_name text,
  utc_offset interval
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    now() as current_ts,
    CURRENT_DATE as current_dt,
    current_setting('TIMEZONE') as timezone_name,
    (now() - (now() AT TIME ZONE 'UTC')) as utc_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to analyze receipt visibility issues
CREATE OR REPLACE FUNCTION analyze_receipt_visibility()
RETURNS TABLE (
  receipt_number text,
  sale_id uuid,
  has_refund boolean,
  is_visible_in_sales boolean,
  is_searchable boolean,
  visibility_issue text
) AS $$
BEGIN
  RETURN QUERY
  WITH refunded_receipts AS (
    SELECT DISTINCT 
      s.receipt_number,
      s.id as sale_id,
      true as has_refund
    FROM sales s
    INNER JOIN refund_transactions rt ON s.id = rt.sale_id
  ),
  visibility_check AS (
    SELECT 
      rr.receipt_number,
      rr.sale_id,
      rr.has_refund,
      EXISTS(SELECT 1 FROM sales s WHERE s.receipt_number = rr.receipt_number) as is_visible_in_sales,
      EXISTS(
        SELECT 1 FROM sales s 
        WHERE s.receipt_number ILIKE '%' || rr.receipt_number || '%'
      ) as is_searchable
    FROM refunded_receipts rr
  )
  SELECT 
    vc.receipt_number,
    vc.sale_id,
    vc.has_refund,
    vc.is_visible_in_sales,
    vc.is_searchable,
    CASE 
      WHEN NOT vc.is_visible_in_sales THEN 'Receipt not found in sales table'
      WHEN NOT vc.is_searchable THEN 'Receipt not appearing in search results'
      ELSE 'No visibility issues'
    END as visibility_issue
  FROM visibility_check vc
  WHERE NOT vc.is_visible_in_sales OR NOT vc.is_searchable;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check date filter accuracy
CREATE OR REPLACE FUNCTION check_date_filter_accuracy(target_date date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  receipt_number text,
  sale_date timestamptz,
  sale_date_local date,
  appears_in_today_filter boolean,
  appears_in_yesterday_filter boolean,
  has_date_mismatch boolean,
  timezone_offset_hours numeric
) AS $$
DECLARE
  today_start timestamptz;
  today_end timestamptz;
  yesterday_start timestamptz;
  yesterday_end timestamptz;
BEGIN
  -- Calculate date ranges
  today_start := target_date::timestamptz;
  today_end := (target_date + interval '1 day')::timestamptz;
  yesterday_start := (target_date - interval '1 day')::timestamptz;
  yesterday_end := target_date::timestamptz;
  
  RETURN QUERY
  WITH recent_sales AS (
    SELECT 
      s.receipt_number,
      s.sale_date,
      s.sale_date::date as sale_date_local,
      EXTRACT(EPOCH FROM (s.sale_date - (s.sale_date AT TIME ZONE 'UTC'))) / 3600 as timezone_offset_hours
    FROM sales s
    WHERE s.sale_date >= yesterday_start 
    AND s.sale_date < today_end + interval '1 day'
  ),
  filter_analysis AS (
    SELECT 
      rs.*,
      (rs.sale_date >= today_start AND rs.sale_date < today_end) as appears_in_today_filter,
      (rs.sale_date >= yesterday_start AND rs.sale_date < yesterday_end) as appears_in_yesterday_filter
    FROM recent_sales rs
  )
  SELECT 
    fa.receipt_number,
    fa.sale_date,
    fa.sale_date_local,
    fa.appears_in_today_filter,
    fa.appears_in_yesterday_filter,
    (fa.sale_date_local != target_date AND fa.appears_in_today_filter) OR
    (fa.sale_date_local != (target_date - interval '1 day')::date AND fa.appears_in_yesterday_filter) as has_date_mismatch,
    fa.timezone_offset_hours
  FROM filter_analysis fa
  WHERE fa.appears_in_today_filter OR fa.appears_in_yesterday_filter;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to identify timezone mismatches
CREATE OR REPLACE FUNCTION get_timezone_mismatches()
RETURNS TABLE (
  receipt_number text,
  sale_date timestamptz,
  created_at timestamptz,
  time_difference_minutes numeric,
  has_significant_difference boolean,
  potential_timezone_issue boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.receipt_number,
    s.sale_date,
    s.created_at,
    EXTRACT(EPOCH FROM (s.sale_date - s.created_at)) / 60 as time_difference_minutes,
    ABS(EXTRACT(EPOCH FROM (s.sale_date - s.created_at)) / 60) > 60 as has_significant_difference,
    ABS(EXTRACT(EPOCH FROM (s.sale_date - s.created_at)) / 3600) BETWEEN 1 AND 23 as potential_timezone_issue
  FROM sales s
  WHERE s.created_at >= CURRENT_DATE - interval '7 days'
  ORDER BY s.created_at DESC
  LIMIT 100;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get receipt search performance metrics
CREATE OR REPLACE FUNCTION get_receipt_search_metrics()
RETURNS TABLE (
  total_receipts bigint,
  receipts_with_reprints bigint,
  avg_search_time_estimate numeric,
  indexing_recommendations text[]
) AS $$
DECLARE
  total_count bigint;
  reprint_count bigint;
BEGIN
  SELECT COUNT(*) INTO total_count FROM sales;
  
  SELECT COUNT(DISTINCT original_receipt_number) INTO reprint_count 
  FROM receipt_reprints;
  
  RETURN QUERY
  SELECT 
    total_count,
    reprint_count,
    CASE 
      WHEN total_count < 10000 THEN 0.1
      WHEN total_count < 100000 THEN 0.5
      ELSE 1.0
    END as avg_search_time_estimate,
    ARRAY[
      CASE WHEN total_count > 10000 THEN 'Consider adding index on receipt_number for faster searches' ELSE NULL END,
      CASE WHEN reprint_count > 1000 THEN 'Consider adding index on receipt_reprints.original_receipt_number' ELSE NULL END,
      CASE WHEN total_count > 50000 THEN 'Consider partitioning sales table by date' ELSE NULL END
    ]::text[] as indexing_recommendations;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create additional indexes for better search performance if they don't exist
CREATE INDEX IF NOT EXISTS idx_sales_receipt_number_search ON sales USING gin(receipt_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_number_search ON sales USING gin(invoice_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date_desc ON sales(sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_receipt_reprints_original_receipt ON receipt_reprints(original_receipt_number);