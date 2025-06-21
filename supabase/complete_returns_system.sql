-- Complete Returns System with Proper Rules
-- This handles all return scenarios: refund, exchange, store credit, etc.

-- 1. Enhanced process_return_and_refund function with proper rules
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
    
    -- Update product stock (return to inventory) - only for refund/exchange
    IF p_refund_method IN ('cash', 'bank_transfer', 'store_credit', 'exchange') THEN
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
    END IF;
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
      -- For exchange, we don't create cash ledger entry
      -- Stock is already returned to inventory above
      -- Customer gets store credit for exchange
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

-- 2. Function to get return rules and policies
CREATE OR REPLACE FUNCTION get_return_policies()
RETURNS TABLE (
  policy_name text,
  policy_description text,
  policy_value text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'return_window'::text as policy_name,
    'Return window in days'::text as policy_description,
    '30'::text as policy_value
  UNION ALL
  SELECT 
    'payment_required'::text,
    'Payment status required for returns'::text,
    'paid, partially_paid'::text
  UNION ALL
  SELECT 
    'refund_methods'::text,
    'Available refund methods'::text,
    'cash, bank_transfer, store_credit, exchange'::text
  UNION ALL
  SELECT 
    'stock_return'::text,
    'Items returned to inventory for'::text,
    'cash, bank_transfer, store_credit, exchange'::text;
END;
$$ LANGUAGE plpgsql;

-- 3. Function to validate return items before processing
CREATE OR REPLACE FUNCTION validate_return_items(
  p_sale_id uuid,
  p_return_items jsonb
)
RETURNS TABLE (
  is_valid boolean,
  error_message text,
  item_details jsonb
) AS $$
DECLARE
  v_item jsonb;
  v_sale_item record;
  v_returnable_quantity integer;
  v_requested_quantity integer;
  v_errors jsonb := '[]'::jsonb;
  v_item_details jsonb := '[]'::jsonb;
BEGIN
  -- Check each return item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_return_items)
  LOOP
    -- Get sale item details
    SELECT si.*, p.name as product_name
    INTO v_sale_item
    FROM sale_items si
    JOIN products p ON si.product_id = p.id
    WHERE si.id = (v_item->>'sale_item_id')::uuid;
    
    -- Get returnable quantity
    SELECT quantity_returnable INTO v_returnable_quantity
    FROM get_returnable_items(p_sale_id)
    WHERE sale_item_id = (v_item->>'sale_item_id')::uuid;
    
    v_requested_quantity := (v_item->>'quantity')::integer;
    
    -- Validate quantity
    IF v_requested_quantity > v_returnable_quantity THEN
      v_errors := v_errors || jsonb_build_object(
        'item', v_sale_item.product_name,
        'error', 'Requested quantity (' || v_requested_quantity || ') exceeds returnable quantity (' || v_returnable_quantity || ')'
      );
    END IF;
    
    -- Add item details
    v_item_details := v_item_details || jsonb_build_object(
      'product_name', v_sale_item.product_name,
      'requested_quantity', v_requested_quantity,
      'returnable_quantity', v_returnable_quantity,
      'unit_price', v_sale_item.unit_price
    );
  END LOOP;
  
  -- Return validation result
  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN QUERY SELECT false, 'Validation errors found', v_errors;
  ELSE
    RETURN QUERY SELECT true, 'All items are valid for return', v_item_details;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Test the complete system
SELECT 'Testing return policies:' as info;
SELECT * FROM get_return_policies();

SELECT 'Testing return eligibility for RCP-000003:' as info;
SELECT * FROM validate_return_eligibility('72dad7b0-6fb0-4408-bcbf-ff830077d308'::uuid);

SELECT 'Testing returnable items for RCP-000003:' as info;
SELECT * FROM get_returnable_items('72dad7b0-6fb0-4408-bcbf-ff830077d308'::uuid); 