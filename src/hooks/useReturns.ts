import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, Return, ReturnItem, RefundTransaction, ReturnableItem, ReturnEligibility } from '../lib/supabase'
import toast from 'react-hot-toast'

// Get all returns with optional filters
export const useReturns = (
  dateFrom?: string,
  dateTo?: string,
  status?: string,
  customerId?: string
) => {
  return useQuery({
    queryKey: ['returns', dateFrom, dateTo, status, customerId],
    queryFn: async () => {
      let query = supabase
        .from('returns')
        .select(`
          *,
          sale:sales(*),
          customer:customers(*),
          return_items:return_items(
            *,
            product:products(*),
            sale_item:sale_items(*)
          )
        `)
        .order('return_date', { ascending: false })
      
      if (dateFrom) query = query.gte('return_date', dateFrom)
      if (dateTo) query = query.lte('return_date', dateTo)
      if (status) query = query.eq('return_status', status)
      if (customerId) query = query.eq('customer_id', customerId)
      
      const { data, error } = await query
      
      if (error) throw error
      return data as Return[]
    }
  })
}

// Get a specific return by ID
export const useReturn = (returnId: string) => {
  return useQuery({
    queryKey: ['return', returnId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_return_details', {
        p_return_id: returnId
      })
      
      if (error) throw error
      return data[0]
    },
    enabled: !!returnId
  })
}

// Get detailed return information
export const useReturnDetails = (returnId: string) => {
  return useQuery({
    queryKey: ['return-details', returnId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_return_details', {
        p_return_id: returnId
      })
      
      if (error) throw error
      return data[0]
    },
    enabled: !!returnId
  })
}

// Get returnable items for a sale
export const useReturnableItems = (saleId: string) => {
  return useQuery({
    queryKey: ['returnable-items', saleId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_returnable_items', {
        p_sale_id: saleId
      })
      
      if (error) throw error
      return data as ReturnableItem[]
    },
    enabled: !!saleId
  })
}

// Check return eligibility for a sale
export const useReturnEligibility = (saleId: string) => {
  return useQuery({
    queryKey: ['return-eligibility', saleId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('validate_return_eligibility', {
        p_sale_id: saleId
      })
      
      if (error) throw error
      return data[0] as ReturnEligibility
    },
    enabled: !!saleId
  })
}

// Process a return and refund
export const useProcessReturn = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({
      saleId,
      returnItems,
      returnReason,
      refundMethod,
      processedBy,
      notes
    }: {
      saleId: string
      returnItems: Array<{
        sale_item_id: string
        quantity: number
        condition: 'good' | 'damaged' | 'defective'
      }>
      returnReason: string
      refundMethod: string
      processedBy: string
      notes?: string
    }) => {
      const { data, error } = await supabase.rpc('process_return_and_refund', {
        p_sale_id: saleId,
        p_return_items: returnItems,
        p_return_reason: returnReason,
        p_refund_method: refundMethod,
        p_processed_by: processedBy,
        p_notes: notes
      })
      
      if (error) throw error
      return data as string // Returns the return ID
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['returns'] })
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] })
      queryClient.invalidateQueries({ queryKey: ['cash-ledger'] })
      queryClient.invalidateQueries({ queryKey: ['bnpl-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['refund-transactions'] })
      toast.success('Return processed successfully')
    },
    onError: (error) => {
      toast.error('Failed to process return: ' + error.message)
    }
  })
}

// Get refund transactions
export const useRefundTransactions = (
  dateFrom?: string,
  dateTo?: string,
  customerId?: string
) => {
  return useQuery({
    queryKey: ['refund-transactions', dateFrom, dateTo, customerId],
    queryFn: async () => {
      let query = supabase
        .from('refund_transactions')
        .select(`
          *,
          return:returns(*),
          sale:sales(*),
          customer:customers(*)
        `)
        .order('transaction_date', { ascending: false })
      
      if (dateFrom) query = query.gte('transaction_date', dateFrom)
      if (dateTo) query = query.lte('transaction_date', dateTo)
      if (customerId) query = query.eq('customer_id', customerId)
      
      const { data, error } = await query
      
      if (error) throw error
      return data as RefundTransaction[]
    }
  })
}

// Get return statistics
export const useReturnStatistics = (dateFrom?: string, dateTo?: string) => {
  return useQuery({
    queryKey: ['return-statistics', dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from('returns')
        .select('refund_amount, return_status, return_date')
      
      if (dateFrom) query = query.gte('return_date', dateFrom)
      if (dateTo) query = query.lte('return_date', dateTo)
      
      const { data, error } = await query
      
      if (error) throw error
      
      const stats = {
        totalReturns: data.length,
        totalRefundAmount: data.reduce((sum, ret) => sum + ret.refund_amount, 0),
        completedReturns: data.filter(ret => ret.return_status === 'completed').length,
        pendingReturns: data.filter(ret => ret.return_status === 'pending').length,
        averageRefundAmount: data.length > 0 ? data.reduce((sum, ret) => sum + ret.refund_amount, 0) / data.length : 0
      }
      
      return stats
    }
  })
}

// Get returns by customer
export const useCustomerReturns = (customerId: string) => {
  return useQuery({
    queryKey: ['customer-returns', customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('returns')
        .select(`
          *,
          sale:sales(*),
          return_items:return_items(
            *,
            product:products(*)
          )
        `)
        .eq('customer_id', customerId)
        .order('return_date', { ascending: false })
      
      if (error) throw error
      return data as Return[]
    },
    enabled: !!customerId
  })
}

// Get returns for a specific sale
export const useSaleReturns = (saleId: string) => {
  return useQuery({
    queryKey: ['sale-returns', saleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('returns')
        .select(`
          *,
          customer:customers(*),
          return_items:return_items(
            *,
            product:products(*),
            sale_item:sale_items(*)
          )
        `)
        .eq('sale_id', saleId)
        .order('return_date', { ascending: false })
      
      if (error) throw error
      return data as Return[]
    },
    enabled: !!saleId
  })
}