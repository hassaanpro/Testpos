import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Get all BNPL sales with their transaction details
export const useBnplSales = (
  searchTerm?: string,
  startDate?: string,
  endDate?: string,
  status?: string
) => {
  return useQuery({
    queryKey: ['bnpl-sales', searchTerm, startDate, endDate, status],
    queryFn: async () => {
      let query = supabase
        .from('sales')
        .select(`
          id,
          invoice_number,
          receipt_number,
          sale_date,
          customer_id,
          subtotal,
          discount_amount,
          tax_amount,
          total_amount,
          payment_method,
          payment_status,
          cashier_name,
          customer:customers(id, name, phone, email),
          bnpl_transaction:bnpl_transactions(
            id,
            original_amount,
            amount_paid,
            amount_due,
            due_date,
            status,
            created_at,
            updated_at
          )
        `)
        .eq('payment_method', 'bnpl')
        .order('sale_date', { ascending: false })
      
      // Apply filters if provided
      if (searchTerm) {
        query = query.or(
          `invoice_number.ilike.%${searchTerm}%,receipt_number.ilike.%${searchTerm}%,customers.name.ilike.%${searchTerm}%,customers.phone.ilike.%${searchTerm}%`
        )
      }
      
      if (startDate) {
        query = query.gte('sale_date', startDate)
      }
      
      if (endDate) {
        query = query.lte('sale_date', endDate + 'T23:59:59')
      }
      
      if (status) {
        query = query.eq('bnpl_transactions.status', status)
      }
      
      const { data, error } = await query
      
      if (error) throw error
      
      return data.map(sale => ({
        ...sale,
        bnpl_transaction: sale.bnpl_transaction?.[0] || null
      }))
    },
    refetchInterval: 30000 // Refetch every 30 seconds
  })
}

// Get BNPL sales summary statistics
export const useBnplSalesSummary = () => {
  return useQuery({
    queryKey: ['bnpl-sales-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_bnpl_summary')
      
      if (error) throw error
      return data[0]
    },
    refetchInterval: 30000 // Refetch every 30 seconds
  })
}

// Get BNPL payment history for a specific transaction
export const useBnplPaymentDetails = (bnplId: string) => {
  return useQuery({
    queryKey: ['bnpl-payment-details', bnplId],
    queryFn: async () => {
      if (!bnplId) return null
      
      const { data, error } = await supabase
        .from('bnpl_payment_history')
        .select('*')
        .eq('bnpl_transaction_id', bnplId)
        .order('payment_date', { ascending: false })
      
      if (error) throw error
      return data
    },
    enabled: !!bnplId
  })
}