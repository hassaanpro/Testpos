-- Fix the return eligibility function with proper rules
-- This will ensure all return rules are applied correctly

-- Drop and recreate the validate_return_eligibility function
DROP FUNCTION IF EXISTS validate_return_eligibility(uuid);

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
  v_sale_exists boolean := false;
BEGIN
  -- Check if sale exists
  SELECT EXISTS(SELECT 1 FROM sales WHERE id = p_sale_id) INTO v_sale_exists;
  
  IF NOT v_sale_exists THEN
    RETURN QUERY SELECT false, 'Sale not found in database', 0, v_return_window;
    RETURN;
  END IF;

  -- Get sale information
  SELECT sale_date, payment_status 
  INTO v_sale_date, v_payment_status
  FROM sales 
  WHERE id = p_sale_id;
  
  -- Calculate days since sale
  v_days_since_sale := EXTRACT(DAY FROM (now() - v_sale_date))::integer;
  
  -- Rule 1: Check if payment is completed
  IF v_payment_status IS NULL OR v_payment_status NOT IN ('paid', 'partially_paid') THEN
    RETURN QUERY SELECT false, 'Sale must be paid or partially paid to process returns', v_days_since_sale, v_return_window;
    RETURN;
  END IF;
  
  -- Rule 2: Check return window (30 days from sale date)
  IF v_days_since_sale > v_return_window THEN
    RETURN QUERY SELECT false, 'Return window has expired (30 days from sale date)', v_days_since_sale, v_return_window;
    RETURN;
  END IF;
  
  -- Rule 3: Check if there are returnable items
  IF NOT EXISTS (
    SELECT 1 FROM get_returnable_items(p_sale_id)
  ) THEN
    RETURN QUERY SELECT false, 'No items available for return (all items may have been returned already)', v_days_since_sale, v_return_window;
    RETURN;
  END IF;
  
  -- Rule 4: Check if sale is not already fully returned
  IF EXISTS (
    SELECT 1 FROM sales s
    WHERE s.id = p_sale_id AND s.return_status = 'fully_returned'
  ) THEN
    RETURN QUERY SELECT false, 'This sale has already been fully returned', v_days_since_sale, v_return_window;
    RETURN;
  END IF;
  
  -- All checks passed - sale is eligible for return
  RETURN QUERY SELECT true, 'Sale is eligible for return within 30-day window', v_days_since_sale, v_return_window;
END;
$$;

-- Test the fixed function
SELECT 'Testing validate_return_eligibility for RCP-000003:' as info;
SELECT * FROM validate_return_eligibility('72dad7b0-6fb0-4408-bcbf-ff830077d308'::uuid);

-- Test for other sales
SELECT 'Testing validate_return_eligibility for RCP-000002:' as info;
SELECT * FROM validate_return_eligibility('7cf0be9a-575c-4fd2-84c0-58fb1b1a4fa2'::uuid);

SELECT 'Testing validate_return_eligibility for RCP-000001:' as info;
SELECT * FROM validate_return_eligibility('55c1a562-c675-4db9-8093-2ed91984f425'::uuid); 