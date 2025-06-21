/*
  # Remove Date of Birth from Customer Management

  1. Database Changes
    - Remove `date_of_birth` column from customers table
    - Remove any related constraints or indexes
    
  2. Security
    - Maintain existing RLS policies
    - No impact on existing customer data integrity
*/

-- Remove the date_of_birth column from customers table
ALTER TABLE customers DROP COLUMN IF EXISTS date_of_birth;

-- Note: No additional constraints or indexes were specifically created for date_of_birth
-- so no additional cleanup is needed