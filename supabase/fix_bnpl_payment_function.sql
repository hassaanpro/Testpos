-- Comprehensive BNPL Payment Function Fix
-- This ensures proper record keeping, balance updates, and receipt generation

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS process_bnpl_payment(TEXT, NUMERIC);

-- Create the improved process_bnpl_payment function
CREATE OR REPLACE FUNCTION process_bnpl_payment(
  p_bnpl_id TEXT,
  p_payment_amount NUMERIC
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  remaining_amount NUMERIC,
  payment_id TEXT,
  receipt_number TEXT
) 
LANGUAGE plpgsql
AS $$
DECLARE
  bnpl_record RECORD;
  customer_record RECORD;
  sale_record RECORD;
  new_payment_amount NUMERIC;
  new_amount_due NUMERIC;
  v_payment_id TEXT;
  v_receipt_number TEXT;
  v_current_time TIMESTAMPTZ;
BEGIN
  -- Get current time
  v_current_time := NOW();
  
  -- Get BNPL transaction details with sale information
  SELECT 
    bt.id,
    bt.sale_id,
    bt.customer_id,
    bt.original_amount,
    bt.amount_paid,
    bt.amount_due,
    bt.status,
    bt.due_date,
    s.total_amount as sale_total,
    s.invoice_number,
    s.receipt_number as original_receipt,
    s.payment_method as original_payment_method,
    s.created_at as sale_date
  INTO bnpl_record
  FROM bnpl_transactions bt
  JOIN sales s ON bt.sale_id = s.id
  WHERE bt.id = p_bnpl_id::UUID;
  
  -- Check if BNPL transaction exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      FALSE as success,
      'BNPL transaction not found' as message,
      0 as remaining_amount,
      NULL as payment_id,
      NULL as receipt_number;
    RETURN;
  END IF;
  
  -- Check if BNPL is still active
  IF bnpl_record.status = 'paid' THEN
    RETURN QUERY SELECT 
      FALSE as success,
      'BNPL transaction is already fully paid' as message,
      0 as remaining_amount,
      NULL as payment_id,
      NULL as receipt_number;
    RETURN;
  END IF;
  
  -- Check if payment amount is valid
  IF p_payment_amount <= 0 THEN
    RETURN QUERY SELECT 
      FALSE as success,
      'Payment amount must be greater than 0' as message,
      bnpl_record.amount_due as remaining_amount,
      NULL as payment_id,
      NULL as receipt_number;
    RETURN;
  END IF;
  
  -- Check if payment amount exceeds remaining due
  IF p_payment_amount > bnpl_record.amount_due THEN
    RETURN QUERY SELECT 
      FALSE as success,
      'Payment amount exceeds remaining due amount' as message,
      bnpl_record.amount_due as remaining_amount,
      NULL as payment_id,
      NULL as receipt_number;
    RETURN;
  END IF;
  
  -- Calculate new amounts
  new_payment_amount := bnpl_record.amount_paid + p_payment_amount;
  new_amount_due := bnpl_record.amount_due - p_payment_amount;
  
  -- Generate payment ID and receipt number
  v_payment_id := gen_random_uuid()::TEXT;
  v_receipt_number := 'RCPT-BNPL-' || EXTRACT(EPOCH FROM v_current_time)::TEXT || '-' || FLOOR(RANDOM() * 1000)::TEXT;
  
  -- Get customer details
  SELECT 
    c.id,
    c.name,
    c.total_outstanding_dues,
    c.available_credit,
    c.phone,
    c.email
  INTO customer_record
  FROM customers c
  WHERE c.id = bnpl_record.customer_id;
  
  -- Update BNPL transaction with new amounts and status
  UPDATE bnpl_transactions 
  SET 
    amount_paid = new_payment_amount,
    amount_due = new_amount_due,
    status = CASE 
      WHEN new_amount_due = 0 THEN 'paid'
      WHEN new_amount_due > 0 THEN 'partially_paid'
      ELSE status
    END,
    updated_at = v_current_time
  WHERE id = p_bnpl_id::UUID;
  
  -- Update customer outstanding dues and available credit
  UPDATE customers 
  SET 
    total_outstanding_dues = GREATEST(0, total_outstanding_dues - p_payment_amount),
    available_credit = available_credit + p_payment_amount,
    updated_at = v_current_time
  WHERE id = bnpl_record.customer_id;
  
  -- Create a new sale record for this payment (for receipt generation)
  INSERT INTO sales (
    id,
    customer_id,
    total_amount,
    payment_method,
    invoice_number,
    receipt_number,
    notes,
    created_at
  ) VALUES (
    v_payment_id::UUID,
    bnpl_record.customer_id,
    p_payment_amount,
    'bnpl_payment',
    'INV-BNPL-' || EXTRACT(EPOCH FROM v_current_time)::TEXT,
    v_receipt_number,
    'BNPL payment for original invoice: ' || bnpl_record.invoice_number || ' | Original Receipt: ' || bnpl_record.original_receipt,
    v_current_time
  );
  
  -- Create payment record in refund_transactions table
  INSERT INTO refund_transactions (
    id,
    sale_id,
    customer_id,
    amount,
    payment_method,
    transaction_date,
    status,
    notes,
    created_at
  ) VALUES (
    v_payment_id::UUID,
    bnpl_record.sale_id,
    bnpl_record.customer_id,
    p_payment_amount,
    'bnpl_payment',
    v_current_time,
    'completed',
    'BNPL payment for invoice: ' || bnpl_record.invoice_number || ' | Receipt: ' || v_receipt_number,
    v_current_time
  );
  
  -- Record cash ledger entry for BNPL payment
  INSERT INTO cash_ledger (
    transaction_type,
    amount,
    description,
    reference_type,
    reference_id,
    transaction_date,
    created_at
  ) VALUES (
    'bnpl_payment',
    p_payment_amount,
    'BNPL payment received from ' || customer_record.name || ' for invoice: ' || bnpl_record.invoice_number || ' | Receipt: ' || v_receipt_number,
    'bnpl_transaction',
    p_bnpl_id,
    v_current_time,
    v_current_time
  );
  
  -- Create sales items record for the payment (for receipt details)
  INSERT INTO sales_items (
    sale_id,
    product_id,
    quantity,
    unit_price,
    total_price,
    created_at
  ) VALUES (
    v_payment_id::UUID,
    '00000000-0000-0000-0000-000000000000', -- Dummy product ID for BNPL payment
    1,
    p_payment_amount,
    p_payment_amount,
    v_current_time
  );
  
  -- Return success response with receipt number
  RETURN QUERY SELECT 
    TRUE as success,
    'Payment processed successfully. Receipt: ' || v_receipt_number as message,
    new_amount_due as remaining_amount,
    v_payment_id as payment_id,
    v_receipt_number as receipt_number;
    
