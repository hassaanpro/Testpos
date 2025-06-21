/*
  # Receipt Generation System

  1. New Tables
    - `daily_counters` - Manages sequential numbering for daily receipts
    - Updates to `sales` table to add receipt tracking columns

  2. Functions
    - `generate_receipt_number()` - Generates unique sequential receipt numbers
    - Enhanced receipt generation and tracking

  3. Security
    - Enable RLS on new tables
    - Add policies for public access
*/

-- Create daily_counters table for sequential receipt numbering
CREATE TABLE IF NOT EXISTS daily_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  counter_date date NOT NULL UNIQUE,
  receipt_counter integer NOT NULL DEFAULT 0,
  bnpl_payment_counter integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Add receipt tracking columns to sales table
DO $$
BEGIN
  -- Add receipt_number column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'receipt_number'
  ) THEN
    ALTER TABLE sales ADD COLUMN receipt_number text UNIQUE;
  END IF;

  -- Add receipt_printed_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'receipt_printed_at'
  ) THEN
    ALTER TABLE sales ADD COLUMN receipt_printed_at timestamp with time zone;
  END IF;
END $$;

-- Enable RLS on daily_counters
ALTER TABLE daily_counters ENABLE ROW LEVEL SECURITY;

-- Create policies for public access
CREATE POLICY "Public access" ON daily_counters FOR ALL TO public USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_daily_counters_date ON daily_counters(counter_date);
CREATE INDEX IF NOT EXISTS idx_sales_receipt_number ON sales(receipt_number);
CREATE INDEX IF NOT EXISTS idx_sales_receipt_printed_at ON sales(receipt_printed_at);

-- Function to generate unique sequential receipt number
CREATE OR REPLACE FUNCTION generate_receipt_number(p_prefix text DEFAULT 'RCPT')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_date date := CURRENT_DATE;
  counter_value integer;
  receipt_number text;
  date_string text;
BEGIN
  -- Format date as YYYYMMDD
  date_string := to_char(current_date, 'YYYYMMDD');
  
  -- Get or create counter for today
  INSERT INTO daily_counters (counter_date, receipt_counter)
  VALUES (current_date, 1)
  ON CONFLICT (counter_date) 
  DO UPDATE SET 
    receipt_counter = daily_counters.receipt_counter + 1,
    updated_at = now()
  RETURNING receipt_counter INTO counter_value;
  
  -- Generate receipt number: PREFIX-YYYYMMDD-XXXX
  receipt_number := p_prefix || '-' || date_string || '-' || LPAD(counter_value::text, 4, '0');
  
  RETURN receipt_number;
END;
$$;

-- Function to generate BNPL payment confirmation number
CREATE OR REPLACE FUNCTION generate_bnpl_payment_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_date date := CURRENT_DATE;
  counter_value integer;
  confirmation_number text;
  date_string text;
BEGIN
  -- Format date as YYYYMMDD
  date_string := to_char(current_date, 'YYYYMMDD');
  
  -- Get or create counter for today
  INSERT INTO daily_counters (counter_date, bnpl_payment_counter)
  VALUES (current_date, 1)
  ON CONFLICT (counter_date) 
  DO UPDATE SET 
    bnpl_payment_counter = daily_counters.bnpl_payment_counter + 1,
    updated_at = now()
  RETURNING bnpl_payment_counter INTO counter_value;
  
  -- Generate confirmation number: BNPLPAY-YYYYMMDD-XXXX
  confirmation_number := 'BNPLPAY-' || date_string || '-' || LPAD(counter_value::text, 4, '0');
  
  RETURN confirmation_number;
END;
$$;

-- Function to mark receipt as printed
CREATE OR REPLACE FUNCTION mark_receipt_printed(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE sales
  SET 
    receipt_printed = true,
    receipt_printed_at = now()
  WHERE id = p_sale_id;
END;
$$;

-- Function to get receipt history with search and filtering
CREATE OR REPLACE FUNCTION get_receipt_history(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_customer_filter text DEFAULT NULL,
  p_payment_method_filter text DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  receipt_number text,
  invoice_number text,
  sale_date timestamp with time zone,
  customer_name text,
  customer_phone text,
  total_amount numeric(10,2),
  payment_method text,
  payment_status text,
  cashier_name text,
  receipt_printed boolean,
  receipt_printed_at timestamp with time zone,
  items_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.receipt_number,
    s.invoice_number,
    s.sale_date,
    c.name as customer_name,
    c.phone as customer_phone,
    s.total_amount,
    s.payment_method,
    s.payment_status,
    s.cashier_name,
    s.receipt_printed,
    s.receipt_printed_at,
    COUNT(si.id) as items_count
  FROM sales s
  LEFT JOIN customers c ON s.customer_id = c.id
  LEFT JOIN sale_items si ON s.id = si.sale_id
  WHERE 
    (p_start_date IS NULL OR s.sale_date::date >= p_start_date) AND
    (p_end_date IS NULL OR s.sale_date::date <= p_end_date) AND
    (p_customer_filter IS NULL OR c.name ILIKE '%' || p_customer_filter || '%') AND
    (p_payment_method_filter IS NULL OR s.payment_method = p_payment_method_filter) AND
    s.receipt_number IS NOT NULL
  GROUP BY s.id, c.name, c.phone
  ORDER BY s.sale_date DESC
  LIMIT p_limit;
END;
$$;

-- Function to get daily receipt statistics
CREATE OR REPLACE FUNCTION get_daily_receipt_stats(p_date date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  total_receipts bigint,
  printed_receipts bigint,
  unprinted_receipts bigint,
  total_revenue numeric(10,2),
  cash_receipts bigint,
  card_receipts bigint,
  bnpl_receipts bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_receipts,
    COUNT(CASE WHEN s.receipt_printed = true THEN 1 END) as printed_receipts,
    COUNT(CASE WHEN s.receipt_printed = false OR s.receipt_printed IS NULL THEN 1 END) as unprinted_receipts,
    COALESCE(SUM(s.total_amount), 0) as total_revenue,
    COUNT(CASE WHEN s.payment_method = 'cash' THEN 1 END) as cash_receipts,
    COUNT(CASE WHEN s.payment_method = 'card' THEN 1 END) as card_receipts,
    COUNT(CASE WHEN s.payment_method = 'bnpl' THEN 1 END) as bnpl_receipts
  FROM sales s
  WHERE s.sale_date::date = p_date
    AND s.receipt_number IS NOT NULL;
END;
$$;

-- Update existing sales to have receipt numbers (for existing data)
DO $$
DECLARE
  sale_record RECORD;
  new_receipt_number text;
BEGIN
  FOR sale_record IN 
    SELECT id, sale_date FROM sales 
    WHERE receipt_number IS NULL 
    ORDER BY sale_date ASC
  LOOP
    -- Generate receipt number for existing sales
    new_receipt_number := generate_receipt_number('RCPT');
    
    UPDATE sales 
    SET receipt_number = new_receipt_number
    WHERE id = sale_record.id;
  END LOOP;
END $$;

-- Create constraint to ensure receipt_number is always generated for new sales
ALTER TABLE sales ALTER COLUMN receipt_number SET NOT NULL;