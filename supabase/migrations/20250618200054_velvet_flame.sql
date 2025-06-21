/*
  # Customer Management System - Phase 1

  1. New Tables
    - `bnpl_transactions` - Buy Now Pay Later transaction tracking
  
  2. New Columns
    - `customers.total_outstanding_dues` - Total unpaid BNPL amounts
    - `customers.available_credit` - Remaining credit limit
  
  3. Enhanced Functions
    - Customer credit management
    - BNPL transaction processing
    - Loyalty points calculation
    - Financial reporting
  
  4. Security
    - Enable RLS on new tables
    - Add policies for public access
*/

-- Update customers table with financial tracking columns
DO $$
BEGIN
  -- Add total_outstanding_dues column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'total_outstanding_dues'
  ) THEN
    ALTER TABLE customers ADD COLUMN total_outstanding_dues numeric(10,2) DEFAULT 0 CHECK (total_outstanding_dues >= 0);
  END IF;

  -- Add available_credit column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'available_credit'
  ) THEN
    ALTER TABLE customers ADD COLUMN available_credit numeric(10,2) DEFAULT 0 CHECK (available_credit >= 0);
  END IF;
END $$;

-- Update sales table with enhanced payment status constraint
DO $$
BEGIN
  -- Add constraint for payment_status if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'sales' AND constraint_name = 'sales_payment_status_check_enhanced'
  ) THEN
    ALTER TABLE sales ADD CONSTRAINT sales_payment_status_check_enhanced 
    CHECK (payment_status IN ('paid', 'pending_bnpl', 'partially_paid', 'refunded'));
  END IF;
END $$;

-- Create BNPL transactions table
CREATE TABLE IF NOT EXISTS bnpl_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES sales(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  original_amount numeric(10,2) NOT NULL CHECK (original_amount > 0),
  amount_paid numeric(10,2) DEFAULT 0 CHECK (amount_paid >= 0),
  amount_due numeric(10,2) NOT NULL CHECK (amount_due >= 0),
  due_date date,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'partially_paid', 'paid', 'overdue')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on new tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE tablename = 'bnpl_transactions' AND rowsecurity = true
  ) THEN
    ALTER TABLE bnpl_transactions ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Create policies for public access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'bnpl_transactions' AND policyname = 'Public access'
  ) THEN
    CREATE POLICY "Public access" ON bnpl_transactions FOR ALL TO public USING (true);
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bnpl_transactions_customer_id ON bnpl_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_bnpl_transactions_sale_id ON bnpl_transactions(sale_id);
CREATE INDEX IF NOT EXISTS idx_bnpl_transactions_status ON bnpl_transactions(status);
CREATE INDEX IF NOT EXISTS idx_bnpl_transactions_due_date ON bnpl_transactions(due_date);

-- Initialize available_credit for existing customers
UPDATE customers 
SET available_credit = GREATEST(0, credit_limit - COALESCE(total_outstanding_dues, 0))
WHERE available_credit IS NULL OR available_credit = 0;

-- Insert default loyalty rule (check if it exists first)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM loyalty_rules 
    WHERE rule_name = 'Default BNPL Points Rule'
  ) THEN
    INSERT INTO loyalty_rules (rule_name, points_per_rupee, min_purchase_amount, is_active)
    VALUES ('Default BNPL Points Rule', 1.00, 0, true);
  END IF;
END $$;

