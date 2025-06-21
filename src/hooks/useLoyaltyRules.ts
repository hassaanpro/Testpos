import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, LoyaltyRule } from '../lib/supabase'
import toast from 'react-hot-toast'

export const useLoyaltyRules = () => {
  return useQuery({
    queryKey: ['loyalty-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loyalty_rules')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data as LoyaltyRule[]
    }
  })
}

export const useActiveLoyaltyRule = () => {
  return useQuery({
    queryKey: ['active-loyalty-rule'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loyalty_rules')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      
      if (error && error.code !== 'PGRST116') throw error
      return data as LoyaltyRule | null
    }
  })
}

export const useCreateLoyaltyRule = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (rule: Omit<LoyaltyRule, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('loyalty_rules')
        .insert([rule])
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty-rules'] })
      queryClient.invalidateQueries({ queryKey: ['active-loyalty-rule'] })
      toast.success('Loyalty rule created successfully')
    },
    onError: (error) => {
      toast.error('Failed to create loyalty rule: ' + error.message)
    }
  })
}

export const useUpdateLoyaltyRule = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<LoyaltyRule> & { id: string }) => {
      const { data, error } = await supabase
        .from('loyalty_rules')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty-rules'] })
      queryClient.invalidateQueries({ queryKey: ['active-loyalty-rule'] })
      toast.success('Loyalty rule updated successfully')
    },
    onError: (error) => {
      toast.error('Failed to update loyalty rule: ' + error.message)
    }
  })
}