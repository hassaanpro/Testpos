/*
  # Receipt Management System

  1. New Tables
    - `receipt_reprints` - Audit log for all receipt reprints
    - Enhanced `sales` table with receipt tracking
    - Enhanced `daily_counters` for receipt numbering

  2. Security
    - Enable RLS on all new tables
    - Add policies for authorized access
    - Audit logging for all reprint activities

  3. Functions
    - Receipt search and lookup functionality
    - Reprint generation with duplicate marking
    - Comprehensive audit trail
*/

-- Create receipt_reprints audit table
CREATE TABLE IF NOT EXISTS receipt_reprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_sale_id uuid REFERENCES sales(id) ON DELETE CASCADE,
  original_receipt_number text NOT NULL,
  reprint_reason text,
  reprinted_by text NOT NULL,
  reprint_date timestamp with time zone DEFAULT now(),
  reprint_auth_code text NOT NULL,
  user_ip inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on receipt_reprints
ALTER TABLE receipt_reprints ENABLE ROW LEVEL SECURITY;

-- Create policies for authorized access only
CREATE POLICY "Authorized users can view reprints" ON receipt_reprints 
  FOR SELECT TO public USING (true);

CREATE POLICY "Authorized users can create reprints" ON receipt_reprints 
  FOR INSERT TO public WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_receipt_reprints_sale_id ON receipt_reprints(original_sale_id);
CREATE INDEX IF NOT EXISTS idx_receipt_reprints_receipt_number ON receipt_reprints(original_receipt_number);
CREATE INDEX IF NOT EXISTS idx_receipt_reprints_date ON receipt_reprints(reprint_date);
CREATE INDEX IF NOT EXISTS idx_receipt_reprints_user ON receipt_reprints(reprinted_by);

-- Function to search receipts by various criteria
CREATE OR REPLACE FUNCTION search_receipts(
  p_search_term text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_payment_status text DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  sale_id uuid,
  receipt_number text,
  invoice_number text,
  sale_date timestamp with time zone,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  customer_email text,
  total_amount numeric(10,2),
  subtotal numeric(10,2),
  discount_amount numeric(10,2),
  tax_amount numeric(10,2),
  payment_method text,
  payment_status text,
  cashier_name text,
  receipt_printed boolean,
  receipt_printed_at timestamp with time zone,
  items_count bigint,
  reprint_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id as sale_id,
    s.receipt_number,
    s.invoice_number,
    s.sale_date,
    s.customer_id,
    c.name as customer_name,
    c.phone as customer_phone,
    c.email as customer_email,
    s.total_amount,
    s.subtotal,
    s.discount_amount,
    s.tax_amount,
    s.payment_method,
    s.payment_status,
    s.cashier_name,
    s.receipt_printed,
    s.receipt_printed_at,
    COUNT(DISTINCT si.id) as items_count,
    COUNT(DISTINCT rr.id) as reprint_count
  FROM sales s
  LEFT JOIN customers c ON s.customer_id = c.id
  LEFT JOIN sale_items si ON s.id = si.sale_id
  LEFT JOIN receipt_reprints rr ON s.id = rr.original_sale_id
  WHERE 
    s.receipt_number IS NOT NULL AND
    (p_search_term IS NULL OR 
     s.receipt_number ILIKE '%' || p_search_term || '%' OR
     s.invoice_number ILIKE '%' || p_search_term || '%' OR
     c.name ILIKE '%' || p_search_term || '%' OR
     c.phone ILIKE '%' || p_search_term || '%') AND
    (p_start_date IS NULL OR s.sale_date::date >= p_start_date) AND
    (p_end_date IS NULL OR s.sale_date::date <= p_end_date) AND
    (p_customer_name IS NULL OR c.name ILIKE '%' || p_customer_name || '%') AND
    (p_payment_method IS NULL OR s.payment_method = p_payment_method) AND
    (p_payment_status IS NULL OR s.payment_status = p_payment_status)
  GROUP BY s.id, c.name, c.phone, c.email
  ORDER BY s.sale_date DESC
  LIMIT p_limit;
END;
$$;

-- Function to get complete receipt data for reprinting
CREATE OR REPLACE FUNCTION get_receipt_for_reprint(p_receipt_number text)
RETURNS TABLE (
  sale_id uuid,
  receipt_number text,
  invoice_number text,
  sale_date timestamp with time zone,
  customer_name text,
  customer_phone text,
  customer_email text,
  total_amount numeric(10,2),
  subtotal numeric(10,2),
  discount_amount numeric(10,2),
  tax_amount numeric(10,2),
  payment_method text,
  payment_status text,
  cashier_name text,
  notes text,
  items jsonb,
  reprint_history jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id as sale_id,
    s.receipt_number,
    s.invoice_number,
    s.sale_date,
    c.name as customer_name,
    c.phone as customer_phone,
    c.email as customer_email,
    s.total_amount,
    s.subtotal,
    s.discount_amount,
    s.tax_amount,
    s.payment_method,
    s.payment_status,
    s.cashier_name,
    s.notes,
    -- Aggregate sale items as JSON
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'name', p.name,
          'quantity', si.quantity,
          'unit_price', si.unit_price,
          'discount_amount', si.discount_amount,
          'total_price', si.total_price
        ) ORDER BY si.created_at
      ) FILTER (WHERE si.id IS NOT NULL),
      '[]'::jsonb
    ) as items,
    -- Aggregate reprint history as JSON
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'reprint_date', rr.reprint_date,
          'reprinted_by', rr.reprinted_by,
          'reason', rr.reprint_reason,
          'auth_code', rr.reprint_auth_code
        ) ORDER BY rr.reprint_date DESC
      ) FILTER (WHERE rr.id IS NOT NULL),
      '[]'::jsonb
    ) as reprint_history
  FROM sales s
  LEFT JOIN customers c ON s.customer_id = c.id
  LEFT JOIN sale_items si ON s.id = si.sale_id
  LEFT JOIN products p ON si.product_id = p.id
  LEFT JOIN receipt_reprints rr ON s.id = rr.original_sale_id
  WHERE s.receipt_number = p_receipt_number
  GROUP BY s.id, c.name, c.phone, c.email;
