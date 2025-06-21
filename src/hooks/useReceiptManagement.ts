import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

interface ReceiptSearchParams {
  searchTerm?: string
  startDate?: string
  endDate?: string
  customerName?: string
  paymentMethod?: string
  paymentStatus?: string
  limit?: number
}

interface ReceiptSearchResult {
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
  receipt_printed: boolean
  receipt_printed_at?: string
  items_count: number
  reprint_count: number
}

interface ReceiptForReprint {
  sale_id: string
  receipt_number: string
  invoice_number: string
  sale_date: string
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
  notes?: string
  items: Array<{
    name: string
    quantity: number
    unit_price: number
    discount_amount: number
    total_price: number
  }>
  reprint_history: Array<{
    reprint_date: string
    reprinted_by: string
    reason: string
    auth_code: string
  }>
}

interface ReceiptAuditLog {
  receipt_number: string
  invoice_number: string
  original_sale_date: string
  customer_name?: string
  reprint_date: string
  reprinted_by: string
  reprint_reason: string
  reprint_auth_code: string
  user_ip?: string
  reprint_count_for_receipt: number
}

interface ReceiptStatistics {
  total_receipts: number
  printed_receipts: number
  reprinted_receipts: number
  total_reprints: number
  unique_users_reprinting: number
  most_reprinted_receipt?: string
  max_reprint_count: number
}

export const useReceiptSearch = (params: ReceiptSearchParams) => {
  return useQuery({
    queryKey: ['receipt-search', params],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_receipts', {
        p_search_term: params.searchTerm || null,
        p_start_date: params.startDate || null,
        p_end_date: params.endDate || null,
        p_customer_name: params.customerName || null,
        p_payment_method: params.paymentMethod || null,
        p_payment_status: params.paymentStatus || null,
        p_limit: params.limit || 50
      })
      
      if (error) throw error
      return data as ReceiptSearchResult[]
    },
    enabled: !!(params.searchTerm || params.startDate || params.endDate || params.customerName)
  })
}

export const useReceiptForReprint = (receiptNumber: string) => {
  return useQuery({
    queryKey: ['receipt-for-reprint', receiptNumber],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_receipt_for_reprint', {
        p_receipt_number: receiptNumber
      })
      
      if (error) throw error
      return data[0] as ReceiptForReprint
    },
    enabled: !!receiptNumber
  })
}

export const useLogReceiptReprint = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({
      saleId,
      receiptNumber,
      reprintedBy,
      reason = 'Customer request'
    }: {
      saleId: string
      receiptNumber: string
      reprintedBy: string
      reason?: string
    }) => {
      // Get user IP (in a real app, this would be handled server-side)
      const userAgent = navigator.userAgent
      
      const { data, error } = await supabase.rpc('log_receipt_reprint', {
        p_sale_id: saleId,
        p_receipt_number: receiptNumber,
        p_reprinted_by: reprintedBy,
        p_reason: reason,
        p_user_ip: null, // Would be set server-side
        p_user_agent: userAgent
      })
      
      if (error) throw error
      return data as string // Returns auth code
    },
    onSuccess: (authCode, variables) => {
      queryClient.invalidateQueries({ queryKey: ['receipt-search'] })
      queryClient.invalidateQueries({ queryKey: ['receipt-for-reprint', variables.receiptNumber] })
      queryClient.invalidateQueries({ queryKey: ['receipt-audit-log'] })
      queryClient.invalidateQueries({ queryKey: ['receipt-statistics'] })
      toast.success(`Receipt reprint logged. Auth code: ${authCode}`)
    },
    onError: (error) => {
      toast.error('Failed to log receipt reprint: ' + error.message)
    }
  })
}

export const useReceiptAuditLog = (
  receiptNumber?: string,
  startDate?: string,
  endDate?: string,
  reprintedBy?: string
) => {
  return useQuery({
    queryKey: ['receipt-audit-log', receiptNumber, startDate, endDate, reprintedBy],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_receipt_audit_log', {
        p_receipt_number: receiptNumber || null,
        p_start_date: startDate || null,
        p_end_date: endDate || null,
        p_reprinted_by: reprintedBy || null
      })
      
      if (error) throw error
      return data as ReceiptAuditLog[]
    }
  })
}

export const useReceiptStatistics = (startDate?: string, endDate?: string) => {
  return useQuery({
    queryKey: ['receipt-statistics', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_receipt_statistics', {
        p_start_date: startDate || null,
        p_end_date: endDate || null
      })
      
      if (error) throw error
      return data[0] as ReceiptStatistics
    }
  })
}

export const useValidateReceiptAccess = () => {
  return useMutation({
    mutationFn: async ({ receiptNumber, userRole = 'user' }: { receiptNumber: string; userRole?: string }) => {
      const { data, error } = await supabase.rpc('validate_receipt_access', {
        p_receipt_number: receiptNumber,
        p_user_role: userRole
      })
      
      if (error) throw error
      return data as boolean
    }
  })
}

// Quick receipt lookup hook
export const useReceiptLookup = () => {
  return useQuery({
    queryKey: ['receipt-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receipt_lookup')
        .select('*')
        .order('sale_date', { ascending: false })
        .limit(100)
      
      if (error) throw error
      return data
    }
  })
}