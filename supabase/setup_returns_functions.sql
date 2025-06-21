-- Complete setup for Returns system functions
-- This script creates all the missing functions needed for the Returns functionality

-- 1. Create the get_returnable_items function
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

-- 2. Create the validate_return_eligibility function
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

-- 3. Create the get_sale_for_return function
CREATE OR REPLACE FUNCTION get_sale_for_return(p_sale_id uuid)
RETURNS TABLE (
  sale_id uuid,
  receipt_number text,
  invoice_number text,
  sale_date timestamptz,
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
  return_status text,
  items_count bigint,
  returnable_items_count bigint,
  days_since_sale integer,
  is_eligible_for_return boolean,
  return_eligibility_reason text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.receipt_number::text,
    s.invoice_number::text,
    s.sale_date,
    s.customer_id,
    c.name::text as customer_name,
    c.phone::text as customer_phone,
    c.email::text as customer_email,
    s.total_amount,
    s.subtotal,
    s.discount_amount,
    s.tax_amount,
    s.payment_method::text,
    s.payment_status::text,
    s.cashier_name::text,
    COALESCE(s.return_status, 'none')::text as return_status,
    COUNT(si.id) as items_count,
    COUNT(si.id) FILTER (WHERE (si.quantity - COALESCE(SUM(ri.quantity), 0)) > 0) as returnable_items_count,
    EXTRACT(days FROM (CURRENT_TIMESTAMP - s.sale_date))::integer as days_since_sale,
    eligibility.is_eligible as is_eligible_for_return,
    eligibility.reason as return_eligibility_reason
  FROM sales s
  LEFT JOIN customers c ON s.customer_id = c.id
  LEFT JOIN sale_items si ON s.id = si.sale_id
  LEFT JOIN return_items ri ON si.id = ri.sale_item_id
  CROSS JOIN LATERAL validate_return_eligibility(s.id) eligibility
  WHERE s.id = p_sale_id
  GROUP BY s.id, s.receipt_number, s.invoice_number, s.sale_date, s.customer_id,
           s.total_amount, s.subtotal, s.discount_amount, s.tax_amount, s.payment_method,
           s.payment_status, s.cashier_name, s.return_status, c.name, c.phone, c.email,
           eligibility.is_eligible, eligibility.reason;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create the process_return_and_refund function
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
    
    -- Update product stock (return to inventory)
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
  
  -- Create refund transaction
  INSERT INTO refund_transactions (
    return_id, sale_id, customer_id, amount, payment_method, notes, transaction_date
  ) VALUES (
    v_return_id, p_sale_id, v_customer_id, v_total_refund, p_refund_method,
    'Refund for return: ' || p_return_reason, now()
  );
  
  -- Create cash ledger entry for refund
  INSERT INTO cash_ledger (
    transaction_type, amount, description, reference_id, transaction_date
  ) VALUES (
    'refund', -v_total_refund, 'Refund for return: ' || p_return_reason, v_return_id, now()
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

-- 5. Create the get_return_details function
CREATE OR REPLACE FUNCTION get_return_details(p_return_id uuid)
RETURNS TABLE (
  return_id uuid,
  sale_id uuid,
  receipt_number text,
  return_date timestamptz,
  return_reason text,
  refund_method text,
  refund_amount numeric(10,2),
  return_status text,
  processed_by text,
  notes text,
  customer_name text,
  customer_phone text,
  items jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id as return_id,
    r.sale_id,
    s.receipt_number::text,
    r.return_date,
    r.return_reason,
    r.refund_method,
    r.refund_amount,
    r.return_status,
    r.processed_by,
    r.notes,
    c.name::text as customer_name,
    c.phone::text as customer_phone,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'product_name', p.name,
          'quantity', ri.quantity,
          'unit_price', ri.unit_price,
          'refund_price', ri.refund_price,
          'condition', ri.condition
        )
      ) FROM return_items ri
      JOIN products p ON ri.product_id = p.id
      WHERE ri.return_id = r.id), 
      '[]'::jsonb
    ) as items
  FROM returns r
  JOIN sales s ON r.sale_id = s.id
  LEFT JOIN customers c ON r.customer_id = c.id
  WHERE r.id = p_return_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Test the functions
SELECT 'Testing get_returnable_items function:' as info;
SELECT * FROM get_returnable_items('72dad7b0-6fb0-4408-bcbf-ff830077d308');

SELECT 'Testing validate_return_eligibility function:' as info;
SELECT * FROM validate_return_eligibility('72dad7b0-6fb0-4408-bcbf-ff830077d308');

SELECT 'Testing get_sale_for_return function:' as info;
SELECT 
  receipt_number,
  sale_date,
  payment_status,
  is_eligible_for_return,
  return_eligibility_reason
FROM get_sale_for_return('72dad7b0-6fb0-4408-bcbf-ff830077d308'); 