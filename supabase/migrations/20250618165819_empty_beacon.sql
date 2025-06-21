/*
  # Add low stock products function

  1. New Functions
    - `get_low_stock_products()` - Returns products where stock_quantity <= min_stock_level
    
  2. Purpose
    - Enables proper column-to-column comparison in database queries
    - Fixes the invalid input syntax error when comparing stock_quantity with min_stock_level
    
  3. Security
    - Function is accessible to authenticated and anonymous users (matches existing RLS policies)
*/

CREATE OR REPLACE FUNCTION get_low_stock_products()
RETURNS SETOF products
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM products
  WHERE stock_quantity <= min_stock_level 
    AND is_active = TRUE
  ORDER BY created_at DESC;
END;
$$;