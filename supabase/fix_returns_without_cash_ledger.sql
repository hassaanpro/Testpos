-- Fix Returns System without cash_ledger dependency
-- This version works with your existing database structure

-- 1. Create cash_ledger table if it doesn't exist
CREATE TABLE IF NOT EXISTS cash_ledger (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_type text NOT NULL,
  amount numeric(10,2) NOT NULL,
  description text,
  reference_id uuid,
  transaction_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for cash_ledger
CREATE INDEX IF NOT EXISTS idx_cash_ledger_transaction_type ON cash_ledger(transaction_type);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_transaction_date ON cash_ledger(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_reference_id ON cash_ledger(reference_id);

-- 2. Create returns table if it doesn't exist
CREATE TABLE IF NOT EXISTS returns (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id uuid REFERENCES sales(id),
  customer_id uuid REFERENCES customers(id),
  return_reason text NOT NULL,
  refund_method text NOT NULL,
  refund_amount numeric(10,2) DEFAULT 0,
  return_status text DEFAULT 'pending',
  processed_by text,
  notes text,
  return_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Create return_items table if it doesn't exist
CREATE TABLE IF NOT EXISTS return_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  return_id uuid REFERENCES returns(id),
  sale_item_id uuid REFERENCES sale_items(id),
  product_id uuid REFERENCES products(id),
  quantity integer NOT NULL,
  unit_price numeric(10,2) NOT NULL,
  refund_price numeric(10,2) NOT NULL,
  condition text DEFAULT 'good',
  created_at timestamptz DEFAULT now()
);

-- 4. Create refund_transactions table if it doesn't exist
CREATE TABLE IF NOT EXISTS refund_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  return_id uuid REFERENCES returns(id),
  sale_id uuid REFERENCES sales(id),
  customer_id uuid REFERENCES customers(id),
  amount numeric(10,2) NOT NULL,
  payment_method text NOT NULL,
  notes text,
  transaction_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create indexes for returns tables
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

-- 5. Fixed process_return_and_refund function (without cash_ledger dependency)
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
  v_sale_total numeric(10,2);
  v_already_returned numeric(10,2);
  v_return_amount numeric(10,2);
BEGIN
  -- Validate return eligibility first
  IF NOT EXISTS (
    SELECT 1 FROM validate_return_eligibility(p_sale_id) WHERE is_eligible = true
  ) THEN
    RAISE EXCEPTION 'Sale is not eligible for return';
  END IF;

  -- Get customer ID and sale total from sale
  SELECT customer_id, total_amount INTO v_customer_id, v_sale_total 
  FROM sales WHERE id = p_sale_id;
  
  -- Calculate total already returned for this sale
  SELECT COALESCE(SUM(r.refund_amount), 0) INTO v_already_returned
  FROM returns r WHERE r.sale_id = p_sale_id;
  
  -- Create return record
  INSERT INTO returns (
    sale_id, customer_id, return_reason, refund_method, processed_by, notes, return_status, return_date
  ) VALUES (
    p_sale_id, v_customer_id, p_return_reason, p_refund_method, p_processed_by, p_notes, 'completed', now()
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
    
    -- Update product stock (return to inventory) - for all refund methods
    UPDATE products 
    SET stock_quantity = stock_quantity + (v_item->>'quantity')::integer,
        updated_at = now()
    WHERE id = v_sale_item.product_id;
    
    -- Create stock movement record
    INSERT INTO stock_movements (
      product_id, movement_type, quantity, reference_type, reference_id, notes, movement_date
    ) VALUES (
      v_sale_item.product_id,
      'in',
      (v_item->>'quantity')::integer,
      'return',
      v_return_id,
      'Stock returned from sale return: ' || v_sale_item.product_name,
      now()
    );
  END LOOP;
  
  -- Update return with total refund amount
  UPDATE returns SET refund_amount = v_total_refund WHERE id = v_return_id;
  
  -- Handle different refund methods
  CASE p_refund_method
    WHEN 'cash' THEN
      -- Create cash ledger entry for cash refund
      INSERT INTO cash_ledger (
        transaction_type, amount, description, reference_id, transaction_date
      ) VALUES (
        'refund', -v_total_refund, 'Cash refund for return: ' || p_return_reason, v_return_id, now()
      );
      
    WHEN 'bank_transfer' THEN
      -- Create cash ledger entry for bank transfer refund
      INSERT INTO cash_ledger (
        transaction_type, amount, description, reference_id, transaction_date
      ) VALUES (
        'refund', -v_total_refund, 'Bank transfer refund for return: ' || p_return_reason, v_return_id, now()
      );
      
    WHEN 'store_credit' THEN
      -- Update customer balance for store credit
      IF v_customer_id IS NOT NULL THEN
        UPDATE customers 
        SET current_balance = current_balance + v_total_refund,
            updated_at = now()
        WHERE id = v_customer_id;
      END IF;
      
    WHEN 'exchange' THEN
      -- For exchange, customer gets store credit
      IF v_customer_id IS NOT NULL THEN
        UPDATE customers 
        SET current_balance = current_balance + v_total_refund,
            updated_at = now()
        WHERE id = v_customer_id;
      END IF;
  END CASE;
  
  -- Create refund transaction record
  INSERT INTO refund_transactions (
    return_id, sale_id, customer_id, amount, payment_method, notes, transaction_date
  ) VALUES (
    v_return_id, p_sale_id, v_customer_id, v_total_refund, p_refund_method,
    'Refund for return: ' || p_return_reason, now()
  );
  
  -- Update sale return status
  v_return_amount := v_already_returned + v_total_refund;
  IF v_return_amount >= v_sale_total THEN
    -- Fully returned
    UPDATE sales SET return_status = 'fully_returned', updated_at = now() WHERE id = p_sale_id;
  ELSE
    -- Partially returned
    UPDATE sales SET return_status = 'partially_returned', updated_at = now() WHERE id = p_sale_id;
  END IF;
  
  RETURN v_return_id;
END;
$$;

-- Test the fixed system
SELECT 'Testing return eligibility for RCP-000003:' as info;
SELECT * FROM validate_return_eligibility('72dad7b0-6fb0-4408-bcbf-ff830077d308'::uuid);

SELECT 'Testing returnable items for RCP-000003:' as info;
SELECT * FROM get_returnable_items('72dad7b0-6fb0-4408-bcbf-ff830077d308'::uuid);

SELECT 'Testing tables exist:' as info;
SELECT 
  table_name,
  CASE WHEN table_name IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END as status
FROM (
  SELECT 'returns' as table_name
  UNION ALL SELECT 'return_items'
  UNION ALL SELECT 'refund_transactions'
  UNION ALL SELECT 'cash_ledger'
) t
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_name = t.table_name
); 