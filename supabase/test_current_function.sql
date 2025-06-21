-- Test Current BNPL Function
-- This script tests the current function state

-- Check if the function exists
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'process_bnpl_payment'
AND n.nspname = 'public';

-- Test the current function
SELECT * FROM process_bnpl_payment('f29bc7eb-86d1-4e84-b657-032bc6a5fc12', 100.00); 