-- Create function to get BNPL summary statistics
CREATE OR REPLACE FUNCTION get_bnpl_summary()
RETURNS TABLE (
  total_bnpl_amount numeric(10,2),
  total_amount_paid numeric(10,2),
  total_amount_due numeric(10,2),
  total_transactions bigint,
  paid_transactions bigint,
  partially_paid_transactions bigint,
  pending_transactions bigint,
  overdue_transactions bigint,
  collection_rate numeric(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(bt.original_amount), 0) as total_bnpl_amount,
    COALESCE(SUM(bt.amount_paid), 0) as total_amount_paid,
    COALESCE(SUM(bt.amount_due), 0) as total_amount_due,
    COUNT(bt.id)::bigint as total_transactions,
    COUNT(CASE WHEN bt.status = 'paid' THEN 1 END)::bigint as paid_transactions,
    COUNT(CASE WHEN bt.status = 'partially_paid' THEN 1 END)::bigint as partially_paid_transactions,
    COUNT(CASE WHEN bt.status = 'pending' THEN 1 END)::bigint as pending_transactions,
    COUNT(CASE WHEN bt.status = 'overdue' THEN 1 END)::bigint as overdue_transactions,
    CASE 
      WHEN SUM(bt.original_amount) > 0 
      THEN ROUND((SUM(bt.amount_paid) / SUM(bt.original_amount)) * 100, 2)
      ELSE 0
    END as collection_rate
  FROM bnpl_transactions bt;
END;
$$;

-- Add helpful comment
COMMENT ON FUNCTION get_bnpl_summary() IS 'Gets summary statistics for all BNPL transactions';

-- Grant execute permission to public (since RLS is enabled on tables)
GRANT EXECUTE ON FUNCTION get_bnpl_summary() TO public;