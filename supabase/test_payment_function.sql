-- Test BNPL Payment Function
-- Processing a 100.00 payment for the BNPL transaction

-- Test the payment function with the actual BNPL ID
SELECT * FROM process_bnpl_payment('f29bc7eb-86d1-4e84-b657-032bc6a5fc12', 100.00);

-- Check the results - this should show:
-- success: true
-- message: Payment processed successfully. Receipt: RCPT-BNPL-...
-- remaining_amount: 200.00
-- payment_id: BNPL-PAY-...
-- receipt_number: RCPT-BNPL-... 