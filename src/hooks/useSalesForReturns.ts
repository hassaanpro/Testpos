import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

interface SaleForReturns {
  sale_id: string
  receipt_number: string
  invoice_number: string
  sale_date: string
  customer_id?: string
  customer_name?: string
  customer_phone?: string
  customer_email?: string
  total_amount: number
  subtotal: number
  discount_amount: number
  tax_amount: number
  payment_method: string
  payment_status: string
  cashier_name?: string
  return_status: string
  items_count: number
  returnable_items_count: number
  days_since_sale: number
}

interface SaleForReturnDetails extends SaleForReturns {
  is_eligible_for_return: boolean
  return_eligibility_reason: string
}

export const useSalesForReturns = (
  searchTerm?: string,
  startDate?: string,
  endDate?: string,
  enabled: boolean = true
) => {
  return useQuery({
    queryKey: ['sales-for-returns', searchTerm, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_sales_for_returns', {
        p_search_term: searchTerm || null,
        p_start_date: startDate || null,
        p_end_date: endDate || null,
        p_limit: 50
      })
      
      if (error) throw error
      return data as SaleForReturns[]
    },
    enabled: enabled && (!!searchTerm || !!startDate || !!endDate),
    staleTime: 30000 // Cache for 30 seconds
  })
}

export const useSaleForReturn = (saleId: string) => {
  return useQuery({
    queryKey: ['sale-for-return', saleId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_sale_for_return', {
        p_sale_id: saleId
      })
      
      if (error) throw error
      return data[0] as SaleForReturnDetails
    },
    enabled: !!saleId
  })
}