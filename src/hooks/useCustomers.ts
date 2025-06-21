import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, Customer } from '../lib/supabase'
import toast from 'react-hot-toast'

export const useCustomers = () => {
  return useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data as Customer[]
    }
  })
}

export const useCreateCustomer = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (customer: Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'total_outstanding_dues' | 'available_credit'>) => {
      const customerData = {
        ...customer,
        total_outstanding_dues: 0,
        available_credit: customer.credit_limit
      }
      
      const { data, error } = await supabase
        .from('customers')
        .insert([customerData])
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      toast.success('Customer created successfully')
    },
    onError: (error) => {
      toast.error('Failed to create customer: ' + error.message)
    }
  })
}

export const useUpdateCustomer = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Customer> & { id: string }) => {
      // If credit_limit is being updated, recalculate available_credit
      if (updates.credit_limit !== undefined) {
        const { data: currentCustomer } = await supabase
          .from('customers')
          .select('total_outstanding_dues')
          .eq('id', id)
          .single()
        
        if (currentCustomer) {
          updates.available_credit = updates.credit_limit - currentCustomer.total_outstanding_dues
        }
      }
      
      const { data, error } = await supabase
        .from('customers')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      toast.success('Customer updated successfully')
    },
    onError: (error) => {
      toast.error('Failed to update customer: ' + error.message)
    }
  })
}

export const useDeleteCustomer = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('customers')
        .update({ is_active: false })
        .eq('id', id)
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      toast.success('Customer deleted successfully')
    },
    onError: (error) => {
      toast.error('Failed to delete customer: ' + error.message)
    }
  })
}

export const useCustomerFinancialSummary = () => {
  return useQuery({
    queryKey: ['customer-financial-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_customer_financial_summary')
      
      if (error) throw error
      return data[0]
    }
  })
}