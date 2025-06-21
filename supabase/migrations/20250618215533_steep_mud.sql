/*
  # Returns and Refunds System Implementation

  1. New Tables
    - `returns` - Main return records with customer and refund information
    - `return_items` - Individual items being returned with conditions and quantities
    - `refund_transactions` - Financial refund transaction logs

  2. Table Modifications
    - `sales` - Add return_status column to track return state
    - `sale_items` - Add returned_quantity and is_returned columns

  3. RPC Function
    - `process_return_and_refund` - Core transactional logic for processing returns

  4. Security
    - Enable RLS on all new tables
    - Add appropriate policies for data access
*/

-- Create returns table
CREATE TABLE IF NOT EXISTS returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES sales(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  return_date timestamptz DEFAULT now(),
  return_reason text NOT NULL,
  return_status text DEFAULT 'pending' CHECK (return_status IN ('pending', 'approved', 'rejected', 'completed')),
  refund_amount numeric(10,2) NOT NULL CHECK (refund_amount >= 0),
  refund_method text NOT NULL,
  processed_by text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create return_items table
CREATE TABLE IF NOT EXISTS return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid REFERENCES returns(id) ON DELETE CASCADE NOT NULL,
  sale_item_id uuid REFERENCES sale_items(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  refund_price numeric(10,2) NOT NULL CHECK (refund_price >= 0),
  condition text NOT NULL CHECK (condition IN ('good', 'damaged', 'defective')),
  created_at timestamptz DEFAULT now()
);

-- Create refund_transactions table
CREATE TABLE IF NOT EXISTS refund_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid REFERENCES returns(id) ON DELETE SET NULL,
  sale_id uuid REFERENCES sales(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  payment_method text NOT NULL,
  transaction_date timestamptz DEFAULT now(),
  status text DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Alter sales table to add return status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'return_status'
  ) THEN
    ALTER TABLE sales ADD COLUMN return_status text DEFAULT 'none' CHECK (return_status IN ('none', 'partial_return', 'full_return'));
  END IF;
END $$;

-- Alter sale_items table to add return tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'returned_quantity'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN returned_quantity integer DEFAULT 0 CHECK (returned_quantity >= 0);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sale_items' AND column_name = 'is_returned'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN is_returned boolean DEFAULT false;
  END IF;
END $$;

-- Enable RLS on new tables
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_transactions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for returns
CREATE POLICY "Public access to returns"
  ON returns
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- Create RLS policies for return_items
CREATE POLICY "Public access to return_items"
  ON return_items
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- Create RLS policies for refund_transactions
CREATE POLICY "Public access to refund_transactions"
  ON refund_transactions
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_returns_sale_id ON returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_returns_customer_id ON returns(customer_id);
CREATE INDEX IF NOT EXISTS idx_returns_return_date ON returns(return_date);
CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(return_status);

CREATE INDEX IF NOT EXISTS idx_return_items_return_id ON return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_sale_item_id ON return_items(sale_item_id);
CREATE INDEX IF NOT EXISTS idx_return_items_product_id ON return_items(product_id);

CREATE INDEX IF NOT EXISTS idx_refund_transactions_return_id ON refund_transactions(return_id);
CREATE INDEX IF NOT EXISTS idx_refund_transactions_sale_id ON refund_transactions(sale_id);
CREATE INDEX IF NOT EXISTS idx_refund_transactions_customer_id ON refund_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_refund_transactions_date ON refund_transactions(transaction_date);

-- Create the main RPC function for processing returns and refunds
CREATE OR REPLACE FUNCTION process_return_and_refund(
  p_sale_id uuid,
  p_return_items jsonb,
  p_return_reason text,
  p_refund_method text,
  p_processed_by text,
  p_notes text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_return_id uuid;
  v_sale_record record;
  v_customer_id uuid;
  v_total_refund_amount numeric(10,2) := 0;
  v_return_item jsonb;
  v_sale_item_record record;
  v_product_record record;
  v_refund_amount numeric(10,2);
  v_return_window_days integer := 30; -- 30 day return window
  v_total_sale_items integer;
  v_returned_sale_items integer;
  v_new_return_status text;
BEGIN
  -- Start transaction (implicit in function)
  
  -- Validate sale exists and get details
  SELECT * INTO v_sale_record
  FROM sales
  WHERE id = p_sale_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale with ID % not found', p_sale_id;
  END IF;
  
  -- Check return window (30 days from sale date)
  IF v_sale_record.sale_date < (CURRENT_TIMESTAMP - INTERVAL '30 days') THEN
    RAISE EXCEPTION 'Return window has expired. Returns must be processed within % days of purchase', v_return_window_days;
  END IF;
  
  v_customer_id := v_sale_record.customer_id;
  
  -- Create main return record
  INSERT INTO returns (
    sale_id,
    customer_id,
    return_reason,
    return_status,
    refund_amount, -- Will be updated after processing items
    refund_method,
    processed_by,
    notes
  ) VALUES (
    p_sale_id,
    v_customer_id,
    p_return_reason,
    'approved', -- Auto-approve for now
    0, -- Placeholder, will be updated
    p_refund_method,
    p_processed_by,
    p_notes
  ) RETURNING id INTO v_return_id;
  
  -- Process each return item
  FOR v_return_item IN SELECT * FROM jsonb_array_elements(p_return_items)
  LOOP
    -- Get sale item details
    SELECT si.*, p.stock_quantity, p.name as product_name
    INTO v_sale_item_record
    FROM sale_items si
    JOIN products p ON si.product_id = p.id
    WHERE si.id = (v_return_item->>'sale_item_id')::uuid
    AND si.sale_id = p_sale_id;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sale item with ID % not found in sale %', 
        (v_return_item->>'sale_item_id')::uuid, p_sale_id;
    END IF;
    
    -- Validate return quantity
    DECLARE
      v_requested_quantity integer := (v_return_item->>'quantity')::integer;
      v_available_to_return integer := v_sale_item_record.quantity - COALESCE(v_sale_item_record.returned_quantity, 0);
    BEGIN
      IF v_requested_quantity <= 0 THEN
        RAISE EXCEPTION 'Return quantity must be greater than 0';
      END IF;
      
      IF v_requested_quantity > v_available_to_return THEN
        RAISE EXCEPTION 'Cannot return % units of %. Only % units available for return (original: %, already returned: %)',
          v_requested_quantity,
          v_sale_item_record.product_name,
          v_available_to_return,
          v_sale_item_record.quantity,
          COALESCE(v_sale_item_record.returned_quantity, 0);
      END IF;
    END;
    
    -- Calculate refund amount for this item
    v_refund_amount := v_sale_item_record.unit_price * (v_return_item->>'quantity')::integer;
    v_total_refund_amount := v_total_refund_amount + v_refund_amount;
    
    -- Create return item record
    INSERT INTO return_items (
      return_id,
      sale_item_id,
      product_id,
      quantity,
      unit_price,
      refund_price,
      condition
    ) VALUES (
      v_return_id,
      (v_return_item->>'sale_item_id')::uuid,
      v_sale_item_record.product_id,
      (v_return_item->>'quantity')::integer,
      v_sale_item_record.unit_price,
      v_sale_item_record.unit_price, -- Full refund for now
      COALESCE(v_return_item->>'condition', 'good')
    );
    
    -- Update sale_items table
    UPDATE sale_items
    SET 
      returned_quantity = COALESCE(returned_quantity, 0) + (v_return_item->>'quantity')::integer,
      is_returned = (COALESCE(returned_quantity, 0) + (v_return_item->>'quantity')::integer) >= quantity
    WHERE id = (v_return_item->>'sale_item_id')::uuid;
    
    -- Update product inventory (return to stock)
    UPDATE products
    SET stock_quantity = stock_quantity + (v_return_item->>'quantity')::integer
    WHERE id = v_sale_item_record.product_id;
    
    -- Log stock movement
    INSERT INTO stock_movements (
      product_id,
      movement_type,
      quantity,
      reference_type,
      reference_id,
      notes
    ) VALUES (
      v_sale_item_record.product_id,
      'in',
      (v_return_item->>'quantity')::integer,
      'return',
      v_return_id,
      'Product returned - ' || COALESCE(v_return_item->>'condition', 'good') || ' condition'
    );
  END LOOP;
  
  -- Update return record with total refund amount
  UPDATE returns
  SET 
    refund_amount = v_total_refund_amount,
    return_status = 'completed',
    updated_at = now()
  WHERE id = v_return_id;
  
  -- Determine new return status for the sale
  SELECT 
    COUNT(*) as total_items,
    COUNT(*) FILTER (WHERE is_returned = true) as returned_items
  INTO v_total_sale_items, v_returned_sale_items
  FROM sale_items
  WHERE sale_id = p_sale_id;
  
  IF v_returned_sale_items = 0 THEN
    v_new_return_status := 'none';
  ELSIF v_returned_sale_items = v_total_sale_items THEN
    v_new_return_status := 'full_return';
  ELSE
    v_new_return_status := 'partial_return';
  END IF;
  
  -- Update sales return status
  UPDATE sales
  SET return_status = v_new_return_status
  WHERE id = p_sale_id;
  
  -- Create refund transaction record
  INSERT INTO refund_transactions (
    return_id,
    sale_id,
    customer_id,
    amount,
    payment_method,
    status,
    notes
  ) VALUES (
    v_return_id,
    p_sale_id,
    v_customer_id,
    v_total_refund_amount,
    p_refund_method,
    'completed',
    'Refund processed for return #' || v_return_id
  );
  
  -- Handle customer balance adjustments for BNPL
  IF v_customer_id IS NOT NULL AND v_sale_record.payment_method = 'bnpl' THEN
    -- Check if there's an outstanding BNPL transaction for this sale
    DECLARE
      v_bnpl_record record;
    BEGIN
      SELECT * INTO v_bnpl_record
      FROM bnpl_transactions
      WHERE sale_id = p_sale_id
      AND status IN ('pending', 'partially_paid', 'overdue');
      
      IF FOUND THEN
        -- Reduce the BNPL amount due
        UPDATE bnpl_transactions
        SET 
          amount_due = GREATEST(0, amount_due - v_total_refund_amount),
          status = CASE 
            WHEN (amount_due - v_total_refund_amount) <= 0 THEN 'paid'
            ELSE status
          END
        WHERE id = v_bnpl_record.id;
        
        -- Update customer balances
        UPDATE customers
        SET 
          total_outstanding_dues = GREATEST(0, total_outstanding_dues - v_total_refund_amount),
          available_credit = LEAST(credit_limit, available_credit + v_total_refund_amount)
        WHERE id = v_customer_id;
      END IF;
    END;
  END IF;
  
  -- Handle cash refund logging
  IF p_refund_method = 'cash' THEN
    INSERT INTO cash_ledger (
      transaction_type,
      amount,
      description,
      reference_id
    ) VALUES (
      'out',
      v_total_refund_amount,
      'Cash refund for return #' || v_return_id,
      v_return_id
    );
  END IF;
  
  -- Return the return ID
  RETURN v_return_id;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Re-raise the exception to rollback the transaction
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create helper function to get return details
CREATE OR REPLACE FUNCTION get_return_details(p_return_id uuid)
RETURNS TABLE (
  return_id uuid,
  sale_id uuid,
  customer_name text,
  return_date timestamptz,
  return_reason text,
  return_status text,
  refund_amount numeric(10,2),
  refund_method text,
  processed_by text,
  notes text,
  items jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.sale_id,
    c.name,
    r.return_date,
    r.return_reason,
    r.return_status,
    r.refund_amount,
    r.refund_method,
    r.processed_by,
    r.notes,
    jsonb_agg(
      jsonb_build_object(
        'product_name', p.name,
        'product_sku', p.sku,
        'quantity', ri.quantity,
        'unit_price', ri.unit_price,
        'refund_price', ri.refund_price,
        'condition', ri.condition
      )
    ) as items
  FROM returns r
  LEFT JOIN customers c ON r.customer_id = c.id
  LEFT JOIN return_items ri ON r.id = ri.return_id
  LEFT JOIN products p ON ri.product_id = p.id
  WHERE r.id = p_return_id
  GROUP BY r.id, r.sale_id, c.name, r.return_date, r.return_reason, 
           r.return_status, r.refund_amount, r.refund_method, r.processed_by, r.notes;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get returnable items for a sale
CREATE OR REPLACE FUNCTION get_returnable_items(p_sale_id uuid)
RETURNS TABLE (
  sale_item_id uuid,
  product_id uuid,
  product_name text,
  product_sku text,
  quantity_sold integer,
  quantity_returned integer,
  quantity_returnable integer,
  unit_price numeric(10,2),
  total_price numeric(10,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    si.id,
    si.product_id,
    p.name,
    p.sku,
    si.quantity,
    COALESCE(si.returned_quantity, 0),
    si.quantity - COALESCE(si.returned_quantity, 0),
    si.unit_price,
    si.total_price
  FROM sale_items si
  JOIN products p ON si.product_id = p.id
  WHERE si.sale_id = p_sale_id
  AND (si.quantity - COALESCE(si.returned_quantity, 0)) > 0
  ORDER BY p.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to validate return eligibility
CREATE OR REPLACE FUNCTION validate_return_eligibility(p_sale_id uuid)
RETURNS TABLE (
  is_eligible boolean,
  reason text,
  days_since_sale integer,
  return_window_days integer
) AS $$
DECLARE
  v_sale_date timestamptz;
  v_days_since integer;
  v_window_days integer := 30;
BEGIN
  SELECT sale_date INTO v_sale_date
  FROM sales
  WHERE id = p_sale_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Sale not found', 0, v_window_days;
    RETURN;
  END IF;
  
  v_days_since := EXTRACT(days FROM (CURRENT_TIMESTAMP - v_sale_date));
  
  IF v_days_since > v_window_days THEN
    RETURN QUERY SELECT false, 'Return window expired', v_days_since, v_window_days;
  ELSE
    RETURN QUERY SELECT true, 'Eligible for return', v_days_since, v_window_days;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;