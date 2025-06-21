-- Final BNPL Payment Function (Clean Version)
-- This function handles BNPL payment processing with proper UUID generation

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS process_bnpl_payment(TEXT, NUMERIC);

-- Create the process_bnpl_payment function
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
  v_bnpl_id UUID;
  v_sale_id UUID;
  v_customer_id UUID;
  v_original_amount NUMERIC;
  v_amount_paid NUMERIC;
  v_amount_due NUMERIC;
  v_status TEXT;
  v_invoice_number TEXT;
  v_original_receipt TEXT;
  v_customer_name TEXT;
  v_customer_phone TEXT;
  v_new_payment_amount NUMERIC;
  v_new_amount_due NUMERIC;
  v_payment_id UUID;
  v_receipt_number TEXT;
  v_current_time TIMESTAMPTZ;
BEGIN
  -- Get current time
  v_current_time := NOW();
  
  -- Get BNPL transaction details
  SELECT 
    bt.id,
    bt.sale_id,
    bt.customer_id,
    bt.original_amount,
    bt.amount_paid,
    bt.amount_due,
    bt.status,
    s.invoice_number,
    s.receipt_number,
    c.name,
    c.phone
  INTO 
    v_bnpl_id,
    v_sale_id,
    v_customer_id,
    v_original_amount,
    v_amount_paid,
    v_amount_due,
    v_status,
    v_invoice_number,
    v_original_receipt,
    v_customer_name,
    v_customer_phone
  FROM bnpl_transactions bt
  JOIN sales s ON bt.sale_id = s.id
  JOIN customers c ON bt.customer_id = c.id
  WHERE bt.id = p_bnpl_id::UUID;
  
  -- Check if BNPL transaction exists
  IF v_bnpl_id IS NULL THEN
    RETURN QUERY SELECT 
      FALSE as success,
      'BNPL transaction not found' as message,
      0 as remaining_amount,
      NULL as payment_id,
      NULL as receipt_number;
    RETURN;
  END IF;
  
  -- Check if BNPL is still active
  IF v_status = 'paid' THEN
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
      v_amount_due as remaining_amount,
      NULL as payment_id,
      NULL as receipt_number;
    RETURN;
  END IF;
  
  -- Check if payment amount exceeds remaining due
  IF p_payment_amount > v_amount_due THEN
    RETURN QUERY SELECT 
      FALSE as success,
      'Payment amount exceeds remaining due amount' as message,
      v_amount_due as remaining_amount,
      NULL as payment_id,
      NULL as receipt_number;
    RETURN;
  END IF;
  
  -- Calculate new amounts
  v_new_payment_amount := v_amount_paid + p_payment_amount;
  v_new_amount_due := v_amount_due - p_payment_amount;
  
  -- Generate payment ID and receipt number
  v_payment_id := gen_random_uuid();
  v_receipt_number := 'RCPT-BNPL-' || EXTRACT(EPOCH FROM v_current_time)::TEXT || '-' || FLOOR(RANDOM() * 1000)::TEXT;
  
  -- Update BNPL transaction
  UPDATE bnpl_transactions 
  SET 
    amount_paid = v_new_payment_amount,
    amount_due = v_new_amount_due,
    status = CASE 
      WHEN v_new_amount_due = 0 THEN 'paid'
      WHEN v_new_amount_due > 0 THEN 'partially_paid'
      ELSE v_status
    END,
    updated_at = v_current_time
  WHERE id = v_bnpl_id;
  
  -- Update customer outstanding dues and available credit
  UPDATE customers 
  SET 
    total_outstanding_dues = GREATEST(0, total_outstanding_dues - p_payment_amount),
    available_credit = available_credit + p_payment_amount,
    updated_at = v_current_time
  WHERE id = v_customer_id;
  
  -- Create a new sale record for this payment
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
    v_payment_id,
    v_customer_id,
    p_payment_amount,
    'bnpl_payment',
    'INV-BNPL-' || EXTRACT(EPOCH FROM v_current_time)::TEXT,
    v_receipt_number,
    'BNPL payment for original invoice: ' || v_invoice_number || ' | Original Receipt: ' || v_original_receipt,
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
    v_payment_id,
    v_sale_id,
    v_customer_id,
    p_payment_amount,
    'bnpl_payment',
    v_current_time,
    'completed',
    'BNPL payment for invoice: ' || v_invoice_number || ' | Receipt: ' || v_receipt_number,
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
    'BNPL payment received from ' || v_customer_name || ' for invoice: ' || v_invoice_number || ' | Receipt: ' || v_receipt_number,
    'bnpl_transaction',
    p_bnpl_id,
    v_current_time,
    v_current_time
  );
  
  -- Create sales items record for the payment
  INSERT INTO sales_items (
    sale_id,
    product_id,
    quantity,
    unit_price,
    total_price,
    created_at
  ) VALUES (
    v_payment_id,
    '00000000-0000-0000-0000-000000000000', -- Dummy product ID for BNPL payment
    1,
    p_payment_amount,
    p_payment_amount,
    v_current_time
  );
  
  -- Return success response
  RETURN QUERY SELECT 
    TRUE as success,
    'Payment processed successfully. Receipt: ' || v_receipt_number as message,
    v_new_amount_due as remaining_amount,
    v_payment_id::TEXT as payment_id,
    v_receipt_number as receipt_number;
    
EXCEPTION
  WHEN OTHERS THEN
    -- Return error
    RETURN QUERY SELECT 
      FALSE as success,
      'Error processing payment: ' || SQLERRM as message,
      COALESCE(v_amount_due, 0) as remaining_amount,
      NULL as payment_id,
      NULL as receipt_number;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION process_bnpl_payment(TEXT, NUMERIC) TO authenticated;

-- Add comments
COMMENT ON FUNCTION process_bnpl_payment(TEXT, NUMERIC) IS 'Process BNPL payment with proper record keeping and receipt generation'; 