/*
  # Create Returns and Refunds System

  1. New Tables
    - `returns`
      - `id` (uuid, primary key)
      - `sale_id` (uuid, foreign key to sales)
      - `customer_id` (uuid, foreign key to customers)
      - `return_date` (timestamp)
      - `return_reason` (text)
      - `return_status` (text with check constraint)
      - `refund_amount` (numeric)
      - `refund_method` (text)
      - `processed_by` (text)
      - `notes` (text, optional)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `return_items`
      - `id` (uuid, primary key)
      - `return_id` (uuid, foreign key to returns)
      - `sale_item_id` (uuid, foreign key to sale_items)
      - `product_id` (uuid, foreign key to products)
      - `quantity` (integer)
      - `unit_price` (numeric)
      - `refund_price` (numeric)
      - `condition` (text with check constraint)
      - `created_at` (timestamp)

    - `refund_transactions`
      - `id` (uuid, primary key)
      - `return_id` (uuid, foreign key to returns)
      - `sale_id` (uuid, foreign key to sales)
      - `customer_id` (uuid, foreign key to customers)
      - `amount` (numeric)
      - `payment_method` (text)
      - `transaction_date` (timestamp)
      - `status` (text with check constraint)
      - `notes` (text, optional)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all new tables
    - Add policies for public access (matching existing pattern)

  3. Functions
    - `get_returnable_items` - Get items that can be returned for a sale
    - `validate_return_eligibility` - Check if a sale is eligible for returns
    - `process_return_and_refund` - Process a complete return transaction
    - `get_return_details` - Get detailed return information

  4. Indexes
    - Add performance indexes for common queries
*/

