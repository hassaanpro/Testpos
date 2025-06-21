/*
  # Update Payment Transactions Constraint

  1. Changes
    - Update the payment_transactions_transaction_type_check constraint to include 'bnpl_payment' as a valid transaction type
    - This fixes the error: "new row for relation "payment_transactions" violates check constraint "payment_transactions_transaction_type_check""
    - The constraint currently only allows 'sale', 'refund', 'expense', 'advance' but we need to add 'bnpl_payment'

  2. Implementation
    - Drop the existing constraint
    - Create a new constraint with the updated list of allowed values
*/

-- First, drop the existing constraint
ALTER TABLE payment_transactions 
DROP CONSTRAINT IF EXISTS payment_transactions_transaction_type_check;

-- Create a new constraint with 'bnpl_payment' included in the allowed values
ALTER TABLE payment_transactions 
ADD CONSTRAINT payment_transactions_transaction_type_check 
CHECK (transaction_type IN ('sale', 'refund', 'expense', 'advance', 'bnpl_payment'));

-- Add a comment to explain the constraint
COMMENT ON CONSTRAINT payment_transactions_transaction_type_check ON payment_transactions IS 
'Ensures transaction_type is one of the allowed values: sale, refund, expense, advance, or bnpl_payment';