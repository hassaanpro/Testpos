/*
  # Revert Schema Changes - Fix Dependencies

  This migration reverts all the changes made in previous migrations to restore the original schema.
  It properly handles dependencies by dropping views and functions before dropping columns.
*/

-- Drop cash_fund_status view first (it depends on fund_type column)
DROP VIEW IF EXISTS cash_fund_status CASCADE;

-- Drop functions related to returns and refunds
DROP FUNCTION IF EXISTS process_return_and_refund(uuid, jsonb, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS get_return_details(uuid) CASCADE;
DROP FUNCTION IF EXISTS get_returnable_items(uuid) CASCADE;
DROP FUNCTION IF EXISTS validate_return_eligibility(uuid) CASCADE;
DROP FUNCTION IF EXISTS calculate_loyalty_points_for_refund(numeric) CASCADE;
DROP FUNCTION IF EXISTS deduct_loyalty_points_for_refund(uuid, uuid, numeric, uuid) CASCADE;
DROP FUNCTION IF EXISTS get_customer_loyalty_history(uuid) CASCADE;

-- Drop functions related to cash management
DROP FUNCTION IF EXISTS get_petty_cash_balance() CASCADE;
DROP FUNCTION IF EXISTS get_main_cash_balance() CASCADE;
DROP FUNCTION IF EXISTS transfer_between_funds(text, text, numeric, text) CASCADE;
DROP FUNCTION IF EXISTS create_expense_with_cash_transaction(text, text, numeric, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS get_cash_fund_summary() CASCADE;
DROP FUNCTION IF EXISTS get_expense_breakdown_by_fund(date, date) CASCADE;

-- Drop functions related to receipt visibility
DROP FUNCTION IF EXISTS analyze_receipt_visibility() CASCADE;
DROP FUNCTION IF EXISTS check_date_filter_accuracy(date) CASCADE;
DROP FUNCTION IF EXISTS get_timezone_mismatches() CASCADE;
DROP FUNCTION IF EXISTS get_receipt_search_metrics() CASCADE;

-- Drop net sales functions
DROP FUNCTION IF EXISTS get_net_sales_summary(date, date) CASCADE;
DROP FUNCTION IF EXISTS get_daily_net_sales() CASCADE;
DROP FUNCTION IF EXISTS format_pakistan_datetime(timestamptz, text) CASCADE;

-- Drop returns table and related tables if they exist (with CASCADE to handle dependencies)
DROP TABLE IF EXISTS return_items CASCADE;
DROP TABLE IF EXISTS returns CASCADE;
DROP TABLE IF EXISTS refund_transactions CASCADE;

-- Drop indexes created for returns and cash management
DROP INDEX IF EXISTS idx_returns_sale_id;
DROP INDEX IF EXISTS idx_returns_customer_id;
DROP INDEX IF EXISTS idx_returns_return_date;
DROP INDEX IF EXISTS idx_returns_status;
DROP INDEX IF EXISTS idx_return_items_return_id;
DROP INDEX IF EXISTS idx_return_items_sale_item_id;
DROP INDEX IF EXISTS idx_return_items_product_id;
DROP INDEX IF EXISTS idx_refund_transactions_return_id;
DROP INDEX IF EXISTS idx_refund_transactions_sale_id;
DROP INDEX IF EXISTS idx_refund_transactions_customer_id;
DROP INDEX IF EXISTS idx_refund_transactions_date;
DROP INDEX IF EXISTS idx_cash_ledger_fund_type;
DROP INDEX IF EXISTS idx_expenses_cash_ledger_id;

-- Now safely drop columns after dependencies are removed

-- Revert changes to expenses table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'expense_cash_ledger_id'
  ) THEN
    ALTER TABLE expenses DROP COLUMN expense_cash_ledger_id;
  END IF;
END $$;

-- Revert changes to cash_ledger table (now safe after dropping the view)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cash_ledger' AND column_name = 'fund_type'
  ) THEN
    ALTER TABLE cash_ledger DROP COLUMN fund_type;
  END IF;
END $$;

-- Revert changes to sale_items table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'returned_quantity'
  ) THEN
    ALTER TABLE sale_items DROP COLUMN returned_quantity;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'is_returned'
  ) THEN
    ALTER TABLE sale_items DROP COLUMN is_returned;
  END IF;
END $$;

-- Revert changes to sales table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'return_status'
  ) THEN
    ALTER TABLE sales DROP COLUMN return_status;
  END IF;
END $$;

-- Remove any constraints that might have been added
DO $$
BEGIN
  -- Remove return_status check constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'sales' AND constraint_name = 'sales_return_status_check'
  ) THEN
    ALTER TABLE sales DROP CONSTRAINT sales_return_status_check;
  END IF;
  
  -- Remove returned_quantity check constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'sale_items' AND constraint_name = 'sale_items_returned_quantity_check'
  ) THEN
    ALTER TABLE sale_items DROP CONSTRAINT sale_items_returned_quantity_check;
  END IF;
  
  -- Remove fund_type check constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'cash_ledger' AND constraint_name = 'cash_ledger_fund_type_check'
  ) THEN
    ALTER TABLE cash_ledger DROP CONSTRAINT cash_ledger_fund_type_check;
  END IF;
END $$;

-- Clean up any triggers that might have been added
DROP TRIGGER IF EXISTS trigger_update_return_status ON sales;
DROP TRIGGER IF EXISTS trigger_validate_return_quantity ON sale_items;
DROP TRIGGER IF EXISTS trigger_update_cash_fund_balance ON cash_ledger;

-- Clean up any additional functions that might exist
DROP FUNCTION IF EXISTS update_return_status() CASCADE;
DROP FUNCTION IF EXISTS validate_return_quantity() CASCADE;
DROP FUNCTION IF EXISTS update_cash_fund_balance() CASCADE;