/*
  # BNPL Payment History Tracking

  1. New Tables
    - `bnpl_payment_history` - Track all BNPL payments with details

  2. New Functions
    - `get_bnpl_payment_history` - Get payment history for a specific BNPL transaction
    - Enhanced `process_bnpl_payment` - Record payment history when processing payments

  3. Security
    - Enable RLS on new tables
    - Add policies for public access
*/

-- Create BNPL payment history table
CREATE TABLE IF NOT EXISTS bnpl_payment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bnpl_transaction_id uuid REFERENCES bnpl_transactions(id) ON DELETE CASCADE,
  payment_amount numeric(10,2) NOT NULL CHECK (payment_amount > 0),
  payment_method text NOT NULL,
  confirmation_number text,
  processed_by text,
  payment_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on the new table
ALTER TABLE bnpl_payment_history ENABLE ROW LEVEL SECURITY;

-- Create policy for public access
CREATE POLICY "Public access" ON bnpl_payment_history FOR ALL TO public USING (true);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_bnpl_payment_history_transaction_id ON bnpl_payment_history(bnpl_transaction_id);
CREATE INDEX IF NOT EXISTS idx_bnpl_payment_history_date ON bnpl_payment_history(payment_date);

-- Modify the process_bnpl_payment function to record payment history
CREATE OR REPLACE FUNCTION process_bnpl_payment(
  p_bnpl_id uuid,
  p_payment_amount numeric(10,2),
  p_payment_method text DEFAULT 'cash',
  p_processed_by text DEFAULT 'System'
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
  confirmation_number text;
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
  
  -- Generate confirmation number
  SELECT 'BNPL-PAY-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
         LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0') INTO confirmation_number;
  
  -- Update BNPL transaction
  UPDATE bnpl_transactions
  SET 
    amount_paid = new_amount_paid,
    amount_due = new_amount_due,
    status = new_status,
    updated_at = now()
  WHERE id = p_bnpl_id;
  
  -- Record payment in history
  INSERT INTO bnpl_payment_history (
    bnpl_transaction_id,
    payment_amount,
    payment_method,
    confirmation_number,
    processed_by
  ) VALUES (
    p_bnpl_id,
    p_payment_amount,
    p_payment_method,
    confirmation_number,
    p_processed_by
  );
  
  -- Create payment transaction record
  INSERT INTO payment_transactions (
    transaction_type,
    reference_id,
    customer_id,
    amount,
    payment_method,
    status,
    notes
  ) VALUES (
    'bnpl_payment',
    p_bnpl_id,
    bnpl_record.customer_id,
    p_payment_amount,
    p_payment_method,
    'completed',
    'BNPL payment for transaction #' || p_bnpl_id
  );
  
  -- Update customer credit (reduce debt)
  PERFORM update_customer_credit(bnpl_record.customer_id, p_payment_amount, 'reduce_debt');
  
  -- Award loyalty points if fully paid
  IF new_status = 'paid' THEN
    PERFORM award_loyalty_points(bnpl_record.customer_id, bnpl_record.original_amount);
  END IF;
  
  -- Record cash transaction if payment method is cash
  IF p_payment_method = 'cash' THEN
    INSERT INTO cash_ledger (
      transaction_type,
      amount,
      description,
      reference_id
    ) VALUES (
      'in',
      p_payment_amount,
      'BNPL payment received for transaction #' || p_bnpl_id,
      p_bnpl_id
    );
  END IF;
END;
$$;

-- Function to get BNPL payment history
CREATE OR REPLACE FUNCTION get_bnpl_payment_history(p_bnpl_id uuid)
RETURNS TABLE (
  transaction_json jsonb,
  payments_json jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    -- Transaction details
    jsonb_build_object(
      'id', bt.id,
      'sale_id', bt.sale_id,
      'customer_id', bt.customer_id,
      'original_amount', bt.original_amount,
      'amount_paid', bt.amount_paid,
      'amount_due', bt.amount_due,
      'due_date', bt.due_date,
      'status', bt.status,
      'created_at', bt.created_at,
      'updated_at', bt.updated_at,
      'sale', jsonb_build_object(
        'invoice_number', s.invoice_number,
        'receipt_number', s.receipt_number,
        'sale_date', s.sale_date,
        'total_amount', s.total_amount
      )
    ) AS transaction_json,
    
    -- Payment history
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', ph.id,
          'payment_amount', ph.payment_amount,
          'payment_method', ph.payment_method,
          'confirmation_number', ph.confirmation_number,
          'processed_by', ph.processed_by,
          'payment_date', ph.payment_date
        ) ORDER BY ph.payment_date DESC
      ) FILTER (WHERE ph.id IS NOT NULL),
      '[]'::jsonb
    ) AS payments_json
  FROM bnpl_transactions bt
  LEFT JOIN sales s ON bt.sale_id = s.id
  LEFT JOIN bnpl_payment_history ph ON bt.id = ph.bnpl_transaction_id
  WHERE bt.id = p_bnpl_id
  GROUP BY bt.id, s.invoice_number, s.receipt_number, s.sale_date, s.total_amount;
END;
$$;

-- Add helpful comments
COMMENT ON TABLE bnpl_payment_history IS 'Records all payments made against BNPL transactions';
COMMENT ON FUNCTION process_bnpl_payment(uuid, numeric, text, text) IS 'Process a payment for a BNPL transaction and record payment history';
COMMENT ON FUNCTION get_bnpl_payment_history(uuid) IS 'Get detailed payment history for a specific BNPL transaction';