-- Fix Conversion Rate Calculation
-- The conversion rate should be: (paid_transactions / total_transactions) * 100

-- Drop and recreate the get_sales_summary_metrics function with correct conversion rate
DROP FUNCTION IF EXISTS get_sales_summary_metrics(TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_sales_summary_metrics(
  p_start_date TEXT,
  p_end_date TEXT
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
  total_items_val INTEGER;
  paid_transactions_val INTEGER;
BEGIN
  -- Get basic metrics
  SELECT 
    COALESCE(SUM(total_amount), 0),
    COUNT(*)::INTEGER,
    COUNT(DISTINCT customer_id)::INTEGER,
    COUNT(CASE WHEN payment_status = 'paid' THEN 1 END)::INTEGER
  INTO total_revenue_val, total_transactions_val, unique_customers_val, paid_transactions_val
  FROM sales
  WHERE DATE(sale_date) >= p_start_date::DATE AND DATE(sale_date) <= p_end_date::DATE;
  
  -- Get total items sold
  SELECT COALESCE(SUM(si.quantity), 0)::INTEGER
  INTO total_items_val
  FROM sale_items si
  JOIN sales s ON si.sale_id = s.id
  WHERE DATE(s.sale_date) >= p_start_date::DATE AND DATE(s.sale_date) <= p_end_date::DATE;
  
  -- Get returning customers (customers with more than 1 transaction)
  SELECT COUNT(*)::INTEGER
  INTO returning_customers_val
  FROM (
    SELECT customer_id
    FROM sales
    WHERE DATE(sale_date) >= p_start_date::DATE AND DATE(sale_date) <= p_end_date::DATE
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
    total_items_val,
    unique_customers_val,
    returning_customers_val,
    (
      SELECT EXTRACT(HOUR FROM sale_date)::INTEGER
      FROM sales
      WHERE DATE(sale_date) >= p_start_date::DATE AND DATE(sale_date) <= p_end_date::DATE
      GROUP BY EXTRACT(HOUR FROM sale_date)
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ) as peak_hour,
    (
      SELECT to_char(sale_date, 'Day')
      FROM sales
      WHERE DATE(sale_date) >= p_start_date::DATE AND DATE(sale_date) <= p_end_date::DATE
      GROUP BY to_char(sale_date, 'Day')
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ) as peak_day,
    CASE 
      WHEN total_transactions_val > 0 THEN 
        (paid_transactions_val::DECIMAL / total_transactions_val) * 100
      ELSE 0
    END as conversion_rate;
END;
$$ LANGUAGE plpgsql;

-- Test the function
SELECT 'Testing fixed conversion rate calculation...' as test_name;
SELECT 
  total_revenue,
  total_transactions,
  conversion_rate,
  CASE 
    WHEN total_transactions > 0 THEN 
      (total_transactions - (conversion_rate * total_transactions / 100))::INTEGER
    ELSE 0
  END as unpaid_transactions
FROM get_sales_summary_metrics('2025-06-15', '2025-06-21');

-- Show the actual sales data for verification
SELECT 'Actual sales data for verification:' as info;
SELECT 
  COUNT(*) as total_transactions,
  COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_transactions,
  COUNT(CASE WHEN payment_status != 'paid' THEN 1 END) as unpaid_transactions,
  ROUND(
    (COUNT(CASE WHEN payment_status = 'paid' THEN 1 END)::DECIMAL / COUNT(*)) * 100, 
    2
  ) as calculated_conversion_rate
FROM sales 
WHERE DATE(sale_date) >= '2025-06-15'::DATE 
  AND DATE(sale_date) <= '2025-06-21'::DATE; 