EXCEPTION
  WHEN OTHERS THEN
    -- Rollback any changes and return error
    RETURN QUERY SELECT 
      FALSE as success,
      'Error processing payment: ' || SQLERRM as message,
      COALESCE(bnpl_record.amount_due, 0) as remaining_amount,
      NULL as payment_id,
      NULL as receipt_number;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION process_bnpl_payment(TEXT, NUMERIC) TO authenticated;

-- Add comments
COMMENT ON FUNCTION process_bnpl_payment(TEXT, NUMERIC) IS 'Process BNPL payment with proper record keeping and receipt generation';

-- Create a function to get BNPL payment receipt details
CREATE OR REPLACE FUNCTION get_bnpl_payment_receipt(p_payment_id TEXT)
RETURNS TABLE (
  receipt_number TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  payment_amount NUMERIC,
  original_invoice TEXT,
  original_receipt TEXT,
  payment_date TIMESTAMPTZ,
  remaining_amount NUMERIC,
  payment_method TEXT
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.receipt_number::TEXT,
    c.name::TEXT as customer_name,
    c.phone::TEXT as customer_phone,
    s.total_amount as payment_amount,
    rt.notes::TEXT as original_invoice,
    s.notes::TEXT as original_receipt,
    s.created_at as payment_date,
    bt.amount_due as remaining_amount,
    s.payment_method::TEXT
  FROM sales s
  JOIN customers c ON s.customer_id = c.id
  JOIN refund_transactions rt ON s.id = rt.id
  JOIN bnpl_transactions bt ON rt.sale_id = bt.sale_id
  WHERE s.id = p_payment_id::UUID
  AND s.payment_method = 'bnpl_payment';
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_bnpl_payment_receipt(TEXT) TO authenticated;

-- Create a function to get customer BNPL summary
CREATE OR REPLACE FUNCTION get_customer_bnpl_summary(p_customer_id TEXT)
RETURNS TABLE (
  customer_name TEXT,
  total_outstanding_dues NUMERIC,
  available_credit NUMERIC,
  active_bnpl_count BIGINT,
  total_bnpl_due NUMERIC,
  recent_payments NUMERIC
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.name::TEXT as customer_name,
    c.total_outstanding_dues,
    c.available_credit,
    COUNT(bt.id) as active_bnpl_count,
    COALESCE(SUM(bt.amount_due), 0) as total_bnpl_due,
    COALESCE(SUM(CASE WHEN rt.transaction_date >= NOW() - INTERVAL '30 days' THEN rt.amount ELSE 0 END), 0) as recent_payments
  FROM customers c
  LEFT JOIN bnpl_transactions bt ON c.id = bt.customer_id AND bt.status IN ('pending', 'partially_paid')
  LEFT JOIN refund_transactions rt ON c.id = rt.customer_id AND rt.payment_method = 'bnpl_payment'
  WHERE c.id = p_customer_id::UUID
  GROUP BY c.id, c.name, c.total_outstanding_dues, c.available_credit;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_customer_bnpl_summary(TEXT) TO authenticated;

-- Create function to get BNPL transaction details
CREATE OR REPLACE FUNCTION get_bnpl_transaction_details(p_bnpl_id TEXT)
RETURNS TABLE (
  id UUID,
  sale_id UUID,
  customer_id UUID,
  original_amount NUMERIC,
  amount_paid NUMERIC,
  amount_due NUMERIC,
  status TEXT,
  due_date TIMESTAMPTZ,
  invoice_number TEXT,
  receipt_number TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  sale_date TIMESTAMPTZ
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bt.id,
    bt.sale_id,
    bt.customer_id,
    bt.original_amount,
    bt.amount_paid,
    bt.amount_due,
    bt.status,
    bt.due_date,
    s.invoice_number,
    s.receipt_number,
    c.name as customer_name,
    c.phone as customer_phone,
    s.sale_date
  FROM bnpl_transactions bt
  JOIN sales s ON bt.sale_id = s.id
  JOIN customers c ON bt.customer_id = c.id
  WHERE bt.id = p_bnpl_id::UUID;
END;
$$;

-- Create function to get all BNPL transactions for a customer
CREATE OR REPLACE FUNCTION get_customer_bnpl_transactions(p_customer_id TEXT)
RETURNS TABLE (
  id UUID,
  sale_id UUID,
  original_amount NUMERIC,
  amount_paid NUMERIC,
  amount_due NUMERIC,
  status TEXT,
  due_date TIMESTAMPTZ,
  invoice_number TEXT,
  receipt_number TEXT,
  sale_date TIMESTAMPTZ,
  days_overdue INTEGER
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bt.id,
    bt.sale_id,
    bt.original_amount,
    bt.amount_paid,
    bt.amount_due,
    bt.status,
    bt.due_date,
    s.invoice_number,
    s.receipt_number,
    s.sale_date,
    CASE 
      WHEN bt.due_date < (NOW() AT TIME ZONE 'Asia/Karachi')::DATE AND bt.status != 'paid' 
      THEN EXTRACT(DAY FROM ((NOW() AT TIME ZONE 'Asia/Karachi')::DATE - bt.due_date))
      ELSE 0
    END as days_overdue
  FROM bnpl_transactions bt
  JOIN sales s ON bt.sale_id = s.id
  WHERE bt.customer_id = p_customer_id::UUID
  ORDER BY bt.due_date ASC, bt.created_at DESC;
END;
$$;

-- Create function to get overdue BNPL transactions
CREATE OR REPLACE FUNCTION get_overdue_bnpl_transactions()
RETURNS TABLE (
  id UUID,
  customer_id UUID,
  customer_name TEXT,
  customer_phone TEXT,
  original_amount NUMERIC,
  amount_paid NUMERIC,
  amount_due NUMERIC,
  due_date TIMESTAMPTZ,
  days_overdue INTEGER,
  invoice_number TEXT,
  receipt_number TEXT
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bt.id,
    bt.customer_id,
    c.name as customer_name,
    c.phone as customer_phone,
    bt.original_amount,
    bt.amount_paid,
    bt.amount_due,
    bt.due_date,
    EXTRACT(DAY FROM ((NOW() AT TIME ZONE 'Asia/Karachi')::DATE - bt.due_date)) as days_overdue,
    s.invoice_number,
    s.receipt_number
  FROM bnpl_transactions bt
  JOIN sales s ON bt.sale_id = s.id
  JOIN customers c ON bt.customer_id = c.id
  WHERE bt.due_date < (NOW() AT TIME ZONE 'Asia/Karachi')::DATE 
    AND bt.status != 'paid'
    AND bt.amount_due > 0
  ORDER BY bt.due_date ASC;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_bnpl_transaction_details(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_customer_bnpl_transactions(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_overdue_bnpl_transactions() TO authenticated;

-- Add comments
COMMENT ON FUNCTION get_bnpl_transaction_details(TEXT) IS 'Get detailed information about a BNPL transaction';
COMMENT ON FUNCTION get_customer_bnpl_transactions(TEXT) IS 'Get all BNPL transactions for a specific customer';
COMMENT ON FUNCTION get_overdue_bnpl_transactions() IS 'Get all overdue BNPL transactions'; 