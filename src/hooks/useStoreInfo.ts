import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

interface StoreInfo {
  id: string
  store_name: string
  address?: string
  phone?: string
  email?: string
  ntn?: string
  logo_url?: string
  currency: string
  timezone: string
  receipt_footer?: string
  fbr_enabled: boolean
  pos_id?: string
  created_at: string
  updated_at: string
}

export const useStoreInfo = () => {
  return useQuery({
    queryKey: ['store-info'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('store_info')
        .select('*')
        .single()
      
      if (error) throw error
      return data as StoreInfo
    }
  })
}

export const useUpdateStoreInfo = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (storeInfo: Partial<StoreInfo>) => {
      const { data, error } = await supabase
        .from('store_info')
        .update({ ...storeInfo, updated_at: new Date().toISOString() })
        .eq('id', (await supabase.from('store_info').select('id').single()).data?.id)
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-info'] })
      toast.success('Store information updated successfully')
    },
    onError: (error) => {
      toast.error('Failed to update store information: ' + error.message)
    }
  })
}