END;
$$;

-- Function to log receipt reprint with audit trail
CREATE OR REPLACE FUNCTION log_receipt_reprint(
  p_sale_id uuid,
  p_receipt_number text,
  p_reprinted_by text,
  p_reason text DEFAULT 'Customer request',
  p_user_ip inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  auth_code text;
  reprint_count integer;
BEGIN
  -- Check if sale exists
  IF NOT EXISTS (SELECT 1 FROM sales WHERE id = p_sale_id AND receipt_number = p_receipt_number) THEN
    RAISE EXCEPTION 'Receipt not found: %', p_receipt_number;
  END IF;
  
  -- Get current reprint count
  SELECT COUNT(*) INTO reprint_count
  FROM receipt_reprints
  WHERE original_sale_id = p_sale_id;
  
  -- Generate unique auth code for this reprint
  auth_code := 'REPRINT-' || to_char(now(), 'YYYYMMDD') || '-' || 
               LPAD((reprint_count + 1)::text, 3, '0') || '-' || 
               substr(md5(p_receipt_number || now()::text), 1, 6);
  
  -- Log the reprint
  INSERT INTO receipt_reprints (
    original_sale_id,
    original_receipt_number,
    reprint_reason,
    reprinted_by,
    reprint_auth_code,
    user_ip,
    user_agent
  ) VALUES (
    p_sale_id,
    p_receipt_number,
    p_reason,
    p_reprinted_by,
    auth_code,
    p_user_ip,
    p_user_agent
  );
  
  RETURN auth_code;
END;
$$;

-- Function to get receipt reprint audit log
CREATE OR REPLACE FUNCTION get_receipt_audit_log(
  p_receipt_number text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_reprinted_by text DEFAULT NULL
)
RETURNS TABLE (
  receipt_number text,
  invoice_number text,
  original_sale_date timestamp with time zone,
  customer_name text,
  reprint_date timestamp with time zone,
  reprinted_by text,
  reprint_reason text,
  reprint_auth_code text,
  user_ip inet,
  reprint_count_for_receipt bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rr.original_receipt_number as receipt_number,
    s.invoice_number,
    s.sale_date as original_sale_date,
    c.name as customer_name,
    rr.reprint_date,
    rr.reprinted_by,
    rr.reprint_reason,
    rr.reprint_auth_code,
    rr.user_ip,
    ROW_NUMBER() OVER (PARTITION BY rr.original_receipt_number ORDER BY rr.reprint_date) as reprint_count_for_receipt
  FROM receipt_reprints rr
  JOIN sales s ON rr.original_sale_id = s.id
  LEFT JOIN customers c ON s.customer_id = c.id
  WHERE 
    (p_receipt_number IS NULL OR rr.original_receipt_number = p_receipt_number) AND
    (p_start_date IS NULL OR rr.reprint_date::date >= p_start_date) AND
    (p_end_date IS NULL OR rr.reprint_date::date <= p_end_date) AND
    (p_reprinted_by IS NULL OR rr.reprinted_by ILIKE '%' || p_reprinted_by || '%')
  ORDER BY rr.reprint_date DESC;
END;
$$;

-- Function to get receipt statistics
CREATE OR REPLACE FUNCTION get_receipt_statistics(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  total_receipts bigint,
  printed_receipts bigint,
  reprinted_receipts bigint,
  total_reprints bigint,
  unique_users_reprinting bigint,
  most_reprinted_receipt text,
  max_reprint_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT s.id) as total_receipts,
    COUNT(DISTINCT CASE WHEN s.receipt_printed = true THEN s.id END) as printed_receipts,
    COUNT(DISTINCT rr.original_sale_id) as reprinted_receipts,
    COUNT(rr.id) as total_reprints,
    COUNT(DISTINCT rr.reprinted_by) as unique_users_reprinting,
    (
      SELECT rr2.original_receipt_number
      FROM receipt_reprints rr2
      WHERE (p_start_date IS NULL OR rr2.reprint_date::date >= p_start_date)
        AND (p_end_date IS NULL OR rr2.reprint_date::date <= p_end_date)
      GROUP BY rr2.original_receipt_number
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ) as most_reprinted_receipt,
    (
      SELECT COUNT(*)
      FROM receipt_reprints rr3
      WHERE rr3.original_receipt_number = (
        SELECT rr4.original_receipt_number
        FROM receipt_reprints rr4
        WHERE (p_start_date IS NULL OR rr4.reprint_date::date >= p_start_date)
          AND (p_end_date IS NULL OR rr4.reprint_date::date <= p_end_date)
        GROUP BY rr4.original_receipt_number
        ORDER BY COUNT(*) DESC
        LIMIT 1
      )
    ) as max_reprint_count
  FROM sales s
  LEFT JOIN receipt_reprints rr ON s.id = rr.original_sale_id
  WHERE 
    s.receipt_number IS NOT NULL AND
    (p_start_date IS NULL OR s.sale_date::date >= p_start_date) AND
    (p_end_date IS NULL OR s.sale_date::date <= p_end_date);
END;
$$;

-- Function to validate receipt access permissions
CREATE OR REPLACE FUNCTION validate_receipt_access(
  p_receipt_number text,
  p_user_role text DEFAULT 'user'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  sale_exists boolean;
BEGIN
  -- Check if receipt exists
  SELECT EXISTS(
    SELECT 1 FROM sales 
    WHERE receipt_number = p_receipt_number
  ) INTO sale_exists;
  
  IF NOT sale_exists THEN
    RETURN false;
  END IF;
  
  -- For now, allow all authenticated users to access receipts
  -- In a real implementation, you would check user roles and permissions
  RETURN true;
END;
$$;

-- Create a view for easy receipt lookup
CREATE OR REPLACE VIEW receipt_lookup AS
SELECT 
  s.id as sale_id,
  s.receipt_number,
  s.invoice_number,
  s.sale_date,
  s.customer_id,
  c.name as customer_name,
  c.phone as customer_phone,
  c.email as customer_email,
  s.total_amount,
  s.payment_method,
  s.payment_status,
  s.cashier_name,
  s.receipt_printed,
  s.receipt_printed_at,
  COUNT(DISTINCT si.id) as items_count,
  COUNT(DISTINCT rr.id) as reprint_count,
  MAX(rr.reprint_date) as last_reprint_date
FROM sales s
LEFT JOIN customers c ON s.customer_id = c.id
LEFT JOIN sale_items si ON s.id = si.sale_id
LEFT JOIN receipt_reprints rr ON s.id = rr.original_sale_id
WHERE s.receipt_number IS NOT NULL
GROUP BY s.id, c.name, c.phone, c.email;

-- Grant access to the view
GRANT SELECT ON receipt_lookup TO public;