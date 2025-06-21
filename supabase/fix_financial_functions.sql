-- Fix Financial Functions with Proper Type Casting
-- This resolves all type mismatch errors

-- 1. Function to get financial summary for a date range
CREATE OR REPLACE FUNCTION get_financial_summary(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE (
  total_revenue numeric(10,2),
  total_expenses numeric(10,2),
  net_profit numeric(10,2),
  cash_in numeric(10,2),
  cash_out numeric(10,2),
  cash_balance numeric(10,2),
  profit_margin_percentage numeric(5,2)
) AS $$
DECLARE
  v_revenue numeric(10,2) := 0;
  v_expenses numeric(10,2) := 0;
  v_cash_in numeric(10,2) := 0;
  v_cash_out numeric(10,2) := 0;
BEGIN
  -- Calculate revenue from sales
  SELECT COALESCE(SUM(total_amount), 0) INTO v_revenue
  FROM sales
  WHERE payment_status = 'paid'
    AND (p_date_from IS NULL OR sale_date::date >= p_date_from)
    AND (p_date_to IS NULL OR sale_date::date <= p_date_to);
  
  -- Calculate expenses
  SELECT COALESCE(SUM(amount), 0) INTO v_expenses
  FROM expenses
  WHERE (p_date_from IS NULL OR expense_date::date >= p_date_from)
    AND (p_date_to IS NULL OR expense_date::date <= p_date_to);
  
  -- Calculate cash in (sales + other cash in)
  SELECT COALESCE(SUM(amount), 0) INTO v_cash_in
  FROM cash_ledger
  WHERE transaction_type IN ('sale', 'in')
    AND (p_date_from IS NULL OR transaction_date::date >= p_date_from)
    AND (p_date_to IS NULL OR transaction_date::date <= p_date_to);
  
  -- Calculate cash out (expenses + refunds + other cash out)
  SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_cash_out
  FROM cash_ledger
  WHERE transaction_type IN ('expense', 'refund', 'out')
    AND amount < 0
    AND (p_date_from IS NULL OR transaction_date::date >= p_date_from)
    AND (p_date_to IS NULL OR transaction_date::date <= p_date_to);
  
  RETURN QUERY
  SELECT 
    v_revenue,
    v_expenses,
    v_revenue - v_expenses,
    v_cash_in,
    v_cash_out,
    v_cash_in - v_cash_out,
    CASE 
      WHEN v_revenue > 0 THEN ((v_revenue - v_expenses) / v_revenue) * 100
      ELSE 0
    END;
END;
$$ LANGUAGE plpgsql;

-- 2. Function to get cash balance at any point in time
CREATE OR REPLACE FUNCTION get_cash_balance(p_date timestamptz DEFAULT now())
RETURNS numeric(10,2) AS $$
DECLARE
  v_balance numeric(10,2) := 0;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM cash_ledger
  WHERE transaction_date <= p_date;
  
  RETURN v_balance;
END;
$$ LANGUAGE plpgsql;

-- 3. Function to get expense breakdown by category (with proper type casting)
CREATE OR REPLACE FUNCTION get_expense_breakdown(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE (
  category text,
  total_amount numeric(10,2),
  expense_count bigint,
  percentage_of_total numeric(5,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.category::text,  -- Explicit cast to text
    SUM(e.amount) as total_amount,
    COUNT(*) as expense_count,
    CASE 
      WHEN (SELECT SUM(amount) FROM expenses 
            WHERE (p_date_from IS NULL OR expense_date::date >= p_date_from)
              AND (p_date_to IS NULL OR expense_date::date <= p_date_to)) > 0
      THEN (SUM(e.amount) / (SELECT SUM(amount) FROM expenses 
                             WHERE (p_date_from IS NULL OR expense_date::date >= p_date_from)
                               AND (p_date_to IS NULL OR expense_date::date <= p_date_to))) * 100
      ELSE 0
    END as percentage_of_total
  FROM expenses e
  WHERE (p_date_from IS NULL OR e.expense_date::date >= p_date_from)
    AND (p_date_to IS NULL OR e.expense_date::date <= p_date_to)
  GROUP BY e.category
  ORDER BY total_amount DESC;
END;
$$ LANGUAGE plpgsql;

-- 4. Function to get cash flow summary (with proper type casting)
CREATE OR REPLACE FUNCTION get_cash_flow_summary(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE (
  transaction_type text,
  total_amount numeric(10,2),
  transaction_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cl.transaction_type::text,  -- Explicit cast to text
    SUM(cl.amount) as total_amount,
    COUNT(*) as transaction_count
  FROM cash_ledger cl
  WHERE (p_date_from IS NULL OR cl.transaction_date::date >= p_date_from)
    AND (p_date_to IS NULL OR cl.transaction_date::date <= p_date_to)
  GROUP BY cl.transaction_type
  ORDER BY total_amount DESC;
END;
$$ LANGUAGE plpgsql;

-- 5. Function to automatically create cash ledger entries for sales
CREATE OR REPLACE FUNCTION create_sale_cash_entry()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create cash entry for cash sales
  IF NEW.payment_method = 'cash' AND NEW.payment_status = 'paid' THEN
    INSERT INTO cash_ledger (
      transaction_type,
      amount,
      description,
      reference_id,
      reference_type,
      transaction_date
    ) VALUES (
      'sale',
      NEW.total_amount,
      'Cash sale: ' || NEW.receipt_number,
      NEW.id,
      'sale',
      NEW.sale_date
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Function to automatically create cash ledger entries for expenses
CREATE OR REPLACE FUNCTION create_expense_cash_entry()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO cash_ledger (
    transaction_type,
    amount,
    description,
    reference_id,
    reference_type,
    transaction_date
  ) VALUES (
    'expense',
    -NEW.amount,
    'Expense: ' || NEW.category || ' - ' || NEW.description,
    NEW.id,
    'expense',
    NEW.expense_date
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Create triggers (if they don't exist)
DROP TRIGGER IF EXISTS trigger_create_sale_cash_entry ON sales;
CREATE TRIGGER trigger_create_sale_cash_entry
  AFTER INSERT ON sales
  FOR EACH ROW
  EXECUTE FUNCTION create_sale_cash_entry();

DROP TRIGGER IF EXISTS trigger_create_expense_cash_entry ON expenses;
CREATE TRIGGER trigger_create_expense_cash_entry
  AFTER INSERT ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION create_expense_cash_entry();

-- Test the fixed functions
SELECT 'Testing financial summary for today:' as info;
SELECT * FROM get_financial_summary(CURRENT_DATE, CURRENT_DATE);

SELECT 'Testing cash balance:' as info;
SELECT get_cash_balance() as current_cash_balance;

SELECT 'Testing expense breakdown:' as info;
SELECT * FROM get_expense_breakdown(CURRENT_DATE, CURRENT_DATE);

SELECT 'Testing cash flow summary:' as info;
SELECT * FROM get_cash_flow_summary(CURRENT_DATE, CURRENT_DATE);

-- Insert sample data for testing
INSERT INTO cash_ledger (transaction_type, amount, description, reference_type, transaction_date)
VALUES 
  ('in', 1000.00, 'Initial cash deposit', 'opening_balance', now() - interval '30 days')
ON CONFLICT DO NOTHING;

SELECT 'Sample data inserted. Testing updated financial summary:' as info;
SELECT * FROM get_financial_summary(CURRENT_DATE, CURRENT_DATE); 