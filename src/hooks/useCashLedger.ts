import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

interface CashTransaction {
  id: string
  transaction_type: string
  amount: number
  description: string
  reference_id?: string
  transaction_date: string
  created_at: string
}

export const useCashLedger = (dateFrom?: string, dateTo?: string) => {
  return useQuery({
    queryKey: ['cash-ledger', dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from('cash_ledger')
        .select('*')
        .order('transaction_date', { ascending: false })
      
      if (dateFrom) query = query.gte('transaction_date', dateFrom)
      if (dateTo) query = query.lte('transaction_date', dateTo)
      
      const { data, error } = await query
      
      if (error) throw error
      return data as CashTransaction[]
    }
  })
}

export const useCreateCashTransaction = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (transaction: Omit<CashTransaction, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('cash_ledger')
        .insert([transaction])
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-ledger'] })
      toast.success('Cash transaction added successfully')
    },
    onError: (error) => {
      toast.error('Failed to add cash transaction: ' + error.message)
    }
  })
}