import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, Expense } from '../lib/supabase'
import toast from 'react-hot-toast'

export const useExpenses = (dateFrom?: string, dateTo?: string) => {
  return useQuery({
    queryKey: ['expenses', dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false })
      
      if (dateFrom) query = query.gte('expense_date', dateFrom)
      if (dateTo) query = query.lte('expense_date', dateTo)
      
      const { data, error } = await query
      
      if (error) throw error
      return data as Expense[]
    }
  })
}

export const useCreateExpense = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (expense: Omit<Expense, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('expenses')
        .insert([expense])
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      toast.success('Expense added successfully')
    },
    onError: (error) => {
      toast.error('Failed to add expense: ' + error.message)
    }
  })
}