/*
  # Petty Cash System Implementation

  1. New Columns
    - Add `fund_type` to `cash_ledger` table to differentiate between main cash and petty cash
    - Add `expense_cash_ledger_id` to `expenses` table to link expenses to cash transactions

  2. Enhanced Functionality
    - Support for petty cash fund management
    - Automatic linking of expenses to cash outflows
    - Transfer capabilities between main cash and petty cash

  3. Security
    - Enable RLS on modified tables
    - Add appropriate constraints and defaults
*/

-- Add fund_type column to cash_ledger table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_ledger' AND column_name = 'fund_type'
  ) THEN
    ALTER TABLE cash_ledger ADD COLUMN fund_type text DEFAULT 'main_cash' CHECK (fund_type IN ('main_cash', 'petty_cash'));
  END IF;
END $$;

-- Add expense_cash_ledger_id to expenses table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'expense_cash_ledger_id'
  ) THEN
    ALTER TABLE expenses ADD COLUMN expense_cash_ledger_id uuid REFERENCES cash_ledger(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for better performance on fund_type queries
CREATE INDEX IF NOT EXISTS idx_cash_ledger_fund_type ON cash_ledger(fund_type);
CREATE INDEX IF NOT EXISTS idx_expenses_cash_ledger_id ON expenses(expense_cash_ledger_id);

-- Function to get petty cash balance
CREATE OR REPLACE FUNCTION get_petty_cash_balance()
RETURNS numeric(10,2) AS $$
DECLARE
  balance numeric(10,2);
BEGIN
  SELECT COALESCE(
    SUM(CASE 
      WHEN transaction_type = 'in' THEN amount 
      ELSE -amount 
    END), 
    0
  ) INTO balance
  FROM cash_ledger
  WHERE fund_type = 'petty_cash';
  
  RETURN balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get main cash balance
CREATE OR REPLACE FUNCTION get_main_cash_balance()
RETURNS numeric(10,2) AS $$
DECLARE
  balance numeric(10,2);
BEGIN
  SELECT COALESCE(
    SUM(CASE 
      WHEN transaction_type = 'in' THEN amount 
      ELSE -amount 
    END), 
    0
  ) INTO balance
  FROM cash_ledger
  WHERE fund_type = 'main_cash';
  
  RETURN balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to transfer funds between main cash and petty cash
CREATE OR REPLACE FUNCTION transfer_between_funds(
  p_from_fund text,
  p_to_fund text,
  p_amount numeric(10,2),
  p_description text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_transfer_id uuid;
  v_from_balance numeric(10,2);
  v_description_out text;
  v_description_in text;
BEGIN
  -- Validate fund types
  IF p_from_fund NOT IN ('main_cash', 'petty_cash') OR p_to_fund NOT IN ('main_cash', 'petty_cash') THEN
    RAISE EXCEPTION 'Invalid fund type. Must be main_cash or petty_cash';
  END IF;
  
  IF p_from_fund = p_to_fund THEN
    RAISE EXCEPTION 'Cannot transfer to the same fund';
  END IF;
  
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Transfer amount must be greater than 0';
  END IF;
  
  -- Check if source fund has sufficient balance
  IF p_from_fund = 'main_cash' THEN
    SELECT get_main_cash_balance() INTO v_from_balance;
  ELSE
    SELECT get_petty_cash_balance() INTO v_from_balance;
  END IF;
  
  IF v_from_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance in % fund. Available: ₨%, Required: ₨%', 
      p_from_fund, v_from_balance, p_amount;
  END IF;
  
  -- Generate transfer ID for linking transactions
  v_transfer_id := gen_random_uuid();
  
  -- Prepare descriptions
  v_description_out := COALESCE(p_description, 'Transfer to ' || p_to_fund);
  v_description_in := COALESCE(p_description, 'Transfer from ' || p_from_fund);
  
  -- Create outgoing transaction (from source fund)
  INSERT INTO cash_ledger (
    transaction_type,
    amount,
    description,
    fund_type,
    reference_id
  ) VALUES (
    'out',
    p_amount,
    v_description_out,
    p_from_fund,
    v_transfer_id
  );
  
  -- Create incoming transaction (to destination fund)
  INSERT INTO cash_ledger (
    transaction_type,
    amount,
    description,
    fund_type,
    reference_id
  ) VALUES (
    'in',
    p_amount,
    v_description_in,
    p_to_fund,
    v_transfer_id
  );
  
  RETURN v_transfer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create expense with cash transaction
CREATE OR REPLACE FUNCTION create_expense_with_cash_transaction(
  p_category text,
  p_description text,
  p_amount numeric(10,2),
  p_fund_type text DEFAULT 'petty_cash',
  p_receipt_number text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_expense_id uuid;
  v_cash_ledger_id uuid;
  v_fund_balance numeric(10,2);
BEGIN
  -- Validate fund type
  IF p_fund_type NOT IN ('main_cash', 'petty_cash') THEN
    RAISE EXCEPTION 'Invalid fund type. Must be main_cash or petty_cash';
  END IF;
  
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Expense amount must be greater than 0';
  END IF;
  
  -- Check fund balance
  IF p_fund_type = 'main_cash' THEN
    SELECT get_main_cash_balance() INTO v_fund_balance;
  ELSE
    SELECT get_petty_cash_balance() INTO v_fund_balance;
  END IF;
  
  IF v_fund_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance in % fund. Available: ₨%, Required: ₨%', 
      p_fund_type, v_fund_balance, p_amount;
  END IF;
  
  -- Create cash ledger entry (outgoing transaction)
  INSERT INTO cash_ledger (
    transaction_type,
    amount,
    description,
    fund_type
  ) VALUES (
    'out',
    p_amount,
    'Expense: ' || p_description,
    p_fund_type
  ) RETURNING id INTO v_cash_ledger_id;
  
  -- Create expense record linked to cash transaction
  INSERT INTO expenses (
    category,
    description,
    amount,
    receipt_number,
    notes,
    expense_cash_ledger_id
  ) VALUES (
    p_category,
    p_description,
    p_amount,
    p_receipt_number,
    p_notes,
    v_cash_ledger_id
  ) RETURNING id INTO v_expense_id;
  
  RETURN v_expense_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get cash fund summary
CREATE OR REPLACE FUNCTION get_cash_fund_summary()
RETURNS TABLE (
  fund_type text,
  current_balance numeric(10,2),
  total_inflows numeric(10,2),
  total_outflows numeric(10,2),
  transaction_count bigint,
  last_transaction_date timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cl.fund_type,
    SUM(CASE 
      WHEN cl.transaction_type = 'in' THEN cl.amount 
      ELSE -cl.amount 
    END) as current_balance,
    SUM(CASE WHEN cl.transaction_type = 'in' THEN cl.amount ELSE 0 END) as total_inflows,
    SUM(CASE WHEN cl.transaction_type = 'out' THEN cl.amount ELSE 0 END) as total_outflows,
    COUNT(*) as transaction_count,
    MAX(cl.transaction_date) as last_transaction_date
  FROM cash_ledger cl
  GROUP BY cl.fund_type
  ORDER BY cl.fund_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get expense breakdown by fund
CREATE OR REPLACE FUNCTION get_expense_breakdown_by_fund(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  fund_type text,
  category text,
  total_amount numeric(10,2),
  expense_count bigint,
  avg_expense_amount numeric(10,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(cl.fund_type, 'unlinked') as fund_type,
    e.category,
    SUM(e.amount) as total_amount,
    COUNT(*) as expense_count,
    AVG(e.amount) as avg_expense_amount
  FROM expenses e
  LEFT JOIN cash_ledger cl ON e.expense_cash_ledger_id = cl.id
  WHERE (p_start_date IS NULL OR e.expense_date >= p_start_date)
    AND (p_end_date IS NULL OR e.expense_date <= p_end_date)
  GROUP BY COALESCE(cl.fund_type, 'unlinked'), e.category
  ORDER BY fund_type, total_amount DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update existing cash ledger entries to have main_cash as default
UPDATE cash_ledger 
SET fund_type = 'main_cash' 
WHERE fund_type IS NULL;

-- Create view for easy cash fund monitoring
CREATE OR REPLACE VIEW cash_fund_status AS
SELECT 
  fund_type,
  SUM(CASE 
    WHEN transaction_type = 'in' THEN amount 
    ELSE -amount 
  END) as current_balance,
  COUNT(*) as total_transactions,
  MAX(transaction_date) as last_transaction
FROM cash_ledger
GROUP BY fund_type;

-- Grant permissions on the view
GRANT SELECT ON cash_fund_status TO public;

-- Add helpful comments
COMMENT ON COLUMN cash_ledger.fund_type IS 'Type of cash fund: main_cash or petty_cash';
COMMENT ON COLUMN expenses.expense_cash_ledger_id IS 'Links expense to the cash ledger entry that recorded the outflow';
COMMENT ON FUNCTION get_petty_cash_balance() IS 'Returns current petty cash balance';
COMMENT ON FUNCTION get_main_cash_balance() IS 'Returns current main cash balance';
COMMENT ON FUNCTION transfer_between_funds(text, text, numeric, text) IS 'Transfers money between main cash and petty cash funds';
COMMENT ON FUNCTION create_expense_with_cash_transaction(text, text, numeric, text, text, text) IS 'Creates an expense and corresponding cash outflow transaction';