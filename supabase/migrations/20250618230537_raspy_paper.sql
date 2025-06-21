/*
  # Loyalty Point Deduction on Refund

  1. Enhanced Return Processing
    - Modify `process_return_and_refund` function to deduct loyalty points on refunds
    - Calculate points to deduct based on refund amount and active loyalty rule
    - Create loyalty transaction records for point deductions
    - Update customer loyalty points balance

  2. New Functions
    - `calculate_loyalty_points_for_refund` - Calculate points to deduct
    - `deduct_loyalty_points_for_refund` - Process the point deduction

  3. Security
    - Maintain existing RLS policies
    - Ensure atomic transactions for data consistency
*/

-- Function to calculate loyalty points to deduct for a refund
CREATE OR REPLACE FUNCTION calculate_loyalty_points_for_refund(
  p_refund_amount numeric(10,2)
) RETURNS integer AS $$
DECLARE
  v_points_to_deduct integer := 0;
  v_active_rule record;
BEGIN
  -- Get the active loyalty rule
  SELECT * INTO v_active_rule
  FROM loyalty_rules
  WHERE is_active = true
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- If no active rule, no points to deduct
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Calculate points to deduct based on refund amount
  -- Use the same rate as earning (points_per_rupee)
  v_points_to_deduct := FLOOR(p_refund_amount * v_active_rule.points_per_rupee);
  
  RETURN GREATEST(0, v_points_to_deduct);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to deduct loyalty points for a refund
CREATE OR REPLACE FUNCTION deduct_loyalty_points_for_refund(
  p_customer_id uuid,
  p_sale_id uuid,
  p_refund_amount numeric(10,2),
  p_return_id uuid DEFAULT NULL
) RETURNS integer AS $$
DECLARE
  v_points_to_deduct integer;
  v_customer_current_points integer;
  v_actual_deduction integer;
BEGIN
  -- Calculate points to deduct
  v_points_to_deduct := calculate_loyalty_points_for_refund(p_refund_amount);
  
  -- If no points to deduct, return 0
  IF v_points_to_deduct <= 0 THEN
    RETURN 0;
  END IF;
  
  -- Get customer's current loyalty points
  SELECT loyalty_points INTO v_customer_current_points
  FROM customers
  WHERE id = p_customer_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer with ID % not found', p_customer_id;
  END IF;
  
  -- Calculate actual deduction (can't deduct more points than customer has)
  v_actual_deduction := LEAST(v_points_to_deduct, v_customer_current_points);
  
  -- Only proceed if there are points to deduct
  IF v_actual_deduction > 0 THEN
    -- Update customer's loyalty points
    UPDATE customers
    SET loyalty_points = loyalty_points - v_actual_deduction
    WHERE id = p_customer_id;
    
    -- Create loyalty transaction record for the deduction
    INSERT INTO loyalty_transactions (
      customer_id,
      sale_id,
      points_earned,
      points_redeemed,
      transaction_date
    ) VALUES (
      p_customer_id,
      p_sale_id,
      0, -- No points earned
      v_actual_deduction, -- Points deducted
      now()
    );
  END IF;
  
  RETURN v_actual_deduction;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced process_return_and_refund function with loyalty point deduction
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
  v_loyalty_points_deducted integer := 0;
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
  
  -- Handle loyalty point deduction for refunds
  IF v_customer_id IS NOT NULL THEN
    -- Only deduct loyalty points for cash/card payments (not BNPL)
    -- BNPL transactions award points when they're paid, not when the sale is created
    IF v_sale_record.payment_method IN ('cash', 'card') THEN
      v_loyalty_points_deducted := deduct_loyalty_points_for_refund(
        v_customer_id,
        p_sale_id,
        v_total_refund_amount,
        v_return_id
      );
    END IF;
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

-- Function to get loyalty point history for a customer
CREATE OR REPLACE FUNCTION get_customer_loyalty_history(p_customer_id uuid)
RETURNS TABLE (
  transaction_date timestamptz,
  points_earned integer,
  points_redeemed integer,
  net_change integer,
  transaction_type text,
  reference_id uuid,
  reference_type text,
  reference_number text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    lt.transaction_date,
    lt.points_earned,
    lt.points_redeemed,
    (lt.points_earned - lt.points_redeemed) as net_change,
    CASE 
      WHEN lt.points_earned > 0 THEN 'earned'
      WHEN lt.points_redeemed > 0 THEN 'redeemed'
      ELSE 'adjusted'
    END as transaction_type,
    lt.sale_id as reference_id,
    CASE 
      WHEN r.id IS NOT NULL THEN 'return'
      ELSE 'sale'
    END as reference_type,
    COALESCE(
      r.id::text, 
      s.receipt_number
    ) as reference_number
  FROM loyalty_transactions lt
  LEFT JOIN sales s ON lt.sale_id = s.id
  LEFT JOIN returns r ON r.sale_id = s.id
  WHERE lt.customer_id = p_customer_id
  ORDER BY lt.transaction_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;