-- Create returns table
CREATE TABLE IF NOT EXISTS returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES sales(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  return_date timestamptz DEFAULT now(),
  return_reason text NOT NULL,
  return_status text DEFAULT 'pending' CHECK (return_status IN ('pending', 'approved', 'rejected', 'completed')),
  refund_amount numeric(10,2) DEFAULT 0 CHECK (refund_amount >= 0),
  refund_method text DEFAULT 'cash' CHECK (refund_method IN ('cash', 'card', 'store_credit')),
  processed_by text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create return_items table
CREATE TABLE IF NOT EXISTS return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid REFERENCES returns(id) ON DELETE CASCADE,
  sale_item_id uuid REFERENCES sale_items(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  refund_price numeric(10,2) NOT NULL CHECK (refund_price >= 0),
  condition text DEFAULT 'good' CHECK (condition IN ('good', 'damaged', 'defective')),
  created_at timestamptz DEFAULT now()
);

-- Create refund_transactions table
CREATE TABLE IF NOT EXISTS refund_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid REFERENCES returns(id) ON DELETE SET NULL,
  sale_id uuid REFERENCES sales(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL,
  transaction_date timestamptz DEFAULT now(),
  status text DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_transactions ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (matching existing pattern)
CREATE POLICY "Public access" ON returns FOR ALL TO public USING (true);
CREATE POLICY "Public access" ON return_items FOR ALL TO public USING (true);
CREATE POLICY "Public access" ON refund_transactions FOR ALL TO public USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_returns_sale_id ON returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_returns_customer_id ON returns(customer_id);
CREATE INDEX IF NOT EXISTS idx_returns_return_date ON returns(return_date DESC);
CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(return_status);

CREATE INDEX IF NOT EXISTS idx_return_items_return_id ON return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_sale_item_id ON return_items(sale_item_id);
CREATE INDEX IF NOT EXISTS idx_return_items_product_id ON return_items(product_id);

CREATE INDEX IF NOT EXISTS idx_refund_transactions_return_id ON refund_transactions(return_id);
CREATE INDEX IF NOT EXISTS idx_refund_transactions_sale_id ON refund_transactions(sale_id);
CREATE INDEX IF NOT EXISTS idx_refund_transactions_customer_id ON refund_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_refund_transactions_date ON refund_transactions(transaction_date DESC);

-- Function to get returnable items for a sale
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
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    si.id as sale_item_id,
    si.product_id,
    p.name as product_name,
    p.sku as product_sku,
    si.quantity as quantity_sold,
    COALESCE(SUM(ri.quantity), 0)::integer as quantity_returned,
    (si.quantity - COALESCE(SUM(ri.quantity), 0))::integer as quantity_returnable,
    si.unit_price,
    si.total_price
  FROM sale_items si
  JOIN products p ON si.product_id = p.id
  LEFT JOIN return_items ri ON si.id = ri.sale_item_id
  WHERE si.sale_id = p_sale_id
  GROUP BY si.id, si.product_id, p.name, p.sku, si.quantity, si.unit_price, si.total_price
  HAVING (si.quantity - COALESCE(SUM(ri.quantity), 0)) > 0;
END;
$$;

-- Function to validate return eligibility
CREATE OR REPLACE FUNCTION validate_return_eligibility(p_sale_id uuid)
RETURNS TABLE (
  is_eligible boolean,
  reason text,
  days_since_sale integer,
  return_window_days integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_sale_date timestamptz;
  v_payment_status text;
  v_days_since_sale integer;
  v_return_window integer := 30; -- 30 day return window
BEGIN
  -- Get sale information
  SELECT sale_date, payment_status 
  INTO v_sale_date, v_payment_status
  FROM sales 
  WHERE id = p_sale_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Sale not found', 0, v_return_window;
    RETURN;
  END IF;
  
  -- Calculate days since sale
  v_days_since_sale := EXTRACT(DAY FROM (now() - v_sale_date))::integer;
  
  -- Check if payment is completed
  IF v_payment_status != 'paid' THEN
    RETURN QUERY SELECT false, 'Sale must be paid to process returns', v_days_since_sale, v_return_window;
    RETURN;
  END IF;
  
  -- Check return window
  IF v_days_since_sale > v_return_window THEN
    RETURN QUERY SELECT false, 'Return window has expired (30 days)', v_days_since_sale, v_return_window;
    RETURN;
  END IF;
  
  -- Check if there are returnable items
  IF NOT EXISTS (
    SELECT 1 FROM get_returnable_items(p_sale_id)
  ) THEN
    RETURN QUERY SELECT false, 'No items available for return', v_days_since_sale, v_return_window;
    RETURN;
  END IF;
  
  -- All checks passed
  RETURN QUERY SELECT true, 'Sale is eligible for return', v_days_since_sale, v_return_window;
END;
$$;

-- Function to process return and refund
CREATE OR REPLACE FUNCTION process_return_and_refund(
  p_sale_id uuid,
  p_return_items jsonb,
  p_return_reason text,
  p_refund_method text,
  p_processed_by text,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_return_id uuid;
  v_customer_id uuid;
  v_total_refund numeric(10,2) := 0;
  v_item jsonb;
  v_sale_item record;
  v_refund_price numeric(10,2);
BEGIN
  -- Get customer ID from sale
  SELECT customer_id INTO v_customer_id FROM sales WHERE id = p_sale_id;
  
  -- Create return record
  INSERT INTO returns (
    sale_id, customer_id, return_reason, refund_method, processed_by, notes, return_status
  ) VALUES (
    p_sale_id, v_customer_id, p_return_reason, p_refund_method, p_processed_by, p_notes, 'completed'
  ) RETURNING id INTO v_return_id;
  
  -- Process each return item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_return_items)
  LOOP
    -- Get sale item details
    SELECT si.*, p.name as product_name
    INTO v_sale_item
    FROM sale_items si
    JOIN products p ON si.product_id = p.id
    WHERE si.id = (v_item->>'sale_item_id')::uuid;
    
    -- Calculate refund price (full unit price for now)
    v_refund_price := v_sale_item.unit_price * (v_item->>'quantity')::integer;
    v_total_refund := v_total_refund + v_refund_price;
    
    -- Insert return item
    INSERT INTO return_items (
      return_id, sale_item_id, product_id, quantity, unit_price, refund_price, condition
    ) VALUES (
      v_return_id,
      (v_item->>'sale_item_id')::uuid,
      v_sale_item.product_id,
      (v_item->>'quantity')::integer,
      v_sale_item.unit_price,
      v_refund_price,
      v_item->>'condition'
    );
    
    -- Update product stock (return to inventory)
    UPDATE products 
    SET stock_quantity = stock_quantity + (v_item->>'quantity')::integer,
        updated_at = now()
    WHERE id = v_sale_item.product_id;
    
    -- Create stock movement record
    INSERT INTO stock_movements (
      product_id, movement_type, quantity, reference_type, reference_id, notes
    ) VALUES (
      v_sale_item.product_id,
      'in',
      (v_item->>'quantity')::integer,
      'return',
      v_return_id,
      'Stock returned from sale return: ' || v_sale_item.product_name
    );
  END LOOP;
  
  -- Update return with total refund amount
  UPDATE returns SET refund_amount = v_total_refund WHERE id = v_return_id;
  
  -- Create refund transaction
  INSERT INTO refund_transactions (
    return_id, sale_id, customer_id, amount, payment_method, notes
  ) VALUES (
    v_return_id, p_sale_id, v_customer_id, v_total_refund, p_refund_method,
    'Refund for return: ' || p_return_reason
  );
  
  -- Create cash ledger entry for refund
  INSERT INTO cash_ledger (
    transaction_type, amount, description, reference_id
  ) VALUES (
    'refund', -v_total_refund, 'Refund for return: ' || p_return_reason, v_return_id
  );
  
  -- Update customer balance if applicable
  IF v_customer_id IS NOT NULL AND p_refund_method = 'store_credit' THEN
    UPDATE customers 
    SET current_balance = current_balance + v_total_refund,
        updated_at = now()
    WHERE id = v_customer_id;
  END IF;
  
  RETURN v_return_id;
END;
$$;

-- Function to get return details
CREATE OR REPLACE FUNCTION get_return_details(p_return_id uuid)
RETURNS TABLE (
  return_id uuid,
  sale_id uuid,
  receipt_number text,
  invoice_number text,
  customer_name text,
  return_date timestamptz,
  return_reason text,
  return_status text,
  refund_amount numeric(10,2),
  refund_method text,
  processed_by text,
  notes text,
  items_json jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id as return_id,
    r.sale_id,
    s.receipt_number,
    s.invoice_number,
    COALESCE(c.name, 'Walk-in Customer') as customer_name,
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
    ) as items_json
  FROM returns r
  JOIN sales s ON r.sale_id = s.id
  LEFT JOIN customers c ON r.customer_id = c.id
  LEFT JOIN return_items ri ON r.id = ri.return_id
  LEFT JOIN products p ON ri.product_id = p.id
  WHERE r.id = p_return_id
  GROUP BY r.id, r.sale_id, s.receipt_number, s.invoice_number, c.name, 
           r.return_date, r.return_reason, r.return_status, r.refund_amount, 
           r.refund_method, r.processed_by, r.notes;
END;
$$;