-- Function to update customer credit after BNPL transaction
CREATE OR REPLACE FUNCTION update_customer_credit(
  p_customer_id uuid,
  p_amount numeric(10,2),
  p_operation text -- 'add_debt' or 'reduce_debt'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_operation = 'add_debt' THEN
    -- Increase outstanding dues, decrease available credit
    UPDATE customers
    SET 
      total_outstanding_dues = COALESCE(total_outstanding_dues, 0) + p_amount,
      available_credit = GREATEST(0, credit_limit - (COALESCE(total_outstanding_dues, 0) + p_amount)),
      updated_at = now()
    WHERE id = p_customer_id;
  ELSIF p_operation = 'reduce_debt' THEN
    -- Decrease outstanding dues, increase available credit
    UPDATE customers
    SET 
      total_outstanding_dues = GREATEST(0, COALESCE(total_outstanding_dues, 0) - p_amount),
      available_credit = GREATEST(0, credit_limit - GREATEST(0, COALESCE(total_outstanding_dues, 0) - p_amount)),
      updated_at = now()
    WHERE id = p_customer_id;
  END IF;
END;
$$;

-- Function to calculate and award loyalty points
CREATE OR REPLACE FUNCTION award_loyalty_points(
  p_customer_id uuid,
  p_purchase_amount numeric(10,2)
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  points_to_award integer := 0;
  loyalty_rule RECORD;
BEGIN
  -- Get active loyalty rule
  SELECT * INTO loyalty_rule
  FROM loyalty_rules
  WHERE is_active = true
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Calculate points if rule exists and purchase meets minimum
  IF FOUND AND p_purchase_amount >= loyalty_rule.min_purchase_amount THEN
    points_to_award := FLOOR(p_purchase_amount * loyalty_rule.points_per_rupee);
    
    -- Update customer loyalty points
    UPDATE customers
    SET 
      loyalty_points = COALESCE(loyalty_points, 0) + points_to_award,
      updated_at = now()
    WHERE id = p_customer_id;
    
    -- Record loyalty transaction
    INSERT INTO loyalty_transactions (
      customer_id,
      points_earned,
      transaction_date
    ) VALUES (
      p_customer_id,
      points_to_award,
      now()
    );
  END IF;
  
  RETURN points_to_award;
END;
$$;

-- Function to create BNPL transaction
CREATE OR REPLACE FUNCTION create_bnpl_transaction(
  p_sale_id uuid,
  p_customer_id uuid,
  p_amount numeric(10,2),
  p_due_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  bnpl_id uuid;
  calculated_due_date date;
BEGIN
  -- Calculate due date if not provided (30 days from now)
  IF p_due_date IS NULL THEN
    calculated_due_date := CURRENT_DATE + INTERVAL '30 days';
  ELSE
    calculated_due_date := p_due_date;
  END IF;
  
  -- Create BNPL transaction
  INSERT INTO bnpl_transactions (
    sale_id,
    customer_id,
    original_amount,
    amount_due,
    due_date,
    status
  ) VALUES (
    p_sale_id,
    p_customer_id,
    p_amount,
    p_amount,
    calculated_due_date,
    'pending'
  ) RETURNING id INTO bnpl_id;
  
  -- Update customer credit
  PERFORM update_customer_credit(p_customer_id, p_amount, 'add_debt');
  
  RETURN bnpl_id;
END;
$$;

-- Function to process BNPL payment
CREATE OR REPLACE FUNCTION process_bnpl_payment(
  p_bnpl_id uuid,
  p_payment_amount numeric(10,2)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  bnpl_record RECORD;
  new_amount_paid numeric(10,2);
  new_amount_due numeric(10,2);
  new_status text;
BEGIN
  -- Get BNPL transaction details
  SELECT * INTO bnpl_record
  FROM bnpl_transactions
  WHERE id = p_bnpl_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BNPL transaction not found';
  END IF;
  
  -- Calculate new amounts
  new_amount_paid := bnpl_record.amount_paid + p_payment_amount;
  new_amount_due := bnpl_record.original_amount - new_amount_paid;
  
  -- Determine new status
  IF new_amount_due <= 0 THEN
    new_status := 'paid';
    new_amount_due := 0;
  ELSIF new_amount_paid > 0 THEN
    new_status := 'partially_paid';
  ELSE
    new_status := bnpl_record.status;
  END IF;
  
  -- Update BNPL transaction
  UPDATE bnpl_transactions
  SET 
    amount_paid = new_amount_paid,
    amount_due = new_amount_due,
    status = new_status,
    updated_at = now()
  WHERE id = p_bnpl_id;
  
  -- Update customer credit (reduce debt)
  PERFORM update_customer_credit(bnpl_record.customer_id, p_payment_amount, 'reduce_debt');
  
  -- Award loyalty points if fully paid
  IF new_status = 'paid' THEN
    PERFORM award_loyalty_points(bnpl_record.customer_id, bnpl_record.original_amount);
  END IF;
END;
$$;

-- Function to get customer financial summary
CREATE OR REPLACE FUNCTION get_customer_financial_summary()
RETURNS TABLE (
  total_customers bigint,
  total_revenue numeric(10,2),
  total_outstanding_dues numeric(10,2),
  total_loyalty_points bigint,
  average_order_value numeric(10,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT c.id) as total_customers,
    COALESCE(SUM(CASE WHEN s.payment_status = 'paid' THEN s.total_amount ELSE 0 END), 0) as total_revenue,
    COALESCE(SUM(c.total_outstanding_dues), 0) as total_outstanding_dues,
    COALESCE(SUM(c.loyalty_points), 0) as total_loyalty_points,
    CASE 
      WHEN COUNT(CASE WHEN s.payment_status = 'paid' THEN s.id END) > 0 
      THEN COALESCE(SUM(CASE WHEN s.payment_status = 'paid' THEN s.total_amount ELSE 0 END), 0) / COUNT(CASE WHEN s.payment_status = 'paid' THEN s.id END)
      ELSE 0
    END as average_order_value
  FROM customers c
  LEFT JOIN sales s ON c.id = s.customer_id
  WHERE c.is_active = true;
END;
$$;

-- Function to check customer credit availability
CREATE OR REPLACE FUNCTION check_customer_credit(
  p_customer_id uuid,
  p_requested_amount numeric(10,2)
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  customer_record RECORD;
BEGIN
  -- Get customer credit info
  SELECT 
    credit_limit,
    COALESCE(total_outstanding_dues, 0) as total_outstanding_dues,
    COALESCE(available_credit, 0) as available_credit
  INTO customer_record
  FROM customers
  WHERE id = p_customer_id AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Check if customer has sufficient credit
  RETURN customer_record.available_credit >= p_requested_amount;
END;
$$;

-- Function to get customer BNPL summary
CREATE OR REPLACE FUNCTION get_customer_bnpl_summary(p_customer_id uuid)
RETURNS TABLE (
  total_bnpl_amount numeric(10,2),
  total_paid numeric(10,2),
  total_outstanding numeric(10,2),
  overdue_amount numeric(10,2),
  active_transactions bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(bt.original_amount), 0) as total_bnpl_amount,
    COALESCE(SUM(bt.amount_paid), 0) as total_paid,
    COALESCE(SUM(bt.amount_due), 0) as total_outstanding,
    COALESCE(SUM(CASE WHEN bt.due_date < CURRENT_DATE AND bt.status != 'paid' THEN bt.amount_due ELSE 0 END), 0) as overdue_amount,
    COUNT(CASE WHEN bt.status IN ('pending', 'partially_paid') THEN 1 END) as active_transactions
  FROM bnpl_transactions bt
  WHERE bt.customer_id = p_customer_id;
END;
$$;