/*
  # Fix Return Eligibility Function

  1. Changes
    - Update the `validate_return_eligibility` function to allow returns for both 'paid' and 'partially_paid' sales
    - This fixes the issue where customers can't return items from partially paid sales
    
  2. Purpose
    - Ensure consistency between the search function and the validation function
    - Allow returns for all valid payment statuses
    
  3. Security
    - Maintain existing RLS policies
    - No impact on data integrity
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS validate_return_eligibility(uuid);

-- Create the updated function
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
  
  -- Check if payment is completed or partially paid
  IF v_payment_status NOT IN ('paid', 'partially_paid') THEN
    RETURN QUERY SELECT false, 'Sale must be paid or partially paid to process returns', v_days_since_sale, v_return_window;
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

-- Add helpful comment
COMMENT ON FUNCTION validate_return_eligibility(uuid) IS 'Validates if a sale is eligible for returns, allowing both paid and partially paid sales';