import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, Settings } from '../lib/supabase'
import toast from 'react-hot-toast'

export const useSettings = () => {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .order('category')
      
      if (error) throw error
      return data as Settings[]
    }
  })
}

export const useUpdateSetting = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { data, error } = await supabase
        .from('settings')
        .update({ value, updated_at: new Date().toISOString() })
        .eq('key', key)
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast.success('Settings updated successfully')
    },
    onError: (error) => {
      toast.error('Failed to update settings: ' + error.message)
    }
  })
}