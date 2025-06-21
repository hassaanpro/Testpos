-- Fix the generate_receipt_number function to resolve ambiguous column reference
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS VARCHAR AS $$
DECLARE
  next_number INTEGER;
  receipt_number VARCHAR(50);
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(s.receipt_number FROM 'RCP-(\d+)') AS INTEGER)), 0) + 1
  INTO next_number
  FROM sales s;
  
  receipt_number := 'RCP-' || LPAD(next_number::TEXT, 6, '0');
  RETURN receipt_number;
END;
$$ LANGUAGE plpgsql;

-- Test the function
SELECT generate_receipt_number(); 