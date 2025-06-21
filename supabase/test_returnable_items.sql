-- Test script to check if get_returnable_items function works
-- This will help us understand why items aren't showing up in the Returns interface

-- 1. Check if the function exists
SELECT 'Function exists check:' as info;
SELECT 
  proname as function_name,
  proargtypes::regtype[] as argument_types,
  prorettype::regtype as return_type
FROM pg_proc 
WHERE proname = 'get_returnable_items';

-- 2. Test with the first sale ID from our previous results
SELECT 'Testing get_returnable_items for RCP-000003:' as info;
SELECT * FROM get_returnable_items('72dad7b0-6fb0-4408-bcbf-ff830077d308');

-- 3. Test with the second sale ID
SELECT 'Testing get_returnable_items for RCP-000002:' as info;
SELECT * FROM get_returnable_items('7cf0be9a-575c-4fd2-84c0-58fb1b1a4fa2');

-- 4. Test with the third sale ID
SELECT 'Testing get_returnable_items for RCP-000001:' as info;
SELECT * FROM get_returnable_items('55c1a562-c675-4db9-8093-2ed91984f425');

-- 5. Check sale_items directly for these sales
SELECT 'Sale items for RCP-000003:' as info;
SELECT 
  si.id as sale_item_id,
  si.quantity as quantity_sold,
  si.unit_price,
  si.total_price,
  p.name as product_name,
  p.sku as product_sku
FROM sale_items si
JOIN products p ON si.product_id = p.id
WHERE si.sale_id = '72dad7b0-6fb0-4408-bcbf-ff830077d308';

SELECT 'Sale items for RCP-000002:' as info;
SELECT 
  si.id as sale_item_id,
  si.quantity as quantity_sold,
  si.unit_price,
  si.total_price,
  p.name as product_name,
  p.sku as product_sku
FROM sale_items si
JOIN products p ON si.product_id = p.id
WHERE si.sale_id = '7cf0be9a-575c-4fd2-84c0-58fb1b1a4fa2';

SELECT 'Sale items for RCP-000001:' as info;
SELECT 
  si.id as sale_item_id,
  si.quantity as quantity_sold,
  si.unit_price,
  si.total_price,
  p.name as product_name,
  p.sku as product_sku
FROM sale_items si
JOIN products p ON si.product_id = p.id
WHERE si.sale_id = '55c1a562-c675-4db9-8093-2ed91984f425';

-- 6. Check return eligibility for these sales
SELECT 'Return eligibility for RCP-000003:' as info;
SELECT * FROM validate_return_eligibility('72dad7b0-6fb0-4408-bcbf-ff830077d308');

SELECT 'Return eligibility for RCP-000002:' as info;
SELECT * FROM validate_return_eligibility('7cf0be9a-575c-4fd2-84c0-58fb1b1a4fa2');

SELECT 'Return eligibility for RCP-000001:' as info;
SELECT * FROM validate_return_eligibility('55c1a562-c675-4db9-8093-2ed91984f425'); 