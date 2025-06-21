import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, BnplTransaction } from '../lib/supabase'
import toast from 'react-hot-toast'

export const useBnplTransactions = (customerId?: string, status?: string) => {
  return useQuery({
    queryKey: ['bnpl-transactions', customerId, status],
    queryFn: async () => {
      let query = supabase
        .from('bnpl_transactions')
        .select(`
          *,
          sale:sales(*),
          customer:customers(*)
        `)
        .order('created_at', { ascending: false })
      
      if (customerId) query = query.eq('customer_id', customerId)
      if (status) query = query.eq('status', status)
      
      const { data, error } = await query
      
      if (error) throw error
      return data as BnplTransaction[]
    }
  })
}

export const useProcessBnplPayment = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ 
      bnplId, 
      paymentAmount, 
      paymentMethod, 
      processedBy 
    }: { 
      bnplId: string; 
      paymentAmount: number;
      paymentMethod: string;
      processedBy: string;
    }) => {
      const { error } = await supabase.rpc('process_bnpl_payment', {
        p_bnpl_id: bnplId,
        p_payment_amount: paymentAmount,
        p_payment_method: paymentMethod,
        p_processed_by: processedBy
      })
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bnpl-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['customer-financial-summary'] })
      queryClient.invalidateQueries({ queryKey: ['bnpl-payment-history'] })
      toast.success('Payment processed successfully')
    },
    onError: (error) => {
      toast.error('Failed to process payment: ' + error.message)
    }
  })
}

export const useOverdueBnplTransactions = () => {
  return useQuery({
    queryKey: ['overdue-bnpl-transactions'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      
      const { data, error } = await supabase
        .from('bnpl_transactions')
        .select(`
          *,
          sale:sales(*),
          customer:customers(*)
        `)
        .in('status', ['pending', 'partially_paid'])
        .lt('due_date', today)
        .order('due_date', { ascending: true })
      
      if (error) throw error
      
      // Update status to overdue for these transactions
      if (data.length > 0) {
        const overdueIds = data.map(t => t.id)
        await supabase
          .from('bnpl_transactions')
          .update({ status: 'overdue' })
          .in('id', overdueIds)
      }
      
      return data as BnplTransaction[]
    }
  })
}

// New hook for BNPL payment history
export const useBnplPaymentHistory = (bnplId: string) => {
  return useQuery({
    queryKey: ['bnpl-payment-history', bnplId],
    queryFn: async () => {
      if (!bnplId) return { transaction: null, payments: [] }
      
      const { data, error } = await supabase.rpc('get_bnpl_payment_history', {
        p_bnpl_id: bnplId
      })
      
      if (error) throw error
      
      return {
        transaction: data[0]?.transaction_json || null,
        payments: data[0]?.payments_json || []
      }
    },
    enabled: !!bnplId
  })
}